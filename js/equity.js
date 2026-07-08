/* Heads-up equity 計算：剩餘公牌 <= 2 張時窮舉，否則 Monte Carlo */
(function (global) {
  'use strict';

  var Evaluator = (typeof module !== 'undefined' && module.exports)
    ? require('./evaluator.js')
    : global.Evaluator;

  function buildDeck(excluded) {
    var used = {};
    excluded.forEach(function (c) { used[c] = true; });
    var deck = [];
    for (var r = 2; r <= 14; r++) {
      for (var s = 0; s < 4; s++) {
        var c = (r << 2) | s;
        if (!used[c]) deck.push(c);
      }
    }
    return deck;
  }

  function showdown(hero, villain, board) {
    var h = Evaluator.evaluate7(hero.concat(board));
    var v = Evaluator.evaluate7(villain.concat(board));
    return Evaluator.compareScore(h, v); // >0 hero 贏, <0 villain 贏, 0 平手
  }

  /**
   * @param {number[]} hero    2 張手牌 (card int)
   * @param {number[]} villain 2 張手牌
   * @param {number[]} board   0/3/4/5 張公牌
   * @param {number} [mcIters] Monte Carlo 次數 (預設 50000)
   * @returns {{hero:number, villain:number, tie:number, trials:number, method:string}}
   */
  function computeEquity(hero, villain, board, mcIters) {
    board = board || [];
    mcIters = mcIters || 50000;
    var all = hero.concat(villain, board);
    var seen = {};
    all.forEach(function (c) {
      if (seen[c]) throw new Error('duplicate card: ' + Evaluator.cardToString(c));
      seen[c] = true;
    });
    var need = 5 - board.length;
    if (need < 0) throw new Error('board too long');

    var deck = buildDeck(all);
    var wins = 0, losses = 0, ties = 0, trials = 0;
    var i, j, cmp, method;

    if (need === 0) {
      method = 'exact';
      cmp = showdown(hero, villain, board);
      trials = 1;
      if (cmp > 0) wins = 1; else if (cmp < 0) losses = 1; else ties = 1;
    } else if (need === 1) {
      method = 'exact';
      for (i = 0; i < deck.length; i++) {
        cmp = showdown(hero, villain, board.concat([deck[i]]));
        trials++;
        if (cmp > 0) wins++; else if (cmp < 0) losses++; else ties++;
      }
    } else if (need === 2) {
      method = 'exact';
      for (i = 0; i < deck.length; i++) {
        for (j = i + 1; j < deck.length; j++) {
          cmp = showdown(hero, villain, board.concat([deck[i], deck[j]]));
          trials++;
          if (cmp > 0) wins++; else if (cmp < 0) losses++; else ties++;
        }
      }
    } else {
      method = 'montecarlo';
      var n = deck.length;
      for (var t = 0; t < mcIters; t++) {
        // 部分 Fisher-Yates：抽 need 張
        for (i = 0; i < need; i++) {
          var k = i + Math.floor(Math.random() * (n - i));
          var tmp = deck[i]; deck[i] = deck[k]; deck[k] = tmp;
        }
        cmp = showdown(hero, villain, board.concat(deck.slice(0, need)));
        trials++;
        if (cmp > 0) wins++; else if (cmp < 0) losses++; else ties++;
      }
    }

    return {
      hero: (wins + ties / 2) / trials,
      villain: (losses + ties / 2) / trials,
      tie: ties / trials,
      trials: trials,
      method: method
    };
  }

  /** EV of calling = equity*(pot+call) - call */
  function callEV(equity, pot, call) {
    return equity * (pot + call) - call;
  }

  /* N 人 showdown：贏家平分該局 equity（每人 1/贏家數） */
  function showdownMulti(hands, board, shares) {
    var best = null, winners = [];
    for (var i = 0; i < hands.length; i++) {
      var sc = Evaluator.evaluate7(hands[i].concat(board));
      if (best === null) { best = sc; winners = [i]; continue; }
      var cmp = Evaluator.compareScore(sc, best);
      if (cmp > 0) { best = sc; winners = [i]; }
      else if (cmp === 0) { winners.push(i); }
    }
    var share = 1 / winners.length;
    for (var w = 0; w < winners.length; w++) {
      shares[winners[w]].equity += share;
      if (winners.length === 1) shares[winners[w]].win += 1;
      else shares[winners[w]].tie += 1;
    }
  }

  /**
   * 多人 all-in equity（2–6 家）。
   * @param {number[][]} hands 每家 2 張手牌
   * @param {number[]} board  0/3/4/5 張公牌
   * @param {number} [mcIters]
   * @returns {{players:{equity:number,win:number,tie:number}[], trials:number, method:string}}
   */
  function computeEquityMulti(hands, board, mcIters) {
    board = board || [];
    mcIters = mcIters || 50000;
    if (!Array.isArray(hands) || hands.length < 2 || hands.length > 6) {
      throw new Error('need 2-6 hands');
    }
    var all = board.slice();
    hands.forEach(function (h) {
      if (!Array.isArray(h) || h.length !== 2) throw new Error('each hand needs 2 cards');
      all = all.concat(h);
    });
    var seen = {};
    all.forEach(function (c) {
      if (seen[c]) throw new Error('duplicate card: ' + Evaluator.cardToString(c));
      seen[c] = true;
    });
    var need = 5 - board.length;
    if (need < 0) throw new Error('board too long');

    var deck = buildDeck(all);
    var shares = hands.map(function () { return { equity: 0, win: 0, tie: 0 }; });
    var trials = 0, method, i, j;

    if (need === 0) {
      method = 'exact';
      showdownMulti(hands, board, shares);
      trials = 1;
    } else if (need === 1) {
      method = 'exact';
      for (i = 0; i < deck.length; i++) {
        showdownMulti(hands, board.concat([deck[i]]), shares);
        trials++;
      }
    } else if (need === 2) {
      method = 'exact';
      for (i = 0; i < deck.length; i++) {
        for (j = i + 1; j < deck.length; j++) {
          showdownMulti(hands, board.concat([deck[i], deck[j]]), shares);
          trials++;
        }
      }
    } else {
      method = 'montecarlo';
      var n = deck.length;
      for (var t = 0; t < mcIters; t++) {
        for (i = 0; i < need; i++) {
          var k = i + Math.floor(Math.random() * (n - i));
          var tmp = deck[i]; deck[i] = deck[k]; deck[k] = tmp;
        }
        showdownMulti(hands, board.concat(deck.slice(0, need)), shares);
        trials++;
      }
    }

    return {
      players: shares.map(function (s) {
        return { equity: s.equity / trials, win: s.win / trials, tie: s.tie / trials };
      }),
      trials: trials,
      method: method
    };
  }

  var EquityLib = { computeEquity: computeEquity, computeEquityMulti: computeEquityMulti, callEV: callEV, buildDeck: buildDeck };
  if (typeof module !== 'undefined' && module.exports) module.exports = EquityLib;
  else global.EquityLib = EquityLib;
})(typeof window !== 'undefined' ? window : this);
