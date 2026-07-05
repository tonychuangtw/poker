/* 7-card poker hand evaluator — 純 JS，瀏覽器 / Node 皆可用 */
(function (global) {
  'use strict';

  var RANKS = '23456789TJQKA'; // index 0 => rank 2
  var SUITS = 'cdhs';
  var SUIT_SYMBOLS = { c: '\u2663', d: '\u2666', h: '\u2665', s: '\u2660' };

  // card 以整數表示: (rank << 2) | suit, rank 2..14, suit 0..3
  function cardFromString(s) {
    if (typeof s !== 'string' || s.length !== 2) throw new Error('bad card: ' + s);
    var r = RANKS.indexOf(s[0].toUpperCase());
    var su = SUITS.indexOf(s[1].toLowerCase());
    if (r < 0 || su < 0) throw new Error('bad card: ' + s);
    return ((r + 2) << 2) | su;
  }
  function cardRank(c) { return c >> 2; }
  function cardSuit(c) { return c & 3; }
  function cardToString(c) { return RANKS[(c >> 2) - 2] + SUITS[c & 3]; }

  var CATEGORY_NAMES = [
    '高牌', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '四條', '同花順'
  ];

  // 回傳分數陣列 [category, tiebreakers...]，可用 compareScore 比較
  function evaluate5(cards) {
    var ranks = cards.map(function (c) { return c >> 2; }).sort(function (a, b) { return b - a; });
    var suit0 = cards[0] & 3;
    var isFlush = cards.every(function (c) { return (c & 3) === suit0; });

    var cnt = {};
    var i;
    for (i = 0; i < 5; i++) cnt[ranks[i]] = (cnt[ranks[i]] || 0) + 1;
    var groups = Object.keys(cnt).map(function (r) { return [cnt[r], +r]; });
    groups.sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; });

    var straightHigh = 0;
    if (groups.length === 5) {
      if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
      else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5; // wheel A-5
    }

    if (isFlush && straightHigh) return [8, straightHigh];
    if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
    if (isFlush) return [5, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]];
    if (straightHigh) return [4, straightHigh];
    if (groups[0][0] === 3) return [3, groups[0][1], groups[1][1], groups[2][1]];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, groups[0][1], groups[1][1], groups[2][1]];
    if (groups[0][0] === 2) return [1, groups[0][1], groups[1][1], groups[2][1], groups[3][1]];
    return [0, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]];
  }

  function compareScore(a, b) {
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  // C(7,5) = 21 組索引，預先產生
  var COMBOS_7C5 = (function () {
    var out = [];
    for (var a = 0; a < 7; a++)
      for (var b = a + 1; b < 7; b++)
        for (var c = b + 1; c < 7; c++)
          for (var d = c + 1; d < 7; d++)
            for (var e = d + 1; e < 7; e++)
              out.push([a, b, c, d, e]);
    return out;
  })();

  function evaluate7(cards) {
    if (cards.length !== 7) throw new Error('evaluate7 needs 7 cards');
    var best = null;
    for (var i = 0; i < COMBOS_7C5.length; i++) {
      var idx = COMBOS_7C5[i];
      var five = [cards[idx[0]], cards[idx[1]], cards[idx[2]], cards[idx[3]], cards[idx[4]]];
      var s = evaluate5(five);
      if (best === null || compareScore(s, best) > 0) best = s;
    }
    return best;
  }

  var Evaluator = {
    RANKS: RANKS,
    SUITS: SUITS,
    SUIT_SYMBOLS: SUIT_SYMBOLS,
    CATEGORY_NAMES: CATEGORY_NAMES,
    cardFromString: cardFromString,
    cardToString: cardToString,
    cardRank: cardRank,
    cardSuit: cardSuit,
    evaluate5: evaluate5,
    evaluate7: evaluate7,
    compareScore: compareScore
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Evaluator;
  else global.Evaluator = Evaluator;
})(typeof window !== 'undefined' ? window : this);
