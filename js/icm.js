/* ICM (Malmuth-Harville) 計算 */
(function (global) {
  'use strict';

  var MAX_PLAYERS = 12;
  var MAX_PLACES = 6;

  /**
   * @param {number[]} stacks  各玩家籌碼
   * @param {number[]} payouts 獎金結構 (第 1 名, 第 2 名, ...)
   * @returns {number[]} 每位玩家的 ICM $EV
   */
  function icmEV(stacks, payouts) {
    var n = stacks.length;
    if (n > MAX_PLAYERS) throw new Error('最多 ' + MAX_PLAYERS + ' 位玩家');
    var places = Math.min(payouts.length, n);
    if (places > MAX_PLACES) throw new Error('最多計算前 ' + MAX_PLACES + ' 名獎金');
    stacks.forEach(function (s) {
      if (!(s > 0)) throw new Error('籌碼必須為正數');
    });

    var ev = new Array(n).fill(0);

    // 遞迴：mask 內玩家爭奪第 place 名 (0-indexed)，此情境機率為 prob
    function walk(mask, place, prob) {
      var total = 0, i;
      for (i = 0; i < n; i++) if (mask & (1 << i)) total += stacks[i];
      for (i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        var pi = prob * stacks[i] / total;
        ev[i] += pi * payouts[place];
        if (place + 1 < places) walk(mask & ~(1 << i), place + 1, pi);
      }
    }

    walk((1 << n) - 1, 0, 1);
    return ev;
  }

  /**
   * ICM 分錢（final table deal）：
   * 依獎金結構比例算出各玩家 ICM equity 佔比，乘上剩餘獎池，再加回已鎖定獎金。
   * @param {number[]} stacks   各玩家籌碼
   * @param {number[]} payouts  剩餘名次的獎金結構（只取比例，總額不必等於 pool）
   * @param {number}   pool     剩餘（尚待分配）獎池
   * @param {number[]} [locked] 各玩家已鎖定獎金（選填，預設 0）
   * @returns {number[]} 每位玩家分得金額；合計 = pool + Σlocked
   */
  function icmDeal(stacks, payouts, pool, locked) {
    var n = stacks.length;
    if (n < 2) throw new Error('至少需要 2 位玩家');
    if (!(pool >= 0)) throw new Error('剩餘獎池必須 ≥ 0');
    var pays = payouts.slice(0, n); // 剩 n 人最多只能拿前 n 名
    var tot = pays.reduce(function (a, b) { return a + b; }, 0);
    if (!(tot > 0)) throw new Error('請輸入獎金結構');
    var ev = icmEV(stacks, pays);
    return ev.map(function (e, i) {
      return e / tot * pool + ((locked && locked[i] > 0) ? locked[i] : 0);
    });
  }

  /**
   * Chip-chop 分錢：依籌碼比例分剩餘獎池，再加回已鎖定獎金。
   * @returns {number[]} 每位玩家分得金額；合計 = pool + Σlocked
   */
  function chipChopDeal(stacks, pool, locked) {
    var n = stacks.length;
    if (n < 2) throw new Error('至少需要 2 位玩家');
    if (!(pool >= 0)) throw new Error('剩餘獎池必須 ≥ 0');
    var tot = 0;
    stacks.forEach(function (s) {
      if (!(s > 0)) throw new Error('籌碼必須為正數');
      tot += s;
    });
    return stacks.map(function (s, i) {
      return s / tot * pool + ((locked && locked[i] > 0) ? locked[i] : 0);
    });
  }

  var ICM = { icmEV: icmEV, icmDeal: icmDeal, chipChopDeal: chipChopDeal,
              MAX_PLAYERS: MAX_PLAYERS, MAX_PLACES: MAX_PLACES };
  if (typeof module !== 'undefined' && module.exports) module.exports = ICM;
  else global.ICM = ICM;
})(typeof window !== 'undefined' ? window : this);
