/* 錦標賽 Push/Fold $EV 決策（單一指定跟注者模型）
 *
 * 設計假設（UI 也會顯示摘要）：
 * 1. Range 排名採「對隨機手牌 equity」（equity-vs-random，非 Sklansky-Chubukov），
 *    由 js/preflop-table.js 的 ORDER 提供；「top X%」= 依排名累加 combo 數
 *    （對子 6 / 同花 4 / 雜色 12）直到 >= X% × 1326，整個類別一起納入。
 * 2. 只考慮一位「指定跟注者」，其他玩家假設全部蓋牌。
 * 3. Hero 對 range 的 equity 用預算好的 169×169 類別表加權平均；
 *    hero 手牌的 blocker 只影響 range combo 計數（P(跟注)），
 *    不影響類別層級 equity（誤差極小）。
 * 4. Fold EV = ICM(hero 籌碼 − hero 本手盲注/前注，其他人不變)。
 *    忽略該手盲注在其他玩家間的轉移。
 * 5. 全蓋 EV = ICM(hero + 全部盲注前注 − 自付部分；跟注者 − 其盲注；其他人不變)。
 * 6. 被跟注：雙方以「較小總籌碼」全下（有效籌碼），非盲注玩家的前注視為死錢歸勝者；
 *    平手不另外處理，已按 equity = 勝 + 平/2 折算。
 * 7. 有人籌碼歸零時，按剩餘人數的完賽名次領對應獎金（若獎金結構有給）。
 */
