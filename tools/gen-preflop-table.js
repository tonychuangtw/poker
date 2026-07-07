/* 產生 js/preflop-table.js — 169×169 翻前手牌類別 equity 表
 *
 * 用法: node tools/gen-preflop-table.js [boards] [seed]
 *       預設 boards=20000, seed=12345（固定 seed → 輸出可重現）
 *
 * 方法:
 *   Monte Carlo over boards：每回合用 seeded RNG 抽 5 張公牌，
 *   對「所有」不與公牌衝突、彼此也不衝突的 1326×1326 combo 配對做完整攤牌，
 *   把勝負（平手各半）聚合到 169×169 手牌類別。
 *   → 每個類別配對每副公牌都吃到全部花色排列樣本，花色變異被完全平均，
 *     殘餘誤差只來自公牌抽樣（20000 副公牌 stderr 約 0.3%）。
 *
 * 排名（ORDER）採 equity-vs-random（對隨機手牌的勝率），
 * 由本表各類別對全部對手 combo 的加權平均直接算出，
 * 作為 push/fold「top X%」range 的排序依據。
 *
 * 內建快速 7 張評分器（比 evaluator.js 快 ~20x），
 * 啟動時先與 js/evaluator.js 交叉驗證 20000 組隨機牌，確保排序一致。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var Evaluator = require('../js/evaluator.js');

var BOARDS = parseInt(process.argv[2], 10) || 20000;
var SEED = parseInt(process.argv[3], 10) || 12345;

/* ---------- seeded RNG (mulberry32) ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var rand = mulberry32(SEED);

/* ---------- 快速 7 張評分器：回傳可直接比大小的整數 ----------
 * score = cat<<20 | n1<<16 | n2<<12 | n3<<8 | n4<<4 | n5
 * cat 與 tiebreaker 順序同 evaluator.js 的 evaluate7。 */
function straightHigh(mask) {
  var m = mask;
  if (m & (1 << 14)) m |= 2; // A 可當 wheel 的 1（bit1 = 假想 rank 1）
  for (var hi = 14; hi >= 5; hi--) {
    if (((m >> (hi - 4)) & 31) === 31) return hi;
  }
  return 0;
}
var _rc = new Int32Array(15);
function evalScore(cs) { // cs: 長度 7 的 card int 陣列 ((rank<<2)|suit)
  var i, r, c;
  for (i = 2; i < 15; i++) _rc[i] = 0;
  var s0 = 0, s1 = 0, s2 = 0, s3 = 0, rmask = 0;
  for (i = 0; i < 7; i++) {
    c = cs[i]; r = c >> 2;
    _rc[r]++; rmask |= 1 << r;
    switch (c & 3) { case 0: s0++; break; case 1: s1++; break; case 2: s2++; break; default: s3++; }
  }
  var fsu = s0 >= 5 ? 0 : s1 >= 5 ? 1 : s2 >= 5 ? 2 : s3 >= 5 ? 3 : -1;
  var flushScore = 0;
  if (fsu >= 0) {
    var fmask = 0;
    for (i = 0; i < 7; i++) if ((cs[i] & 3) === fsu) fmask |= 1 << (cs[i] >> 2);
    var sf = straightHigh(fmask);
    if (sf) return (8 << 20) | (sf << 16);
    flushScore = 5 << 20;
    var fn = 0;
    for (r = 14; r >= 2 && fn < 5; r--) if (fmask & (1 << r)) { fn++; flushScore |= r << (4 * (5 - fn)); }
  }
  var quad = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0;
  for (r = 14; r >= 2; r--) {
    var n = _rc[r];
    if (n === 4) quad = r;
    else if (n === 3) { if (!t1) t1 = r; else if (!t2) t2 = r; }
    else if (n === 2) { if (!p1) p1 = r; else if (!p2) p2 = r; }
  }
  if (quad) {
    for (r = 14; r >= 2; r--) if (r !== quad && _rc[r]) break;
    return (7 << 20) | (quad << 16) | (r << 12);
  }
  if (t1 && (p1 || t2)) {
    var pp = p1 > t2 ? p1 : t2;
    return (6 << 20) | (t1 << 16) | (pp << 12);
  }
  if (flushScore) return flushScore;
  var st = straightHigh(rmask);
  if (st) return (4 << 20) | (st << 16);
  if (t1) {
    var k1 = 0, k2 = 0;
    for (r = 14; r >= 2; r--) if (r !== t1 && _rc[r]) { if (!k1) k1 = r; else { k2 = r; break; } }
    return (3 << 20) | (t1 << 16) | (k1 << 12) | (k2 << 8);
  }
  if (p1 && p2) {
    for (r = 14; r >= 2; r--) if (r !== p1 && r !== p2 && _rc[r]) break;
    return (2 << 20) | (p1 << 16) | (p2 << 12) | (r << 8);
  }
  if (p1) {
    var sc = (1 << 20) | (p1 << 16), kn = 0;
    for (r = 14; r >= 2 && kn < 3; r--) if (r !== p1 && _rc[r]) { kn++; sc |= r << (4 * (3 - kn) + 4); }
    return sc;
  }
  var hc = 0, hn = 0;
  for (r = 14; r >= 2 && hn < 5; r--) if (_rc[r]) { hn++; hc |= r << (4 * (5 - hn)); }
  return hc;
}

