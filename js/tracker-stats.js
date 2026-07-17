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
      var key = (r.tag || '').trim() || (r.venue || '').trim() || '未標籤';
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
      if (!/^\d{4}-\d{2}$/.test(m)) m = '未知';
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

  var TrackerStats = { tagStats: tagStats, monthlyStats: monthlyStats, tiltStats: tiltStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = TrackerStats;
  else global.TrackerStats = TrackerStats;
})(typeof window !== 'undefined' ? window : this);
