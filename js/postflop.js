/* 翻後：牌面質地、c-bet 策略、MDF / bluff-catcher、range vs range on board
 *
 * 全部是純函式（雙輸出 Node / window.Postflop），UI 在 app.js。
 * 牌一律用 evaluator.js 的 card int：(rank << 2) | suit，rank 2..14、suit 0..3。
 *
 * 模型立場：
 * - 質地（classifyBoard）用「同花成分 + 順子成分」算 0–1 的濕度，是速查用的簡化指標。
 * - c-bet 建議（cbetRangePolicy / cbetHandPolicy）是公認的啟發式，不是 solver 輸出。
 * - bluff-catcher（buildRiverSpot）反過來是精確的：河牌上刻意讓
 *   value = 兩對以上、bluff = 高牌、hero = 一對，
 *   於是 hero 必定贏光所有 bluff、輸光所有 value，equity 就是 bluff 佔比，
 *   不需要任何模擬也不會有誤差。
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Evaluator = isNode ? require('./evaluator.js') : global.Evaluator;
  var PushFold = isNode ? require('./pushfold.js') : global.PushFold;

  function rankOf(c) { return c >> 2; }
  function suitOf(c) { return c & 3; }
  function desc(a, b) { return b - a; }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  /** 5–7 張取最佳五張的分數（evaluator.js 只給 5 / 7 張） */
  function bestScore(cards) {
    var n = cards.length;
    if (n === 5) return Evaluator.evaluate5(cards);
    if (n === 7) return Evaluator.evaluate7(cards);
    if (n !== 6) throw new Error(t('bestScore 需 5–7 張，收到 ') + n);
    var best = null;
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        for (var c = b + 1; c < n; c++) {
          for (var d = c + 1; d < n; d++) {
            for (var e = d + 1; e < n; e++) {
              var s = Evaluator.evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (best === null || Evaluator.compareScore(s, best) > 0) best = s;
            }
          }
        }
      }
    }
    return best;
  }

  function buildDeck(excluded) {
    var used = {};
    (excluded || []).forEach(function (c) { used[c] = true; });
    var deck = [];
    for (var r = 2; r <= 14; r++) {
      for (var s = 0; s < 4; s++) {
        var c = (r << 2) | s;
        if (!used[c]) deck.push(c);
      }
    }
    return deck;
  }

  /* ---------- 順子窗工具：A 同時當 14 與 1 ---------- */

  /** 一組 rank 最多有幾張落在同一個 5 張順子窗內（含 A-5 輪子） */
  function maxStraightWindow(ranks) {
    var has = {};
    ranks.forEach(function (r) { has[r] = true; if (r === 14) has[1] = true; });
    var best = 0;
    for (var lo = 1; lo <= 10; lo++) {
      var n = 0;
      for (var k = 0; k < 5; k++) if (has[lo + k]) n++;
      if (n > best) best = n;
    }
    return best;
  }

  /** 加一張什麼 rank 就成順（且該順至少用到 heroRanks 一張）→ 回傳那些 rank */
  function straightCompleters(heroRanks, boardRanks) {
    var all = heroRanks.concat(boardRanks);
    var has = {}, heroHas = {};
    all.forEach(function (r) { has[r] = true; if (r === 14) has[1] = true; });
    heroRanks.forEach(function (r) { heroHas[r] = true; if (r === 14) heroHas[1] = true; });
    // extra = 額外補進來的一張 rank（-1 表示不補）；順子必須至少用到 hero 一張
    function madeWith(extra) {
      for (var lo = 1; lo <= 10; lo++) {
        var full = true, usesHero = false;
        for (var k = 0; k < 5; k++) {
          var r = lo + k;
          if (has[r]) { if (heroHas[r]) usesHero = true; }
          else if (r !== extra) { full = false; break; }
        }
        if (full && usesHero) return true;
      }
      return false;
    }
    if (madeWith(-1)) return [];              // 已經成順，不算聽牌
    var out = [];
    for (var r = 2; r <= 14; r++) {
      if (has[r]) continue;
      if (madeWith(r === 14 ? 1 : r) || madeWith(r)) out.push(r);
    }
    return out;
  }

  /* ---------- 牌面質地 ---------- */

  var HIGH_TXT = function (r) { return Evaluator.RANKS[r - 2]; };

  /**
   * 牌面質地。board 3–5 張。
   * wetness 0–1 = 同花成分與順子成分各半：
   *   同花：3 張以上同花色 = 1、兩色 = 0.5、彩虹 = 0
   *   順子：同一個順子窗內 3 張以上 = 1、2 張 = 0.5、否則 0
   */
  function classifyBoard(board) {
    if (!board || board.length < 3 || board.length > 5) throw new Error(t('公牌需 3–5 張'));
    var ranks = board.map(rankOf).sort(desc);
    var uRanks = uniq(ranks);
    var rc = {}, sc = {};
    ranks.forEach(function (r) { rc[r] = (rc[r] || 0) + 1; });
    board.forEach(function (c) { var s = suitOf(c); sc[s] = (sc[s] || 0) + 1; });
    var pairs = 0, trips = false, suitMax = 0, k;
    for (k in rc) {
      if (rc[k] === 2) pairs++;
      if (rc[k] >= 3) trips = true;
    }
    for (k in sc) if (sc[k] > suitMax) suitMax = sc[k];

    var span = maxStraightWindow(uRanks);
    var suitComp = suitMax >= 3 ? 1 : suitMax === 2 ? 0.5 : 0;
    var strComp = span >= 3 ? 1 : span === 2 ? 0.5 : 0;
    var wetness = 0.5 * suitComp + 0.5 * strComp;
    var paired = pairs > 0 || trips;

    var suitTxt = suitMax >= 3 ? t('單色') : suitMax === 2 ? t('兩色') : t('彩虹');
    var wetTxt = wetness >= 0.6 ? t('濕') : wetness <= 0.25 ? t('乾') : t('中性');
    return {
      ranks: ranks, highCard: ranks[0], lowCard: ranks[ranks.length - 1],
      paired: paired, trips: trips, suitMax: suitMax,
      monotone: suitMax >= 3, twoTone: suitMax === 2, rainbow: suitMax === 1,
      straightSpan: span,
      boardStraight: span >= 5, boardFlush: suitMax >= 5,
      wetness: wetness,
      wetTxt: wetTxt,
      label: HIGH_TXT(ranks[0]) + t(' 高') + (paired ? t('配對') : '') + suitTxt + wetTxt + t('面')
    };
  }

  /* ---------- 聽牌 ---------- */

  /** 同花聽牌：hero 至少貢獻一張、合計 4 張同色（河牌沒有聽牌） */
  function flushDrawInfo(hero, board) {
    var out = { draw: false, backdoor: false, nut: false, suit: -1 };
    if (board.length >= 5) return out;
    var sc = {}, hs = {};
    hero.concat(board).forEach(function (c) { var s = suitOf(c); sc[s] = (sc[s] || 0) + 1; });
    hero.forEach(function (c) { hs[suitOf(c)] = (hs[suitOf(c)] || 0) + 1; });
    for (var s in sc) {
      if (!hs[s]) continue;
      if (sc[s] === 4) {
        out.draw = true; out.suit = +s;
        out.nut = hero.some(function (c) { return suitOf(c) === +s && rankOf(c) === 14; });
      } else if (sc[s] === 3 && board.length === 3 && hs[s] === 2 && !out.draw) {
        out.backdoor = true; out.suit = +s;
      }
    }
    return out;
  }

  /** 順子聽牌：completers 2 個以上 = 兩頭順、1 個 = 卡順（河牌沒有聽牌） */
  function straightDrawInfo(hero, board) {
    if (board.length >= 5) return { outs: 0, type: '', completers: [] };
    var comp = straightCompleters(hero.map(rankOf), board.map(rankOf));
    return {
      outs: comp.length * 4,
      type: comp.length >= 2 ? 'oesd' : comp.length === 1 ? 'gutshot' : '',
      completers: comp
    };
  }

  /* ---------- 手牌分級 ---------- */

  var BUCKET_NAMES = {
    nut: t('三條以上'), twoPair: t('兩對'), topPair: t('頂對／超對'),
    weakPair: t('弱對'), draw: t('聽牌'), air: t('空氣')
  };

  /**
   * hero 兩張 + board 3–5 張 → 牌力分級。
   * bucket: nut / twoPair / topPair / weakPair / draw / air
   * 檯面自己成對而 hero 沒中時算 air（只有檯面對子不是牌力）。
   */
  function handClass(hero, board) {
    var score = bestScore(hero.concat(board));
    var cat = score[0];
    var bRanks = board.map(rankOf);
    var bSorted = uniq(bRanks).sort(desc);
    var hRanks = hero.map(rankOf).sort(desc);
    var bucket, pairTxt = '';

    if (cat >= 3) { bucket = 'nut'; pairTxt = Evaluator.CATEGORY_NAMES[cat]; }
    else if (cat === 2) { bucket = 'twoPair'; pairTxt = t('兩對'); }
    else if (cat === 1) {
      var pr = score[1];
      var onBoard = bRanks.filter(function (r) { return r === pr; }).length;
      if (onBoard >= 2) { bucket = 'air'; pairTxt = t('只有檯面對子'); }
      else if (hRanks[0] === hRanks[1] && pr > bSorted[0]) { bucket = 'topPair'; pairTxt = t('超對'); }
      else if (onBoard === 0) { bucket = 'weakPair'; pairTxt = t('口袋對（低於檯面最大張）'); }
      else {
        var pos = bSorted.indexOf(pr);
        if (pos === 0) { bucket = 'topPair'; pairTxt = t('頂對'); }
        else if (pos === 1) { bucket = 'weakPair'; pairTxt = t('第二對'); }
        else { bucket = 'weakPair'; pairTxt = t('第三對以下'); }
      }
    } else { bucket = 'air'; pairTxt = t('高牌'); }

    var fd = flushDrawInfo(hero, board);
    var sd = straightDrawInfo(hero, board);
    var strongDraw = fd.draw || sd.type === 'oesd';
    var overcards = 0;
    if (bSorted.length) {
      overcards = hRanks.filter(function (r) { return r > bSorted[0]; }).length;
    }
    if (bucket === 'air' && (strongDraw || sd.type === 'gutshot' || fd.backdoor)) bucket = 'draw';

    var drawTxt = [
      fd.draw ? (fd.nut ? t('堅果同花聽牌') : t('同花聽牌')) : fd.backdoor ? t('後門同花') : '',
      sd.type === 'oesd' ? t('兩頭順') : sd.type === 'gutshot' ? t('卡順') : ''
    ].filter(Boolean).join(t('＋'));

    return {
      cat: cat, bucket: bucket, bucketTxt: BUCKET_NAMES[bucket], pairTxt: pairTxt,
      fd: fd, sd: sd, strongDraw: strongDraw, drawTxt: drawTxt,
      overcards: overcards,
      label: pairTxt + (drawTxt ? t('＋') + drawTxt : '')
    };
  }

  /* ---------- MDF / 底池賠率 ---------- */

  /** 面對 bet（下注額）進 pot（下注前底池）時，防守方最低跟注頻率 */
  function mdf(bet, pot) {
    if (!(bet > 0) || !(pot > 0)) throw new Error(t('bet / pot 需為正數'));
    return pot / (pot + bet);
  }
  /** α：詐唬要打平所需的對手棄牌率 = 1 − MDF */
  function alpha(bet, pot) { return 1 - mdf(bet, pot); }
  /** 跟注方的底池賠率（＝所需最低勝率）。同時也是對手 range 裡 bluff 該占的比例。 */
  function callPotOdds(bet, pot) {
    if (!(bet > 0) || !(pot >= 0)) throw new Error(t('bet / pot 不合法'));
    return bet / (pot + 2 * bet);
  }
  /** 平衡的 bluff 數：讓跟注方無差異 → bluff = value × bet/(pot+bet) */
  function balancedBluffCount(valueCount, bet, pot) {
    return valueCount * bet / (pot + bet);
  }

  /* ---------- c-bet 策略 ---------- */

  var CBET_ACTIONS = { big: t('下注 75%'), small: t('下注 33%'), check: t('過牌') };

  /**
   * range 層級的 c-bet 建議（速查用）。
   * opts: {role:'ip'|'oop', potType:'srp'|'3bp'}
   */
  function cbetRangePolicy(tex, opts) {
    opts = opts || {};
    var ip = opts.role !== 'oop';
    var threeBet = opts.potType === '3bp';
    var f = 0.62;
    if (tex.highCard >= 14) f += 0.12;
    else if (tex.highCard >= 13) f += 0.08;
    else if (tex.highCard >= 12) f += 0.04;
    else if (tex.highCard <= 9) f -= 0.06;
    f -= 0.30 * tex.wetness;
    if (tex.paired) f += 0.10;
    if (tex.monotone) f -= 0.08;
    if (threeBet) f += 0.10;
    if (!ip) f -= 0.12;
    f = clamp(f, 0.15, 0.92);
    var size = (tex.wetness >= 0.55 && !tex.paired) ? 'big' : 'small';
    return {
      freq: f, size: size, sizeTxt: CBET_ACTIONS[size],
      why: (tex.paired ? t('配對面對手很難有東西 → 高頻小注。')
        : tex.wetness >= 0.55 ? t('濕面雙方都有很多續玩牌 → 降頻、改用大注兩極化。')
          : t('乾面且高牌優勢在你 → 高頻小注整個 range。')) +
        (threeBet ? t(' 3-bet 底池 SPR 低，可再拉高頻率。') : '') +
        (ip ? '' : t(' 無位置要多過牌，頻率再往下修。'))
    };
  }

  /**
   * 單一手牌的 c-bet 建議（測驗評分用）。
   * opts: {role:'ip'|'oop', potType:'srp'|'3bp'}
   * 回傳 action: 'big'（下注 75%）| 'small'（下注 33%）| 'check'（過牌）
   */
  function cbetHandPolicy(hero, board, opts) {
    opts = opts || {};
    var ip = opts.role !== 'oop';
    var threeBet = opts.potType === '3bp';
    var tex = classifyBoard(board);
    var hc = handClass(hero, board);
    var wet = tex.wetness;
    var act, why;

    if (hc.bucket === 'nut' || hc.bucket === 'twoPair') {
      act = wet >= 0.5 ? 'big' : 'small';
      why = t('強成手：') + (act === 'big'
        ? t('濕面要收費保護、順便把底池做大') : t('乾面對手續玩範圍窄，小注留住他的弱牌'));
    } else if (hc.bucket === 'topPair') {
      act = wet >= 0.6 ? 'big' : 'small';
      why = act === 'big' ? t('頂對／超對在濕面必須收費保護') : t('乾面小注薄價值，也保護得夠');
    } else if (hc.bucket === 'weakPair') {
      if (wet <= 0.3 && ip) { act = 'small'; why = t('弱對在乾面有位置 → 小注薄價值兼保護'); }
      else { act = 'check'; why = t('弱對承受不了加注，過牌控池'); }
    } else if (hc.strongDraw) {
      act = wet >= 0.5 ? 'big' : 'small';
      why = t('強聽牌（') + hc.drawTxt + t('）當半詐唬，') +
        (act === 'big' ? t('濕面下大最大化棄牌權益') : t('乾面下小成本較低'));
    } else if (hc.bucket === 'draw') {
      act = (tex.highCard >= 12 && wet <= 0.4) ? 'small' : 'check';
      why = act === 'small' ? t('弱聽牌（') + (hc.drawTxt || t('後門')) + t('）跟著 range 一起小注')
        : t('弱聽牌先過牌，保留便宜看牌權');
    } else {
      if (wet <= 0.3 && tex.highCard >= 12 && (ip || threeBet)) {
        act = 'small'; why = t('高牌乾面 range 優勢大 → 整個 range 小注');
      } else if (hc.overcards >= 2 && wet <= 0.4 && ip) {
        act = 'small'; why = t('兩張高張還有補牌，乾面有位置可以小注');
      } else { act = 'check'; why = t('沒牌力也沒補牌 → 過牌放棄'); }
    }

    if (threeBet && act === 'big' && wet < 0.7) {
      act = 'small'; why += t('；3-bet 底池 SPR 低，小注就推得動籌碼');
    }
    if (!ip && act === 'small' && (hc.bucket === 'air' || hc.bucket === 'draw') && !hc.strongDraw) {
      act = 'check'; why = t('無位置又沒牌力 → 過牌，別把自己打進難處理的局面');
    }
    return {
      action: act, actionTxt: CBET_ACTIONS[act], why: why,
      texture: tex, hand: hc, rangePolicy: cbetRangePolicy(tex, opts)
    };
  }

  /* ---------- range on board：質地剖析與 range vs range ---------- */

  function expandFiltered(classes, dead) {
    var used = {};
    (dead || []).forEach(function (c) { used[c] = true; });
    var out = [];
    classes.forEach(function (ci) {
      PushFold.expandCombos(ci).forEach(function (c) {
        if (!used[c[0]] && !used[c[1]]) out.push(c);
      });
    });
    return out;
  }

  var BUCKET_ORDER = ['nut', 'twoPair', 'topPair', 'weakPair', 'draw', 'air'];

  /** 一個 range 在某牌面上的組成：各級別 combo 數、堅果占比、空氣占比 */
  function rangeBoardProfile(classes, board) {
    var combos = expandFiltered(classes, board);
    var buckets = {};
    BUCKET_ORDER.forEach(function (b) { buckets[b] = 0; });
    combos.forEach(function (c) { buckets[handClass(c, board).bucket]++; });
    var n = combos.length;
    return {
      combos: n, buckets: buckets,
      nutPct: n ? buckets.nut / n * 100 : 0,
      strongPct: n ? (buckets.nut + buckets.twoPair + buckets.topPair) / n * 100 : 0,
      airPct: n ? buckets.air / n * 100 : 0
    };
  }

  /** range vs range 在指定牌面上的勝率。河牌且組合數不大時窮舉，否則 Monte Carlo。 */
  function rangeVsRangeBoard(clsA, clsB, board, iters, rand) {
    rand = rand || Math.random;
    iters = iters || 20000;
    var A = expandFiltered(clsA, board), B = expandFiltered(clsB, board);
    if (!A.length || !B.length) throw new Error(t('range 在此牌面沒有可用 combo'));
    var need = 5 - board.length;
    if (need < 0) throw new Error(t('公牌太多'));
    var eqA = 0, ties = 0, trials = 0, i, j;

    function tally(a, b, full) {
      var cmp = Evaluator.compareScore(bestScore(a.concat(full)), bestScore(b.concat(full)));
      if (cmp > 0) eqA += 1;
      else if (cmp === 0) { eqA += 0.5; ties++; }
      trials++;
    }

    if (need === 0 && A.length * B.length <= 60000) {
      for (i = 0; i < A.length; i++) {
        for (j = 0; j < B.length; j++) {
          var a = A[i], b = B[j];
          if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
          tally(a, b, board);
        }
      }
      if (!trials) throw new Error(t('兩個 range 完全互相阻斷'));
      return { a: eqA / trials, b: 1 - eqA / trials, tie: ties / trials,
               trials: trials, combosA: A.length, combosB: B.length, method: 'exact' };
    }

    var deck = buildDeck(board);
    for (var it = 0; it < iters; it++) {
      var ha = A[Math.floor(rand() * A.length)];
      var hb = B[Math.floor(rand() * B.length)];
      if (ha[0] === hb[0] || ha[0] === hb[1] || ha[1] === hb[0] || ha[1] === hb[1]) continue;
      var full = board.slice(), guard = 0;
      while (full.length < 5 && guard++ < 200) {
        var c = deck[Math.floor(rand() * deck.length)];
        if (c === ha[0] || c === ha[1] || c === hb[0] || c === hb[1]) continue;
        if (full.indexOf(c) !== -1) continue;
        full.push(c);
      }
      tally(ha, hb, full);
    }
    if (!trials) throw new Error(t('兩個 range 完全互相阻斷'));
    return { a: eqA / trials, b: 1 - eqA / trials, tie: ties / trials,
             trials: trials, combosA: A.length, combosB: B.length, method: 'montecarlo' };
  }

  /* ---------- 測驗題目產生器（rand 可注入，測試才能重現） ---------- */

  function draw(deck, rand) {
    var i = Math.floor(rand() * deck.length);
    return deck.splice(i, 1)[0];
  }

  var CBET_ROLES = ['ip', 'oop'];
  var CBET_POTS = ['srp', '3bp'];

  /** 翻後 c-bet 題：隨機翻牌 + hero 手牌 + 位置 / 底池類型 */
  function buildCbetSpot(opts) {
    opts = opts || {};
    var rand = opts.rand || Math.random;
    var deck = buildDeck([]);
    var board = [draw(deck, rand), draw(deck, rand), draw(deck, rand)];
    var hero = [draw(deck, rand), draw(deck, rand)];
    var role = opts.role || CBET_ROLES[Math.floor(rand() * CBET_ROLES.length)];
    var potType = opts.potType || CBET_POTS[Math.floor(rand() * CBET_POTS.length)];
    var pol = cbetHandPolicy(hero, board, { role: role, potType: potType });
    return { board: board, hero: hero, role: role, potType: potType, policy: pol };
  }

  /* bluff-catcher 題的牌面限制：不配對、檯面自己不成順、也不到 4 張同色。
   * 這樣「兩對以上 / 一對 / 高牌」三層之間不會有平手，equity 才能精確用數 combo 求得。 */
  function riverBoardOk(board) {
    var tex = classifyBoard(board);
    return !tex.paired && tex.straightSpan < 5 && tex.suitMax < 4;
  }

  var RIVER_BET_FRACS = [0.33, 0.5, 0.75, 1];
  // 刻意避開 1.0（平衡點）：對手偏離平衡，題目才有明確答案
  var RIVER_BLUFF_MULTS = [0.3, 0.5, 0.6, 1.5, 1.8, 2.4];

  /**
   * 河牌 bluff-catcher 題。
   * 對手下注 range 由「兩對以上（價值）」＋「高牌（詐唬）」組成，
   * hero 固定拿一對 → 贏光詐唬、輸光價值 → equity = 詐唬占比（精確，不需模擬）。
   * opts: {rand, pot, betFrac, bluffMult, villainPct, tries}
   */
  function buildRiverSpot(opts) {
    opts = opts || {};
    var rand = opts.rand || Math.random;
    var pot = opts.pot || 10;
    var villainPct = opts.villainPct || 30;
    var classes = PushFold.topPercentRange(villainPct);
    var tries = opts.tries || 60;

    for (var tr = 0; tr < tries; tr++) {
      var deck = buildDeck([]);
      var board = [];
      while (board.length < 5) board.push(draw(deck, rand));
      if (!riverBoardOk(board)) continue;

      var combos = expandFiltered(classes, board);
      var value = [], bluff = [], mine = [];
      combos.forEach(function (c) {
        var cat = bestScore(c.concat(board))[0];
        if (cat >= 2) value.push(c);
        else if (cat === 1) mine.push(c);
        else bluff.push(c);
      });
      if (!value.length || !bluff.length || !mine.length) continue;

      var hero = mine[Math.floor(rand() * mine.length)];
      var dead = {};
      hero.forEach(function (c) { dead[c] = true; });
      var vPool = value.filter(function (c) { return !dead[c[0]] && !dead[c[1]]; });
      var bPool = bluff.filter(function (c) { return !dead[c[0]] && !dead[c[1]]; });
      if (!vPool.length || !bPool.length) continue;

      var betFrac = opts.betFrac || RIVER_BET_FRACS[Math.floor(rand() * RIVER_BET_FRACS.length)];
      var mult = opts.bluffMult || RIVER_BLUFF_MULTS[Math.floor(rand() * RIVER_BLUFF_MULTS.length)];
      var bet = Math.round(pot * betFrac * 10) / 10;
      var nValue = vPool.length;
      var nBluff = Math.round(balancedBluffCount(nValue, bet, pot) * mult);
      nBluff = Math.min(nBluff, bPool.length);
      if (nBluff < 1) continue;

      var heroEq = nBluff / (nBluff + nValue);
      var needEq = callPotOdds(bet, pot);
      if (Math.abs(heroEq - needEq) < 0.02) continue;   // 太接近無差異點就重抽

      return {
        board: board, hero: hero,
        heroClass: handClass(hero, board),
        value: vPool, bluff: bPool.slice(0, nBluff),
        nValue: nValue, nBluff: nBluff,
        pot: pot, bet: bet, betFrac: betFrac, bluffMult: mult,
        equity: heroEq, needEq: needEq,
        mdf: mdf(bet, pot),
        balancedBluff: balancedBluffCount(nValue, bet, pot),
        best: heroEq >= needEq ? 'call' : 'fold',
        evBB: heroEq * (pot + 2 * bet) - bet
      };
    }
    throw new Error(t('產不出合適的河牌題目'));
  }

  var Postflop = {
    bestScore: bestScore,
    buildDeck: buildDeck,
    maxStraightWindow: maxStraightWindow,
    straightCompleters: straightCompleters,
    classifyBoard: classifyBoard,
    flushDrawInfo: flushDrawInfo,
    straightDrawInfo: straightDrawInfo,
    handClass: handClass,
    BUCKET_NAMES: BUCKET_NAMES,
    BUCKET_ORDER: BUCKET_ORDER,
    CBET_ACTIONS: CBET_ACTIONS,
    mdf: mdf, alpha: alpha, callPotOdds: callPotOdds,
    balancedBluffCount: balancedBluffCount,
    cbetRangePolicy: cbetRangePolicy,
    cbetHandPolicy: cbetHandPolicy,
    expandFiltered: expandFiltered,
    rangeBoardProfile: rangeBoardProfile,
    rangeVsRangeBoard: rangeVsRangeBoard,
    buildCbetSpot: buildCbetSpot,
    buildRiverSpot: buildRiverSpot,
    riverBoardOk: riverBoardOk
  };
  if (isNode) module.exports = Postflop;
  else global.Postflop = Postflop;
})(typeof window !== 'undefined' ? window : this);