/* ---------- 交叉驗證：evalScore 排序須與 evaluator.js 一致 ---------- */
(function selfCheck() {
  var deck = [];
  for (var r = 2; r <= 14; r++) for (var s = 0; s < 4; s++) deck.push((r << 2) | s);
  var checkRand = mulberry32(999);
  function draw7() {
    var d = deck.slice();
    for (var i = 0; i < 7; i++) {
      var j = i + Math.floor(checkRand() * (d.length - i));
      var t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d.slice(0, 7);
  }
  for (var t = 0; t < 20000; t++) {
    var a = draw7(), b = draw7();
    var fast = evalScore(a) - evalScore(b);
    var ref = Evaluator.compareScore(Evaluator.evaluate7(a), Evaluator.evaluate7(b));
    var sf = fast > 0 ? 1 : fast < 0 ? -1 : 0;
    var sr = ref > 0 ? 1 : ref < 0 ? -1 : 0;
    if (sf !== sr) {
      console.error('SELF-CHECK FAIL:', a.map(Evaluator.cardToString).join(' '),
        'vs', b.map(Evaluator.cardToString).join(' '), 'fast=' + sf, 'ref=' + sr);
      process.exit(1);
    }
  }
  console.log('self-check OK: 20000 組隨機比較與 evaluator.js 一致');
})();

/* ---------- 169 類別索引（13×13 grid，A 在前）----------
 * row r, col c（0=A ... 12=2）：r===c 對子；r<c 同花；r>c 雜色
 * idx = r*13 + c */
function classIndex(cardA, cardB) {
  var ra = cardA >> 2, rb = cardB >> 2;
  var hi = ra > rb ? ra : rb, lo = ra > rb ? rb : ra;
  var suited = (cardA & 3) === (cardB & 3);
  var rh = 14 - hi, rl = 14 - lo;
  if (hi === lo) return rh * 13 + rh;
  return suited ? rh * 13 + rl : rl * 13 + rh;
}

/* ---------- 1326 combos ---------- */
var deck52 = [];
(function () {
  for (var r = 2; r <= 14; r++) for (var s = 0; s < 4; s++) deck52.push((r << 2) | s);
})();
function cardBitIdx(c) { return ((c >> 2) - 2) * 4 + (c & 3); } // 0..51

var NC = 1326;
var cC1 = new Int32Array(NC), cC2 = new Int32Array(NC),
    cCls = new Int32Array(NC), cM1 = new Int32Array(NC), cM2 = new Int32Array(NC);
(function () {
  var k = 0;
  for (var i = 0; i < 52; i++) {
    for (var j = i + 1; j < 52; j++) {
      var a = deck52[i], b = deck52[j];
      cC1[k] = a; cC2[k] = b; cCls[k] = classIndex(a, b);
      var ia = cardBitIdx(a), ib = cardBitIdx(b);
      var m1 = 0, m2 = 0;
      if (ia < 32) m1 |= 1 << ia; else m2 |= 1 << (ia - 32);
      if (ib < 32) m1 |= 1 << ib; else m2 |= 1 << (ib - 32);
      cM1[k] = m1; cM2[k] = m2;
      k++;
    }
  }
})();

/* ---------- 主迴圈 ---------- */
var acc = new Float64Array(169 * 169); // 勝 + 平/2
var cnt = new Float64Array(169 * 169);
var fCls = new Int32Array(NC), fM1 = new Int32Array(NC), fM2 = new Int32Array(NC),
    fSc = new Int32Array(NC);
var cs7 = new Int32Array(7);
var shuffleDeck = deck52.slice();

console.log('產生中: boards=' + BOARDS + ', seed=' + SEED);
var t0 = Date.now();
for (var bIdx = 0; bIdx < BOARDS; bIdx++) {
  // 抽 5 張公牌
  for (var i = 0; i < 5; i++) {
    var j = i + Math.floor(rand() * (52 - i));
    var tmp = shuffleDeck[i]; shuffleDeck[i] = shuffleDeck[j]; shuffleDeck[j] = tmp;
  }
  var bm1 = 0, bm2 = 0;
  for (i = 0; i < 5; i++) {
    cs7[2 + i] = shuffleDeck[i];
    var bi = cardBitIdx(shuffleDeck[i]);
    if (bi < 32) bm1 |= 1 << bi; else bm2 |= 1 << (bi - 32);
  }
  // 過濾與公牌衝突的 combo，並評分
  var nf = 0;
  for (var k = 0; k < NC; k++) {
    if ((cM1[k] & bm1) | (cM2[k] & bm2)) continue;
    cs7[0] = cC1[k]; cs7[1] = cC2[k];
    fCls[nf] = cCls[k]; fM1[nf] = cM1[k]; fM2[nf] = cM2[k];
    fSc[nf] = evalScore(cs7);
    nf++;
  }
  // 所有不衝突配對
  for (var a = 0; a < nf; a++) {
    var am1 = fM1[a], am2 = fM2[a], asc = fSc[a], acl = fCls[a] * 169;
    for (var b = a + 1; b < nf; b++) {
      if ((am1 & fM1[b]) | (am2 & fM2[b])) continue;
      var w = asc > fSc[b] ? 1 : asc < fSc[b] ? 0 : 0.5;
      var iAB = acl + fCls[b], iBA = fCls[b] * 169 + fCls[a];
      acc[iAB] += w; cnt[iAB]++;
      acc[iBA] += 1 - w; cnt[iBA]++;
    }
  }
  if ((bIdx + 1) % 2000 === 0) {
    console.log('  ' + (bIdx + 1) + '/' + BOARDS + ' boards (' +
      ((Date.now() - t0) / 1000).toFixed(0) + 's)');
  }
}
console.log('完成，共 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

/* ---------- 匯出 ---------- */
var EQ = new Array(169 * 169);
for (i = 0; i < 169 * 169; i++) {
  EQ[i] = cnt[i] > 0 ? Math.round(1000 * acc[i] / cnt[i]) : 500;
}
// equity vs random = row 加權平均（依實際 combo 對戰次數加權 → 天然含 blocker 效果）
var vsRaw = new Array(169);
var VS_RANDOM = new Array(169);
for (i = 0; i < 169; i++) {
  var w2 = 0, n2 = 0;
  for (var j2 = 0; j2 < 169; j2++) { w2 += acc[i * 169 + j2]; n2 += cnt[i * 169 + j2]; }
  vsRaw[i] = n2 > 0 ? w2 / n2 : 0.5;
  VS_RANDOM[i] = Math.round(1000 * vsRaw[i]);
}
var ORDER = [];
for (i = 0; i < 169; i++) ORDER.push(i);
ORDER.sort(function (x, y) { return vsRaw[y] - vsRaw[x] || x - y; });

var out = '/* 169\u00d7169 \u7ffb\u524d\u624b\u724c\u985e\u5225 equity \u8868 \u2014 \u7531 tools/gen-preflop-table.js \u81ea\u52d5\u7522\u751f\uff0c\u52ff\u624b\u52d5\u7de8\u8f2f\n' +
  ' * \u53c3\u6578: boards=' + BOARDS + ', seed=' + SEED + '\uff08\u53ef\u91cd\u73fe: node tools/gen-preflop-table.js ' + BOARDS + ' ' + SEED + '\uff09\n' +
  ' * \u7d22\u5f15: 13\u00d713 grid\uff0crow r / col c\uff080=A ... 12=2\uff09\uff0cidx=r*13+c\uff1b\n' +
  ' *       r===c \u5c0d\u5b50\uff0cr<c \u540c\u82b1\uff0cr>c \u96dc\u8272\n' +
  ' * EQ[i*169+j] = \u985e\u5225 i \u5c0d\u985e\u5225 j \u7684 equity\uff08\u5343\u5206\u4f4d 0-1000\uff0c\u542b\u5e73\u624b\u5404\u534a\uff09\n' +
  ' * VS_RANDOM[i] = \u985e\u5225 i \u5c0d\u96a8\u6a5f\u624b\u724c\u7684 equity\uff08\u5343\u5206\u4f4d\uff09\n' +
  ' * ORDER = \u4f9d VS_RANDOM \u7531\u5f37\u5230\u5f31\u7684\u985e\u5225\u7d22\u5f15\uff08top X% range \u6392\u5e8f\u4f9d\u64da\uff09 */\n' +
  '(function (global) {\n  \'use strict\';\n' +
  '  var EQ = [' + EQ.join(',') + '];\n' +
  '  var VS_RANDOM = [' + VS_RANDOM.join(',') + '];\n' +
  '  var ORDER = [' + ORDER.join(',') + '];\n' +
  '  var T = { EQ: EQ, VS_RANDOM: VS_RANDOM, ORDER: ORDER, N: 169 };\n' +
  '  if (typeof module !== \'undefined\' && module.exports) module.exports = T;\n' +
  '  else global.PreflopTable = T;\n' +
  '})(typeof window !== \'undefined\' ? window : this);\n';

var outPath = path.join(__dirname, '..', 'js', 'preflop-table.js');
fs.writeFileSync(outPath, out);
console.log('已寫入 ' + outPath + ' (' + (out.length / 1024).toFixed(0) + ' KB)');

// 快速 sanity print
function label(idx) {
  var R = 'AKQJT98765432';
  var r = Math.floor(idx / 13), c = idx % 13;
  if (r === c) return R[r] + R[r];
  return r < c ? R[r] + R[c] + 's' : R[c] + R[r] + 'o';
}
console.log('Top 10:', ORDER.slice(0, 10).map(label).join(' '));
console.log('AA vs random =', VS_RANDOM[0] / 10 + '%');