(function (global) {
  'use strict';

  var ICM = (typeof module !== 'undefined' && module.exports)
    ? require('./icm.js') : global.ICM;
  var Table = (typeof module !== 'undefined' && module.exports)
    ? require('./preflop-table.js') : global.PreflopTable;

  var RANK_CHARS = 'AKQJT98765432'; // grid row/col 0=A ... 12=2
  var SUIT_CHARS = 'cdhs';
  var TOTAL_COMBOS = 1326;

  /* ---------- 類別索引與 combo ---------- */

  function classLabel(idx) {
    var r = Math.floor(idx / 13), c = idx % 13;
    if (r === c) return RANK_CHARS[r] + RANK_CHARS[r];
    return r < c ? RANK_CHARS[r] + RANK_CHARS[c] + 's'
                 : RANK_CHARS[c] + RANK_CHARS[r] + 'o';
  }

  function comboCount(idx) {
    var r = Math.floor(idx / 13), c = idx % 13;
    return r === c ? 6 : r < c ? 4 : 12;
  }

  // 由兩張 card int（evaluator.js 格式 (rank<<2)|suit）求類別索引
  function classIndexFromCards(a, b) {
    var ra = a >> 2, rb = b >> 2;
    var hi = ra > rb ? ra : rb, lo = ra > rb ? rb : ra;
    var suited = (a & 3) === (b & 3);
    var rh = 14 - hi, rl = 14 - lo;
    if (hi === lo) return rh * 13 + rh;
    return suited ? rh * 13 + rl : rl * 13 + rh;
  }

  // 展開某類別的所有 combo（card int pair 陣列）
  function expandCombos(idx) {
    var r = Math.floor(idx / 13), c = idx % 13;
    var out = [], s1, s2;
    if (r === c) { // 對子
      var rank = 14 - r;
      for (s1 = 0; s1 < 4; s1++) for (s2 = s1 + 1; s2 < 4; s2++)
        out.push([(rank << 2) | s1, (rank << 2) | s2]);
    } else {
      var hi = 14 - Math.min(r, c), lo = 14 - Math.max(r, c);
      if (r < c) { // 同花
        for (s1 = 0; s1 < 4; s1++) out.push([(hi << 2) | s1, (lo << 2) | s1]);
      } else { // 雜色
        for (s1 = 0; s1 < 4; s1++) for (s2 = 0; s2 < 4; s2++)
          if (s1 !== s2) out.push([(hi << 2) | s1, (lo << 2) | s2]);
      }
    }
    return out;
  }

  // 排除 blocked cards 後，該類別剩餘 combo 數
  function combosAvailable(idx, blocked) {
    var combos = expandCombos(idx), n = 0;
    for (var i = 0; i < combos.length; i++) {
      var a = combos[i][0], b = combos[i][1], hit = false;
      for (var j = 0; j < blocked.length; j++) {
        if (blocked[j] === a || blocked[j] === b) { hit = true; break; }
      }
      if (!hit) n++;
    }
    return n;
  }

  /* ---------- 手牌解析 ----------
   * 接受: "AA" / "A5s" / "KQo"（類別）或 "AhKs"（指定兩張牌）
   * 類別輸入時取代表 combo（同花→兩張黑桃；對子/雜色→黑桃+紅心）供 blocker 計數。 */
  function parseHand(str) {
    if (typeof str !== 'string') throw new Error('請輸入手牌');
    var s = str.trim();
    var m4 = /^([2-9TJQKA])([SHDC])([2-9TJQKA])([SHDC])$/i.exec(s);
    if (m4) {
      var c1 = rankVal(m4[1]) << 2 | SUIT_CHARS.indexOf(m4[2].toLowerCase());
      var c2 = rankVal(m4[3]) << 2 | SUIT_CHARS.indexOf(m4[4].toLowerCase());
      if (c1 === c2) throw new Error('兩張牌不能相同');
      return { classIdx: classIndexFromCards(c1, c2), cards: [c1, c2], label: classLabel(classIndexFromCards(c1, c2)) };
    }
    var mC = /^([2-9TJQKA])([2-9TJQKA])([SO])?$/i.exec(s);
    if (!mC) throw new Error('手牌格式錯誤（例：A5s、TT、AKo 或 AhKs）');
    var hi = rankVal(mC[1]), lo = rankVal(mC[2]);
    if (hi < lo) { var t = hi; hi = lo; lo = t; }
    var suf = mC[3] ? mC[3].toLowerCase() : '';
    var idx, cards;
    if (hi === lo) {
      if (suf === 's') throw new Error('對子沒有同花');
      idx = (14 - hi) * 13 + (14 - hi);
      cards = [(hi << 2) | 3, (hi << 2) | 2]; // 黑桃 + 紅心
    } else if (suf === 's') {
      idx = (14 - hi) * 13 + (14 - lo);
      cards = [(hi << 2) | 3, (lo << 2) | 3]; // 兩張黑桃
    } else if (suf === 'o') {
      idx = (14 - lo) * 13 + (14 - hi);
      cards = [(hi << 2) | 3, (lo << 2) | 2];
    } else {
      throw new Error('非對子請註明 s（同花）或 o（雜色），例：A5s / AKo');
    }
    return { classIdx: idx, cards: cards, label: classLabel(idx) };
  }
  function rankVal(ch) { return 14 - RANK_CHARS.indexOf(ch.toUpperCase()); }

  /* ---------- Top X% range ---------- */
  function topPercentRange(pct) {
    if (!(pct > 0)) return [];
    var target = Math.min(pct, 100) / 100 * TOTAL_COMBOS;
    var out = [], cum = 0;
    for (var i = 0; i < Table.ORDER.length; i++) {
      if (cum >= target) break;
      var idx = Table.ORDER[i];
      out.push(idx);
      cum += comboCount(idx);
    }
    return out;
  }

  /* ---------- Hero 對 range 的 equity（combo 加權表查詢） ---------- */
  function equityVsRange(heroClassIdx, heroCards, rangeClasses) {
    var wSum = 0, nSum = 0;
    for (var i = 0; i < rangeClasses.length; i++) {
      var v = rangeClasses[i];
      var avail = combosAvailable(v, heroCards);
      if (avail <= 0) continue;
      wSum += avail * Table.EQ[heroClassIdx * 169 + v] / 1000;
      nSum += avail;
    }
    return { equity: nSum > 0 ? wSum / nSum : 0, combos: nSum };
  }

  /* ---------- ICM（允許 0 籌碼 = 已出局，領完賽名次獎金） ---------- */
  function icmEVWithBusts(stacks, payouts) {
    var n = stacks.length;
    var alive = [], aliveIdx = [], busted = [];
    for (var i = 0; i < n; i++) {
      if (stacks[i] > 0) { alive.push(stacks[i]); aliveIdx.push(i); }
      else busted.push(i);
    }
    var ev = new Array(n).fill(0);
    if (alive.length >= 2) {
      var aliveEV = ICM.icmEV(alive, payouts.slice(0, Math.min(payouts.length, alive.length)));
      for (i = 0; i < aliveIdx.length; i++) ev[aliveIdx[i]] = aliveEV[i];
    } else if (alive.length === 1) {
      ev[aliveIdx[0]] = payouts[0] || 0;
    }
    // 出局者佔第 alive+1 .. n 名，均分該區間獎金（本工具最多同時 1 人出局）
    if (busted.length) {
      var pot = 0;
      for (i = alive.length; i < n; i++) pot += payouts[i] || 0;
      var share = pot / busted.length;
      for (i = 0; i < busted.length; i++) ev[busted[i]] = share;
    }
    return ev;
  }

  /* ---------- 主計算 ----------
   * opts: {
   *   stacks: number[]           各玩家本手開始前總籌碼（未扣盲注）
   *   payouts: number[]          獎金結構
   *   heroIdx, callerIdx: number 索引（不可相同）
   *   hand: string               hero 手牌（"A5s" / "AhKs"）
   *   callPct: number            跟注 range（top X%）
   *   sb, bb, ante: number       盲注與每人前注
   *   heroPos, callerPos: 'sb'|'bb'|'other'
   * } */
  function computeShoveEV(opts) {
    var stacks = opts.stacks, payouts = opts.payouts;
    var h = opts.heroIdx, cl = opts.callerIdx;
    var n = stacks.length;
    if (h === cl) throw new Error('Hero 與跟注者不能是同一人');
    if (n < 2) throw new Error('至少 2 位玩家');
    var sb = opts.sb || 0, bb = opts.bb || 0, ante = opts.ante || 0;
    var hand = parseHand(opts.hand);

    function posCost(pos) { return (pos === 'sb' ? sb : pos === 'bb' ? bb : 0) + ante; }
    var heroCost = Math.min(posCost(opts.heroPos), stacks[h]);
    var callerCost = Math.min(posCost(opts.callerPos), stacks[cl]);
    var potAll = sb + bb + ante * n; // 本手全部強制注
    var deadOther = Math.max(0, potAll - heroCost - callerCost); // 其他人的死錢

    // range 與 equity
    var range = topPercentRange(opts.callPct);
    var availInRange = 0;
    for (var i = 0; i < range.length; i++) availInRange += combosAvailable(range[i], hand.cards);
    var totalAvail = 1225; // C(50,2)，扣掉 hero 兩張後
    var pCall = Math.min(1, availInRange / totalAvail);
    var eqRes = equityVsRange(hand.classIdx, hand.cards, range);
    var eq = eqRes.equity;

    // 情境 1：hero 蓋牌
    var foldStacks = stacks.slice();
    foldStacks[h] = Math.max(0, stacks[h] - heroCost);
    var foldEV = icmEVWithBusts(foldStacks, payouts)[h];

    // 情境 2：全下、全蓋 → hero 淨贏 potAll − 自付
    var afStacks = stacks.slice();
    afStacks[h] = stacks[h] + (potAll - heroCost);
    afStacks[cl] = Math.max(0, stacks[cl] - callerCost);
    var evAllFold = icmEVWithBusts(afStacks, payouts)[h];

    // 情境 3：被跟注 → 有效籌碼全下
    var eff = Math.min(stacks[h], stacks[cl]);
    var winStacks = stacks.slice();
    winStacks[h] = stacks[h] + eff + deadOther;
    winStacks[cl] = stacks[cl] - eff;
    var evWin = icmEVWithBusts(winStacks, payouts)[h];

    var loseStacks = stacks.slice();
    loseStacks[h] = stacks[h] - eff;
    loseStacks[cl] = stacks[cl] + eff + deadOther;
    var evLose = icmEVWithBusts(loseStacks, payouts)[h];

    var shoveEV = (1 - pCall) * evAllFold + pCall * (eq * evWin + (1 - eq) * evLose);

    return {
      hand: hand.label,
      handClassIdx: hand.classIdx,
      rangeClasses: range,
      rangeCombos: availInRange,
      pCall: pCall,
      equity: eq,
      foldEV: foldEV,
      shoveEV: shoveEV,
      evAllFold: evAllFold,
      evWin: evWin,
      evLose: evLose,
      diff: shoveEV - foldEV,
      verdict: shoveEV >= foldEV ? 'SHOVE' : 'FOLD'
    };
  }

  /* ---------- Range vs range 翻前勝率（combo 加權、忽略 blocker） ---------- */
  function rangeVsRange(pctA, pctB) {
    var A = topPercentRange(pctA), B = topPercentRange(pctB);
    if (!A.length || !B.length) throw new Error('range 百分比需大於 0');
    var wSum = 0, eqSum = 0;
    for (var i = 0; i < A.length; i++) {
      var a = A[i], ca = comboCount(a);
      for (var j = 0; j < B.length; j++) {
        var b = B[j], w = ca * comboCount(b);
        wSum += w;
        eqSum += w * Table.EQ[a * 169 + b] / 1000;
      }
    }
    var combosA = A.reduce(function (s, x) { return s + comboCount(x); }, 0);
    var combosB = B.reduce(function (s, x) { return s + comboCount(x); }, 0);
    return {
      equityA: eqSum / wSum,
      classesA: A.length, classesB: B.length,
      combosA: combosA, combosB: combosB
    };
  }

  /* ---------- Range 記號展開："77+"、"A9s+"、"KQo"、"T9s"、"88-22"、"A5s-A2s" → 類別 index 陣列 ---------- */
  function rangeFromNotation(str) {
    var out = {}, parts = String(str).trim().split(/[\s,]+/);
    parts.forEach(function (tok) {
      if (!tok) return;
      // 區間記號："88-22"（對子區間）或 "A9s-A6s"（同高牌、同 s/o 的 kicker 區間）
      var md = /^([2-9TJQKA])([2-9TJQKA])(s|o)?-([2-9TJQKA])([2-9TJQKA])(s|o)?$/i.exec(tok);
      if (md) {
        var a1 = RANK_CHARS.indexOf(md[1].toUpperCase()),
            a2 = RANK_CHARS.indexOf(md[2].toUpperCase()),
            b1 = RANK_CHARS.indexOf(md[4].toUpperCase()),
            b2 = RANK_CHARS.indexOf(md[5].toUpperCase());
        var sufA = md[3] ? md[3].toLowerCase() : '',
            sufB = md[6] ? md[6].toLowerCase() : '';
        if (a1 === a2 && b1 === b2) { // 對子區間
          if (sufA || sufB) throw new Error('range 記號錯誤：' + tok);
          var pHi = Math.min(a1, b1), pLo = Math.max(a1, b1);
          for (var pp = pHi; pp <= pLo; pp++) out[pp * 13 + pp] = true;
          return;
        }
        if (a1 === a2 || b1 === b2 || !sufA || sufA !== sufB)
          throw new Error('range 記號錯誤：' + tok);
        // 正規化：高牌在前
        if (a1 > a2) { var tA = a1; a1 = a2; a2 = tA; }
        if (b1 > b2) { var tB = b1; b1 = b2; b2 = tB; }
        if (a1 !== b1) throw new Error('range 記號錯誤（高牌需相同）：' + tok);
        var suitedD = sufA === 's';
        var kHi = Math.min(a2, b2), kLo = Math.max(a2, b2);
        for (var kk = kHi; kk <= kLo; kk++) {
          out[suitedD ? a1 * 13 + kk : kk * 13 + a1] = true;
        }
        return;
      }
      var m = /^([2-9TJQKA])([2-9TJQKA])(s|o)?(\+)?$/i.exec(tok);
      if (!m) throw new Error('range 記號錯誤：' + tok);
      var r1 = RANK_CHARS.indexOf(m[1].toUpperCase());
      var r2 = RANK_CHARS.indexOf(m[2].toUpperCase());
      var suited = m[3] ? m[3].toLowerCase() === 's' : null;
      var plus = !!m[4];
      if (r1 === r2) { // 對子
        var top = plus ? 0 : r1;
        for (var p = top; p <= r1; p++) out[p * 13 + p] = true;
        return;
      }
      if (suited === null) throw new Error('非對子需註明 s/o：' + tok);
      if (r1 > r2) { var tmp = r1; r1 = r2; r2 = tmp; } // r1 = 高牌
      var lo = plus ? r1 + 1 : r2; // "+" = kicker 從 r2 升到 r1 下一張
      for (var k = lo; k <= r2; k++) {
        out[suited ? r1 * 13 + k : k * 13 + r1] = true;
      }
    });
    return Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
  }

  function rangeComboTotal(classes) {
    return classes.reduce(function (s, i) { return s + comboCount(i); }, 0);
  }

  var PushFold = {
    classLabel: classLabel,
    rangeVsRange: rangeVsRange,
    rangeFromNotation: rangeFromNotation,
    rangeComboTotal: rangeComboTotal,
    comboCount: comboCount,
    classIndexFromCards: classIndexFromCards,
    expandCombos: expandCombos,
    combosAvailable: combosAvailable,
    parseHand: parseHand,
    topPercentRange: topPercentRange,
    equityVsRange: equityVsRange,
    icmEVWithBusts: icmEVWithBusts,
    computeShoveEV: computeShoveEV,
    TOTAL_COMBOS: TOTAL_COMBOS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PushFold;
  else global.PushFold = PushFold;
})(typeof window !== 'undefined' ? window : this);
