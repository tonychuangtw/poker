/* 記帳分析：標籤彙總 / 月報 / 傾斜偵測（純邏輯，Node 可測） */
(function (global) {
  'use strict';

  function plOf(r) { return r.cashout - r.buyin; }

  function byDate(list) {
    return list.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 :
        ((a.id || '') < (b.id || '') ? -1 : 1);
    });
  }

  /**
   * 場地/系列標籤彙總。分組 key：tag（無 tag 的舊紀錄退回 venue，再無則歸「未標籤」）。
   * @returns {{tag:string,n:number,pl:number,hours:number,hourly:number|null}[]} 依總盈虧由高到低
   */
  function tagStats(list) {
    var map = {};
    list.forEach(function (r) {
      var key = (r.tag || '').trim() || (r.venue || '').trim() || t('未標籤');
      if (!map[key]) map[key] = { tag: key, n: 0, pl: 0, hours: 0, hourPl: 0 };
      var g = map[key];
      g.n++;
      g.pl += plOf(r);
      if (r.hours > 0) { g.hours += r.hours; g.hourPl += plOf(r); }
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      return { tag: g.tag, n: g.n, pl: g.pl, hours: g.hours,
               hourly: g.hours > 0 ? g.hourPl / g.hours : null };
    }).sort(function (a, b) { return b.pl - a.pl; });
  }

  /**
   * 月報：每月盈虧 / 場次 / 時數。
   * @returns {{month:string,n:number,pl:number,hours:number}[]} 依月份由舊到新
   */
  function monthlyStats(list) {
    var map = {};
    list.forEach(function (r) {
      var m = String(r.date || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) m = t('未知');
      if (!map[m]) map[m] = { month: m, n: 0, pl: 0, hours: 0 };
      map[m].n++;
      map[m].pl += plOf(r);
      if (r.hours > 0) map[m].hours += r.hours;
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  /**
   * 傾斜偵測：比較「緊接在輸錢場次之後」的平均表現 vs 整體平均，並找最長連敗。
   * @returns {{n:number,overallAvg:number,afterLossAvg:number|null,
   *            afterLossCount:number,longestLossStreak:number}}
   */
  function tiltStats(list) {
    var ordered = byDate(list);
    var pls = ordered.map(plOf);
    var n = pls.length;
    var sum = pls.reduce(function (a, b) { return a + b; }, 0);
    var afterSum = 0, afterN = 0;
    var streak = 0, longest = 0;
    pls.forEach(function (p, i) {
      if (i > 0 && pls[i - 1] < 0) { afterSum += p; afterN++; }
      if (p < 0) { streak++; if (streak > longest) longest = streak; }
      else streak = 0;
    });
    return {
      n: n,
      overallAvg: n ? sum / n : 0,
      afterLossAvg: afterN ? afterSum / afterN : null,
      afterLossCount: afterN,
      longestLossStreak: longest
    };
  }

  /**
   * 行為標籤彙總（2026-08-11，參考 ivey 的行為觀察）。
   * rec.mood = ['狀態好', ...]（canonical zh-TW 字串，顯示端再翻譯）。
   * @returns {{tag:string,n:number,pl:number,avg:number}[]} 依平均盈虧由高到低
   */
  function moodStats(list) {
    var map = {};
    list.forEach(function (r) {
      (r.mood || []).forEach(function (m) {
        if (!map[m]) map[m] = { tag: m, n: 0, pl: 0 };
        map[m].n++;
        map[m].pl += plOf(r);
      });
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      return { tag: g.tag, n: g.n, pl: g.pl, avg: g.pl / g.n };
    }).sort(function (a, b) { return b.avg - a.avg; });
  }

  /**
   * 規則型洞察（不用 AI）：回傳結構化事實，文案由 UI 層組（i18n）。
   * 每條都要兩側樣本數達 minN（預設 5）才產生，避免小樣本瞎掰。
   * @returns {Array<{k:string, a:number, b:number, an:number, bn:number, name?:string}>}
   *   k='weekday'：a=平日平均, b=週末平均；k='venue-best'/'venue-worst'：name=場地, a=平均, an=場次；
   *   k='duration'：a=短場(≤中位數)平均, b=長場平均；k='mood'：name=標籤, a=有標平均, b=整體平均
   */
  function insights(list, minN) {
    minN = minN || 5;
    var out = [];
    var pls = list.map(plOf);
    var overallAvg = pls.length ? pls.reduce(function (x, y) { return x + y; }, 0) / pls.length : 0;

    /* 平日 vs 週末（六日） */
    var wk = [], we = [];
    list.forEach(function (r) {
      var d = new Date(r.date + 'T12:00:00Z').getUTCDay();
      (d === 0 || d === 6 ? we : wk).push(plOf(r));
    });
    function avg(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
    if (wk.length >= minN && we.length >= minN) {
      out.push({ k: 'weekday', a: avg(wk), b: avg(we), an: wk.length, bn: we.length });
    }

    /* 場地最賺 / 最虧 */
    var vm = {};
    list.forEach(function (r) {
      var v = (r.venue || '').trim();
      if (!v) return;
      (vm[v] = vm[v] || []).push(plOf(r));
    });
    var vs = Object.keys(vm).filter(function (v) { return vm[v].length >= minN; })
      .map(function (v) { return { name: v, a: avg(vm[v]), an: vm[v].length }; })
      .sort(function (x, y) { return y.a - x.a; });
    if (vs.length >= 2) {
      if (vs[0].a > 0) out.push({ k: 'venue-best', name: vs[0].name, a: vs[0].a, an: vs[0].an });
      var worst = vs[vs.length - 1];
      if (worst.a < 0) out.push({ k: 'venue-worst', name: worst.name, a: worst.a, an: worst.an });
    }

    /* 時長：以有填時數場次的中位數分短/長 */
    var timed = list.filter(function (r) { return r.hours > 0; });
    if (timed.length >= minN * 2) {
      var hrs = timed.map(function (r) { return r.hours; }).sort(function (x, y) { return x - y; });
      var med = hrs[Math.floor(hrs.length / 2)];
      var shortS = [], longS = [];
      timed.forEach(function (r) { (r.hours <= med ? shortS : longS).push(plOf(r)); });
      if (shortS.length >= minN && longS.length >= minN) {
        out.push({ k: 'duration', a: avg(shortS), b: avg(longS), an: shortS.length, bn: longS.length, med: med });
      }
    }

    /* 現場 vs 線上（無 arena 的舊紀錄視為現場） */
    var lv = [], ol = [];
    list.forEach(function (r) {
      ((r.arena || 'live') === 'online' ? ol : lv).push(plOf(r));
    });
    if (lv.length >= minN && ol.length >= minN) {
      out.push({ k: 'arena', a: avg(lv), b: avg(ol), an: lv.length, bn: ol.length });
    }

    /* 行為標籤 vs 整體 */
    moodStats(list).forEach(function (m) {
      if (m.n >= minN && list.length - m.n >= minN) {
        out.push({ k: 'mood', name: m.tag, a: m.avg, b: overallAvg, an: m.n });
      }
    });

    return out;
  }

  /**
   * 統計磚摘要（2026-08-14）：總場次/總盈虧/平均/勝率/ROI/時數/每小時損益。
   * 勝率＝盈虧 > 0 的場次比例；ROI＝總盈虧/總買入；每小時損益只算有填時數的場次。
   * @returns {{n:number,pl:number,buyin:number,avg:number,winRate:number|null,
   *            roi:number|null,hours:number,hourly:number|null}}
   */
  function summary(list) {
    var n = list.length, pl = 0, buyin = 0, wins = 0, hours = 0, hourPl = 0;
    list.forEach(function (r) {
      var p = plOf(r);
      pl += p;
      buyin += r.buyin;
      if (p > 0) wins++;
      if (r.hours > 0) { hours += r.hours; hourPl += p; }
    });
    return {
      n: n, pl: pl, buyin: buyin,
      avg: n ? pl / n : 0,
      winRate: n ? wins / n * 100 : null,
      roi: buyin > 0 ? pl / buyin * 100 : null,
      hours: hours,
      hourly: hours > 0 ? hourPl / hours : null
    };
  }

  var TrackerStats = { tagStats: tagStats, monthlyStats: monthlyStats, tiltStats: tiltStats,
    moodStats: moodStats, insights: insights, summary: summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = TrackerStats;
  else global.TrackerStats = TrackerStats;
})(typeof window !== 'undefined' ? window : this);
