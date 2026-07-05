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

  var ICM = { icmEV: icmEV, MAX_PLAYERS: MAX_PLAYERS, MAX_PLACES: MAX_PLACES };
  if (typeof module !== 'undefined' && module.exports) module.exports = ICM;
  else global.ICM = ICM;
})(typeof window !== 'undefined' ? window : this);
