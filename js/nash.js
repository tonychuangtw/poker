/* Heads-up push/fold Nash 均衡（chip EV，fictitious play 求解）
 *
 * 模型：SB(button) 只能全下或蓋牌；BB 只能跟注或蓋牌。雙方有效籌碼 S bb。
 * - SB 蓋牌：-0.5
 * - SB 全下、BB 蓋：+1
 * - 被跟注：底池 2S，SB EV = 2S·eq − S（equity 含平手各半）
 * 類別層級計算（169 手牌類別、combo 加權），忽略雙方手牌間的 blocker 效應
 * （標準近似，誤差 <1%）。equity 來自 preflop-table.js 的 169×169 表。
 */
(function (global) {
  'use strict';

  var Table = (typeof module !== 'undefined' && module.exports)
    ? require('./preflop-table.js') : global.PreflopTable;

  var N = 169;
  var COMBOS = [];
  (function () {
    for (var i = 0; i < N; i++) {
      var r = Math.floor(i / 13), c = i % 13;
      COMBOS[i] = r === c ? 6 : r < c ? 4 : 12;
    }
  })();

  /**
   * 求 S bb 時的 Nash push/fold 均衡。
   * @returns {{push:number[], call:number[], pushSet:boolean[], callSet:boolean[],
   *            pushPct:number, callPct:number}}
   *   push/call = 每類別的混合機率（0-1）；pushSet/callSet = >0.5 的門檻集合；
   *   pushPct/callPct = combo 加權的 range 百分比。
   */
  function solveNashHU(S, iters) {
    iters = iters || 300;
    var push = new Array(N).fill(1);
    var call = new Array(N).fill(1);
    var brPush = new Array(N), brCall = new Array(N);
    var i, h, c, t;

    for (t = 1; t <= iters; t++) {
      /* --- caller best response vs 當前 push 混合策略 --- */
      var wPush = 0;
      for (i = 0; i < N; i++) wPush += push[i] * COMBOS[i];
      for (c = 0; c < N; c++) {
        if (wPush <= 0) { brCall[c] = 0; continue; }
        var eqSum = 0;
        for (h = 0; h < N; h++) {
          if (push[h] <= 0) continue;
          eqSum += push[h] * COMBOS[h] * Table.EQ[c * N + h];
        }
        var eqc = eqSum / wPush / 1000;
        brCall[c] = (2 * S * eqc - S > -1) ? 1 : 0;
      }
      /* --- pusher best response vs 當前 call 混合策略 --- */
      var wCall = 0;
      for (i = 0; i < N; i++) wCall += call[i] * COMBOS[i];
      var pc = wCall / 1326;
      for (h = 0; h < N; h++) {
        var eqSum2 = 0;
        for (c = 0; c < N; c++) {
          if (call[c] <= 0) continue;
          eqSum2 += call[c] * COMBOS[c] * Table.EQ[h * N + c];
        }
        var eqh = wCall > 0 ? eqSum2 / wCall / 1000 : 0;
        var evPush = (1 - pc) * 1 + pc * (2 * S * eqh - S);
        brPush[h] = (evPush > -0.5) ? 1 : 0;
      }
      /* --- fictitious play 平均 --- */
      var a = 1 / (t + 1);
      for (i = 0; i < N; i++) {
        push[i] = (1 - a) * push[i] + a * brPush[i];
        call[i] = (1 - a) * call[i] + a * brCall[i];
      }
    }

    var pushSet = [], callSet = [];
    var pushCombos = 0, callCombos = 0;
    for (i = 0; i < N; i++) {
      pushSet[i] = push[i] > 0.5;
      callSet[i] = call[i] > 0.5;
      if (pushSet[i]) pushCombos += COMBOS[i];
      if (callSet[i]) callCombos += COMBOS[i];
    }
    return {
      push: push, call: call,
      pushSet: pushSet, callSet: callSet,
      pushPct: pushCombos / 1326 * 100,
      callPct: callCombos / 1326 * 100
    };
  }

  var cache = {};
  function solveCached(S) {
    var key = String(S);
    if (!cache[key]) cache[key] = solveNashHU(S);
    return cache[key];
  }

  var Nash = { solveNashHU: solveNashHU, solveCached: solveCached, COMBOS: COMBOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Nash;
  else global.NashHU = Nash;
})(typeof window !== 'undefined' ? window : this);
