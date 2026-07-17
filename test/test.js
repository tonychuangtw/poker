/* node test/test.js */
'use strict';
var Evaluator = require('../js/evaluator.js');
var EquityLib = require('../js/equity.js');
var ICM = require('../js/icm.js');
var PreflopTable = require('../js/preflop-table.js');
var PushFold = require('../js/pushfold.js');

var passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name); }
}
function cards(str) { return str.trim().split(/\s+/).map(Evaluator.cardFromString); }
function ev7(str) { return Evaluator.evaluate7(cards(str)); }
function cmp7(a, b) { return Evaluator.compareScore(ev7(a), ev7(b)); }

// ---------- 1. Evaluator ----------
console.log('--- Evaluator ---');

// straight flush beats quads
assert(cmp7('5h 6h 7h 8h 9h Ac Ad', 'Ac Ad Ah As Kc 2d 3h') > 0,
  'straight flush > quads');

// full house beats flush
assert(cmp7('Kc Kd Kh 2c 2d 7s 9s', 'Ah Qh 9h 5h 2h 3c 4d') > 0,
  'full house > flush');

// wheel straight (A-2-3-4-5) is a straight, high card = 5
var wheel = ev7('Ah 2c 3d 4s 5h 9c Jd');
assert(wheel[0] === 4 && wheel[1] === 5, 'wheel A-5 straight recognized, high=5');
// wheel loses to 6-high straight
assert(cmp7('Ah 2c 3d 4s 5h Kc Jd', '2h 3c 4d 5s 6h Kd Jc') < 0,
  'wheel straight < 6-high straight');

// kicker comparison: AK pair of aces beats AQ pair of aces
assert(cmp7('Ac Kd Ah 7s 5c 3d 2h', 'Ad Qc As 7h 5d 3c 2s') > 0,
  'pair of aces: K kicker > Q kicker');

// split pot: identical best hand from board
var boardStr = 'Ah Kh Qh Jh Th'; // royal on board
assert(Evaluator.compareScore(
  ev7('2c 3d ' + boardStr), ev7('7s 8c ' + boardStr)) === 0,
  'split pot detected (board plays)');

// misc category sanity
assert(ev7('Ac Ad Ah 2c 2d 7s 9s')[0] === 6, 'full house category');
assert(ev7('Ac Ad 7h 2c 5d 9s Jc')[0] === 1, 'one pair category');
assert(ev7('Ac Kd 7h 2c 5d 9s Jc')[0] === 0, 'high card category');
assert(ev7('Ac Ad Kh Kc 5d 9s Jc')[0] === 2, 'two pair category');

// ---------- 2. Equity ----------
console.log('--- Equity ---');

// AA vs KK preflop ~ 80-82% (MC)
var r1 = EquityLib.computeEquity(cards('As Ah'), cards('Ks Kh'), [], 50000);
console.log('  AA vs KK hero equity = ' + (r1.hero * 100).toFixed(2) + '% (' + r1.method + ')');
assert(r1.hero > 0.78 && r1.hero < 0.84, 'AA vs KK equity in 78-84% (target ~81 +/- 2)');

// AKs vs AKo — high tie%
var r2 = EquityLib.computeEquity(cards('Ah Kh'), cards('As Kc'), [], 50000);
console.log('  AKs vs AKo tie = ' + (r2.tie * 100).toFixed(2) + '%');
assert(r2.tie > 0.5, 'AKs vs AKo tie% > 50%');

// exact on full board: hero has nuts -> 100/0
var r3 = EquityLib.computeEquity(cards('Ah Kh'), cards('2c 2d'),
  cards('Qh Jh Th 3s 4d'));
assert(r3.method === 'exact' && r3.hero === 1 && r3.villain === 0,
  'river exact: royal flush = 100/0');

// exact on full board: chopped pot -> 50/50
var r4 = EquityLib.computeEquity(cards('Ac 2h'), cards('Ad 3c'),
  cards('Ah Kd Qs Jc Th')); // broadway on board, both play the board straight
assert(r4.method === 'exact' && Math.abs(r4.hero - 0.5) < 1e-9 && r4.tie === 1,
  'river exact: chop = 50/50');

// enumeration used when 2 cards to come
var r5 = EquityLib.computeEquity(cards('As Ah'), cards('Ks Kh'), cards('2c 7d Jh'));
assert(r5.method === 'exact' && r5.trials === (45 * 44) / 2,
  'flop known -> exact enumeration of C(45,2)=990 turns/rivers');

// EV helper
var evVal = EquityLib.callEV(0.5, 100, 50);
assert(Math.abs(evVal - 25) < 1e-9, 'callEV(0.5, 100, 50) = 25');

// ---------- 2b. Multiway equity ----------
console.log('--- Multiway equity ---');

// 3-way AA vs KK vs QQ preflop (MC): ordering + sum to 1
var m1 = EquityLib.computeEquityMulti(
  [cards('As Ah'), cards('Ks Kh'), cards('Qs Qh')], [], 50000);
var m1sum = m1.players.reduce(function (s, p) { return s + p.equity; }, 0);
console.log('  AA/KK/QQ = ' + m1.players.map(function (p) { return (p.equity * 100).toFixed(1) + '%'; }).join(' / '));
assert(Math.abs(m1sum - 1) < 1e-9, 'multiway equities sum to 1');
assert(m1.players[0].equity > m1.players[1].equity &&
       m1.players[1].equity > m1.players[2].equity,
  'AA > KK > QQ 3-way ordering');
assert(m1.players[0].equity > 0.60 && m1.players[0].equity < 0.71,
  'AA 3-way vs KK,QQ equity ~65% (60-71 band)');

// multiway matches heads-up path for 2 hands (river exact)
var m2 = EquityLib.computeEquityMulti(
  [cards('Ah Kh'), cards('2c 2d')], cards('Qh Jh Th 3s 4d'));
assert(m2.method === 'exact' && m2.players[0].equity === 1 && m2.players[1].equity === 0,
  'multiway with 2 hands: royal = 100/0');

// 3-way chop on board straight -> each 1/3
var m3 = EquityLib.computeEquityMulti(
  [cards('Ac 2h'), cards('Ad 3c'), cards('As 4d')],
  cards('Ah Kd Qs Jc Th'));
assert(m3.method === 'exact' &&
  m3.players.every(function (p) { return Math.abs(p.equity - 1 / 3) < 1e-9 && p.tie === 1; }),
  '3-way board-plays chop: each exactly 1/3');

// exact enumeration with 3 hands on flop: C(43,2)=903 boards
var m4 = EquityLib.computeEquityMulti(
  [cards('As Ah'), cards('Ks Kh'), cards('Qs Qh')], cards('2c 7d Jh'));
assert(m4.method === 'exact' && m4.trials === (43 * 42) / 2,
  '3-way flop -> exact C(43,2)=903');

// duplicate card across hands must throw
var threw = false;
try {
  EquityLib.computeEquityMulti([cards('As Ah'), cards('As Kh')], []);
} catch (e) { threw = true; }
assert(threw, 'duplicate card across multiway hands throws');

// 6 players allowed, 7 rejected
threw = false;
try {
  EquityLib.computeEquityMulti(
    [cards('As Ah'), cards('Ks Kh'), cards('Qs Qh'), cards('Js Jh'),
     cards('Ts Th'), cards('9s 9h'), cards('8s 8h')], []);
} catch (e) { threw = true; }
assert(threw, '7 hands rejected (max 6)');

// ---------- 3. ICM ----------
console.log('--- ICM ---');

var evs = ICM.icmEV([1000, 1000, 1000], [50, 30, 20]);
console.log('  equal stacks EVs = ' + evs.map(function (x) { return x.toFixed(4); }).join(', '));
assert(evs.every(function (x) { return Math.abs(x - 100 / 3) < 1e-9; }),
  '3 equal stacks, payouts [50,30,20] -> each EV = 33.33');

var evs2 = ICM.icmEV([5000, 3000, 2000, 1000], [500, 300, 200]);
var sum2 = evs2.reduce(function (a, b) { return a + b; }, 0);
assert(Math.abs(sum2 - 1000) < 1e-6, 'ICM EVs sum to prize pool (1000)');
assert(evs2[0] > evs2[1] && evs2[1] > evs2[2] && evs2[2] > evs2[3],
  'ICM EV monotonic in stack size');
// big stack EV < chip-proportional share of pool (ICM discount)
assert(evs2[0] < 1000 * (5000 / 11000), 'chip leader EV < chip-EV share');

// ---------- 4. Preflop table ----------
console.log('--- Preflop table ---');

function labelIdx(label) {
  // 找出類別索引
  for (var i = 0; i < 169; i++) if (PushFold.classLabel(i) === label) return i;
  throw new Error('bad label ' + label);
}

assert(PreflopTable.EQ.length === 169 * 169 && PreflopTable.ORDER.length === 169,
  'table dimensions 169x169 / ORDER 169');
assert(PreflopTable.VS_RANDOM[labelIdx('AA')] > 800, 'AA vs random > 80%');
assert(PreflopTable.VS_RANDOM[labelIdx('32o')] < 400, '32o vs random < 40%');

var aaKk = PreflopTable.EQ[labelIdx('AA') * 169 + labelIdx('KK')] / 1000;
console.log('  AA vs KK (table) = ' + (aaKk * 100).toFixed(1) + '%');
assert(aaKk > 0.78 && aaKk < 0.84, 'table AA vs KK in 78-84%');

var akQq = PreflopTable.EQ[labelIdx('AKs') * 169 + labelIdx('QQ')] / 1000;
assert(akQq > 0.42 && akQq < 0.50, 'table AKs vs QQ in 42-50% (coin flip)');

// 對稱性：EQ[i][j] + EQ[j][i] = 1000（容忍四捨五入 ±1）
var symOk = true;
for (var si = 0; si < 169; si += 7) {
  for (var sj = 0; sj < 169; sj += 5) {
    var s = PreflopTable.EQ[si * 169 + sj] + PreflopTable.EQ[sj * 169 + si];
    if (Math.abs(s - 1000) > 1) { symOk = false; break; }
  }
}
assert(symOk, 'table symmetry: EQ[i][j] + EQ[j][i] = 1000 (±1)');
assert(PreflopTable.EQ[labelIdx('77') * 169 + labelIdx('77')] === 500,
  'mirror match 77 vs 77 = 50%');

// ---------- 5. PushFold: range / combos ----------
console.log('--- PushFold range ---');

var top5 = PushFold.topPercentRange(5).map(PushFold.classLabel);
console.log('  top 5% = ' + top5.join(' '));
assert(top5.indexOf('AA') >= 0 && top5.indexOf('KK') >= 0 && top5.indexOf('AKs') >= 0,
  'top 5% contains AA / KK / AKs');
assert(top5.indexOf('72o') < 0, 'top 5% excludes 72o');

var all = PushFold.topPercentRange(100);
var allCombos = all.reduce(function (a, i) { return a + PushFold.comboCount(i); }, 0);
assert(all.length === 169 && allCombos === 1326, 'top 100% = 169 classes / 1326 combos');

// combo counting with blockers
var cardsAsAh = ['As', 'Ah'].map(Evaluator.cardFromString);
assert(PushFold.combosAvailable(labelIdx('AA'), cardsAsAh) === 1,
  'AA combos with As Ah blocked = 1');
assert(PushFold.combosAvailable(labelIdx('AKs'), cardsAsAh) === 2,
  'AKs combos with As Ah blocked = 2');
assert(PushFold.combosAvailable(labelIdx('72o'), cardsAsAh) === 12,
  '72o combos unaffected by As Ah = 12');

// parseHand
assert(PushFold.parseHand('A5s').label === 'A5s', 'parseHand A5s');
assert(PushFold.parseHand('tt').label === 'TT', 'parseHand tt -> TT');
assert(PushFold.parseHand('AhKs').label === 'AKo', 'parseHand AhKs -> AKo class');
assert(PushFold.parseHand('KhAh').label === 'AKs', 'parseHand KhAh -> AKs class');
var threw = false;
try { PushFold.parseHand('AK'); } catch (e) { threw = true; }
assert(threw, 'parseHand AK without s/o throws');

// icmEVWithBusts：出局者領完賽名次獎金
var bust = PushFold.icmEVWithBusts([0, 1000], [100, 50]);
assert(bust[0] === 50 && bust[1] === 100, 'busted player gets 2nd place payout');
var bust3 = PushFold.icmEVWithBusts([2000, 0, 1000], [60, 30, 10]);
assert(bust3[1] === 10 && Math.abs(bust3[0] + bust3[2] - 90) < 1e-9,
  '3-way with one bust: bust gets 3rd, others split 90 by ICM');

// ---------- 6. PushFold: shove EV ----------
console.log('--- PushFold shove EV ---');

// 2 人 winner-take-all、無盲注、range 100%（必被跟注）→ shove EV = equity × 獎池（純 cEV）
var wta = PushFold.computeShoveEV({
  stacks: [1000, 1000], payouts: [100],
  heroIdx: 0, callerIdx: 1, hand: 'AA', callPct: 100,
  sb: 0, bb: 0, ante: 0, heroPos: 'other', callerPos: 'other'
});
console.log('  WTA AA: equity=' + (wta.equity * 100).toFixed(1) +
  '%, shoveEV=' + wta.shoveEV.toFixed(2) + ', foldEV=' + wta.foldEV.toFixed(2));
assert(Math.abs(wta.pCall - 1) < 1e-9, 'WTA 100% range -> P(call)=1');
assert(Math.abs(wta.shoveEV - wta.equity * 100) < 1e-9,
  'WTA equal stacks: shove EV = equity x prize (cEV)');
assert(Math.abs(wta.foldEV - 50) < 1e-9, 'WTA equal stacks, no blinds: fold EV = 50');
assert(wta.verdict === 'SHOVE' && wta.shoveEV > 80, 'AA vs any-two WTA -> clear SHOVE');

// 對稱檢查：同場景弱牌（32o，equity < 50%）→ FOLD
var weak = PushFold.computeShoveEV({
  stacks: [1000, 1000], payouts: [100],
  heroIdx: 0, callerIdx: 1, hand: '32o', callPct: 100,
  sb: 0, bb: 0, ante: 0, heroPos: 'other', callerPos: 'other'
});
assert(weak.equity < 0.5 && weak.verdict === 'FOLD',
  'WTA 32o vs any-two -> FOLD (equity < 50%)');

// 全蓋情境：range 0.1%（只有 AA 會跟）→ P(call) 小；hero 拿 32o 但對手幾乎全蓋
// 盲注結構：hero SB 50、caller BB 100 → 全蓋時 hero +100
var steal = PushFold.computeShoveEV({
  stacks: [1000, 1000], payouts: [100],
  heroIdx: 0, callerIdx: 1, hand: '32o', callPct: 0.1,
  sb: 50, bb: 100, ante: 0, heroPos: 'sb', callerPos: 'bb'
});
assert(Math.abs(steal.pCall - 6 / 1225) < 1e-9, 'top 0.1% = AA only -> P(call) = 6/1225');
assert(steal.evAllFold > steal.foldEV, 'stealing blinds beats folding SB (all-fold branch)');
console.log('  SB steal 32o: P(call)=' + (steal.pCall * 100).toFixed(2) +
  '%, shove=' + steal.shoveEV.toFixed(2) + ' vs fold=' + steal.foldEV.toFixed(2) +
  ' -> ' + steal.verdict);

// ICM 泡沫效應：3 人平分籌碼、獎金前 2 名平額 → 全下風險大、蓋牌保守正確
var bubble = PushFold.computeShoveEV({
  stacks: [1000, 1000, 1000], payouts: [50, 50],
  heroIdx: 0, callerIdx: 1, hand: 'KQs', callPct: 100,
  sb: 0, bb: 0, ante: 0, heroPos: 'other', callerPos: 'other'
});
// 蓋牌 EV = 100/3；全下：贏 -> 2000/0/1000 EV=50、輸 -> 0
assert(Math.abs(bubble.foldEV - 100 / 3) < 1e-9, 'satellite bubble fold EV = 33.33');
assert(bubble.verdict === 'FOLD' && bubble.evWin <= 50 + 1e-9,
  'satellite bubble: even KQs is a FOLD vs any-two call (ICM pressure)');

// 淨保守性檢查：所有情境 EV 都必須落在 [0, 獎池]
[wta, weak, steal, bubble].forEach(function (r, i) {
  assert(r.shoveEV >= -1e-9 && r.shoveEV <= 100 + 1e-9 &&
         r.foldEV >= -1e-9 && r.foldEV <= 100 + 1e-9,
    'scenario ' + (i + 1) + ' EVs within [0, prize pool]');
});

// ---------- 5b. Range vs range ----------
console.log('--- Range vs range ---');

// 對稱 range 勝率必為 50%
var sym = PushFold.rangeVsRange(30, 30);
assert(Math.abs(sym.equityA - 0.5) < 1e-9, 'symmetric ranges -> exactly 50%');

// 緊 range 打鬆 range 佔優
var tvl = PushFold.rangeVsRange(5, 50);
assert(tvl.equityA > 0.55 && tvl.equityA < 0.75,
  'top 5% vs top 50% equity in (55%,75%): ' + (tvl.equityA * 100).toFixed(1));

// 單調性：對手 range 越鬆，緊 range 勝率越高
var e20 = PushFold.rangeVsRange(5, 20).equityA;
var e60 = PushFold.rangeVsRange(5, 60).equityA;
var e100 = PushFold.rangeVsRange(5, 100).equityA;
assert(e20 < e60 && e60 < e100, 'top5% equity rises as villain widens: ' +
  (e20 * 100).toFixed(1) + ' < ' + (e60 * 100).toFixed(1) + ' < ' + (e100 * 100).toFixed(1));

// 100% vs 100% = 50%，combo 數 = 1326
var full = PushFold.rangeVsRange(100, 100);
assert(Math.abs(full.equityA - 0.5) < 1e-9 && full.combosA === 1326 && full.combosB === 1326,
  '100% vs 100% -> 50%, 1326 combos each');

// 非法輸入
var threw = false;
try { PushFold.rangeVsRange(0, 50); } catch (e) { threw = true; }
assert(threw, 'rangeVsRange rejects 0%');

// ---------- 5c. Range 記號展開 ----------
console.log('--- Range notation ---');

function labels(n) { return PushFold.rangeFromNotation(n).map(PushFold.classLabel).join(' '); }
assert(labels('77+') === 'AA KK QQ JJ TT 99 88 77', '77+ expands to pairs 77-AA');
assert(labels('A9s+') === 'AKs AQs AJs ATs A9s', 'A9s+ expands kicker up');
assert(labels('KQo') === 'KQo', 'exact offsuit combo');
assert(PushFold.rangeComboTotal(PushFold.rangeFromNotation('22+')) === 78, '13 pairs = 78 combos');
assert(PushFold.rangeComboTotal(PushFold.rangeFromNotation('AKs AKo AA KK')) === 4 + 12 + 6 + 6,
  'mixed notation combo total');

// 位置 range 單調變寬（UTG < HJ < CO < BTN）
var RFI = {
  utg: '66+ ATs+ KTs+ QTs+ JTs T9s 98s 87s 76s 65s AJo+ KQo',
  hj: '44+ A9s+ A5s A4s KTs+ QTs+ J9s+ T9s 98s 87s 76s 65s ATo+ KJo+ QJo',
  co: '22+ A2s+ K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 65s 54s A9o+ KTo+ QTo+ JTo',
  btn: '22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 96s+ 85s+ 74s+ 64s+ 53s+ 43s A2o+ K9o+ Q9o+ J9o+ T9o 98o'
};
var wUtg = PushFold.rangeComboTotal(PushFold.rangeFromNotation(RFI.utg));
var wHj = PushFold.rangeComboTotal(PushFold.rangeFromNotation(RFI.hj));
var wCo = PushFold.rangeComboTotal(PushFold.rangeFromNotation(RFI.co));
var wBtn = PushFold.rangeComboTotal(PushFold.rangeFromNotation(RFI.btn));
assert(wUtg < wHj && wHj < wCo && wCo < wBtn,
  'RFI widens by position: ' + [wUtg, wHj, wCo, wBtn].join(' < '));

var badTok = false;
try { PushFold.rangeFromNotation('AK'); } catch (e) { badTok = true; }
assert(badTok, 'non-pair without s/o rejected');

// ---------- 6. Nash HU push/fold ----------
console.log('--- Nash HU push/fold ---');
var Nash = require('../js/nash.js');

var n5 = Nash.solveNashHU(5), n10 = Nash.solveNashHU(10), n20 = Nash.solveNashHU(20);

// AA（idx 0）任何深度都推、都跟
[n5, n10, n20].forEach(function (r, i) {
  assert(r.pushSet[0] && r.callSet[0], 'AA in push & call set (scenario ' + (i + 1) + ')');
});

// range 隨籌碼變淺單調放寬
assert(n5.pushPct > n10.pushPct && n10.pushPct > n20.pushPct,
  'push range widens as stack shrinks: ' + n5.pushPct.toFixed(1) + ' > ' +
  n10.pushPct.toFixed(1) + ' > ' + n20.pushPct.toFixed(1));
assert(n5.callPct > n10.callPct && n10.callPct > n20.callPct,
  'call range widens as stack shrinks');

// 10bb 對照已知 Nash 值（push ~58%、call ~37%）
assert(n10.pushPct > 53 && n10.pushPct < 63, '10bb push% in [53,63]: ' + n10.pushPct.toFixed(1));
assert(n10.callPct > 32 && n10.callPct < 42, '10bb call% in [32,42]: ' + n10.callPct.toFixed(1));

// SB 推的 range 一定比 BB 跟的寬（fold equity）
assert(n10.pushPct > n10.callPct, 'push range wider than call range at 10bb');

// 垃圾牌 32o 在 20bb 兩邊都蓋
var idx32o = -1;
for (var q = 0; q < 169; q++) if (PushFold.classLabel(q) === '32o') idx32o = q;
assert(idx32o >= 0, 'found 32o class index');
assert(!n20.pushSet[idx32o] && !n20.callSet[idx32o], '32o folded both ways at 20bb');

// 確定性 + 快取
var again = Nash.solveNashHU(10);
assert(again.pushPct === n10.pushPct && again.callPct === n10.callPct, 'solver deterministic');
assert(Nash.solveCached(10) === Nash.solveCached(10), 'solveCached returns same object');

// 混合機率合法範圍
var probOk = n10.push.concat(n10.call).every(function (v) { return v >= 0 && v <= 1; });
assert(probOk, 'all mixed-strategy probabilities in [0,1]');

console.log('  5bb push ' + n5.pushPct.toFixed(1) + '% / call ' + n5.callPct.toFixed(1) +
  '%; 10bb ' + n10.pushPct.toFixed(1) + '/' + n10.callPct.toFixed(1) +
  '; 20bb ' + n20.pushPct.toFixed(1) + '/' + n20.callPct.toFixed(1));

// ---------- 6b. Range vs 手牌 ----------
console.log('--- Equity vs combos (range vs hand) ---');

function combosOf(notation) {
  var out = [];
  PushFold.rangeFromNotation(notation).forEach(function (ci) {
    PushFold.expandCombos(ci).forEach(function (vc) { out.push(vc); });
  });
  return out;
}

// AA vs {KK} 翻前 MC ~81%
var rvh1 = EquityLib.computeEquityVsCombos(cards('As Ah'), combosOf('KK'), [], 40000);
assert(rvh1.method === 'montecarlo', 'preflop vs combos uses MC');
assert(Math.abs(rvh1.hero - 0.815) < 0.03, 'AA vs KK range ~81.5% (got ' + (rvh1.hero * 100).toFixed(1) + ')');
assert(rvh1.combos === 6, 'KK has 6 combos vs AA (no blockers)');

// blocker：hero KsKh 讓 KK 只剩 1 combo
var rvh2 = EquityLib.computeEquityVsCombos(cards('Ks Kh'), combosOf('KK'), [], 5000);
assert(rvh2.combos === 1, 'KK vs KK hero blocks to 1 combo');
assert(Math.abs(rvh2.hero - 0.5) < 0.03, 'KK vs KK mirror ~50%');

// 全被 block → throw
var threw = false;
try { EquityLib.computeEquityVsCombos(cards('As Ah'), [[Evaluator.cardFromString('As'), Evaluator.cardFromString('Ad')]], []); }
catch (e) { threw = true; }
assert(threw, 'all-blocked range throws');

// flop exact：AA vs QQ+/AK（少 combo 時窮舉），AA 應大幅領先
var rvh3 = EquityLib.computeEquityVsCombos(cards('As Ah'), combosOf('QQ+ AKs AKo'), cards('2c 7d 9h'));
assert(rvh3.method === 'exact', 'flop small range uses exact enumeration');
assert(rvh3.hero > 0.75, 'AA crushes QQ+/AK on dry flop (got ' + (rvh3.hero * 100).toFixed(1) + ')');

// river exact 單一 combo：nuts vs air = 100%
var rvh4 = EquityLib.computeEquityVsCombos(cards('As Ks'), combosOf('32o'), cards('Qs Js Ts 2d 7h'));
assert(rvh4.method === 'exact' && rvh4.hero === 1, 'royal flush vs 32o on river = 100%');

// ---------- 6c. 關鍵手牌複盤 ----------
console.log('--- Hands review (HANDS) ---');
var HANDS = require('../js/hands.js');

// potOdds
assert(Math.abs(HANDS.potOdds(100, 50) - 1 / 3) < 1e-9, 'potOdds(100,50) = 1/3');
assert(HANDS.potOdds(100, 0) === 0, 'potOdds with toCall=0 -> 0 (check)');
threw = false;
try { HANDS.potOdds(-1, 10); } catch (e) { threw = true; }
assert(threw, 'potOdds rejects negative pot');

// callEVbb
assert(Math.abs(HANDS.callEVbb(0.4, 100, 50) - 10) < 1e-9, 'callEVbb(0.4,100,50) = 10');
assert(Math.abs(HANDS.callEVbb(1 / 3, 100, 50)) < 1e-9, 'breakeven equity -> EV = 0');
assert(HANDS.callEVbb(0.2, 100, 50) < 0, 'below breakeven -> negative EV');

// classifyDecision: call
var cd1 = HANDS.classifyDecision('call', 0.4, 100, 50);
assert(cd1.verdict === 'good_call' && !cd1.leak && Math.abs(cd1.evBB - 10) < 1e-9,
  '+EV call -> good_call, EV=10bb');
var cd2 = HANDS.classifyDecision('call', 0.2, 100, 50);
assert(cd2.verdict === 'bad_call' && cd2.leak && cd2.evBB < 0,
  '-EV call -> bad_call (leak)');

// classifyDecision: fold
var cd3 = HANDS.classifyDecision('fold', 0.5, 100, 50);
assert(cd3.verdict === 'missed_call' && cd3.leak && cd3.evBB === 0,
  'fold with equity > pot odds -> missed_call (leak), EV=0');
var cd4 = HANDS.classifyDecision('fold', 0.2, 100, 50);
assert(cd4.verdict === 'good_fold' && !cd4.leak && cd4.evBB === 0,
  'fold with equity < pot odds -> good_fold');
var cd5 = HANDS.classifyDecision('fold', 0.9, 100, 0);
assert(cd5.verdict === 'good_fold', 'fold facing no bet -> not a missed call');

// classifyDecision: raise / allin（簡化：未計 fold equity）
var cd6 = HANDS.classifyDecision('raise', 0.6, 100, 50);
assert(cd6.verdict === 'raise_ahead' && cd6.simplified && !cd6.leak,
  'raise with equity >= 50% -> raise_ahead, simplified flag');
var cd7 = HANDS.classifyDecision('allin', 0.3, 100, 50);
assert(cd7.verdict === 'raise_behind' && cd7.simplified && !cd7.leak,
  'allin behind range -> raise_behind, not counted as leak');
threw = false;
try { HANDS.classifyDecision('check', 0.5, 100, 50); } catch (e) { threw = true; }
assert(threw, 'unknown action throws');

// parseCards
var pc1 = HANDS.parseCards('As Kd', 2);
assert(pc1.length === 2 &&
  Evaluator.cardToString(pc1[0]) === 'As' && Evaluator.cardToString(pc1[1]) === 'Kd',
  'parseCards "As Kd"');
var pc2 = HANDS.parseCards('AsKd', 2);
assert(pc2[0] === pc1[0] && pc2[1] === pc1[1], 'parseCards concatenated "AsKd"');
assert(HANDS.parseCards('Qh 7d 2s', 3).length === 3, 'parseCards 3-card flop');
threw = false;
try { HANDS.parseCards('As As', 2); } catch (e) { threw = true; }
assert(threw, 'parseCards rejects duplicate cards');
threw = false;
try { HANDS.parseCards('As', 2); } catch (e) { threw = true; }
assert(threw, 'parseCards enforces expected count');

// analyzeStreet：river exact，nuts vs 32o -> equity 100%、+EV call
var as1 = HANDS.analyzeStreet({
  street: 'river',
  heroCards: cards('As Ks'),
  board: cards('Qs Js Ts 2d 7h'),
  range: '32o', pot: 10, toCall: 5, action: 'call'
});
assert(as1.method === 'exact' && as1.equity === 1, 'analyzeStreet river nuts equity = 100%');
assert(as1.verdict === 'good_call' && Math.abs(as1.evBB - 10) < 1e-9,
  'analyzeStreet nuts call: EV = 1x(10+5)-5 = 10bb');
assert(Math.abs(as1.needed - 1 / 3) < 1e-9, 'analyzeStreet pot odds = 33.3%');

// analyzeStreet：river drawing dead 卻跟注 -> bad_call
var as2 = HANDS.analyzeStreet({
  street: 'river',
  heroCards: cards('3c 2h'),
  board: cards('Qs Js Ts 2d 7h'),
  range: 'AA', pot: 10, toCall: 5, action: 'call'
});
assert(as2.equity === 0 && as2.verdict === 'bad_call' && as2.leak,
  'analyzeStreet drawing-dead call -> bad_call leak');

// analyzeStreet 驗證 board 張數
threw = false;
try {
  HANDS.analyzeStreet({ street: 'flop', heroCards: cards('As Ks'),
    board: cards('Qs Js'), range: 'AA', pot: 10, toCall: 5, action: 'call' });
} catch (e) { threw = true; }
assert(threw, 'analyzeStreet rejects wrong board length for street');

// leakSummary
var fakeHands = [
  { streets: [
    { street: 'flop', analysis: { verdict: 'bad_call' } },
    { street: 'river', analysis: { verdict: 'missed_call' } }
  ] },
  { streets: [
    { street: 'flop', analysis: { verdict: 'good_call' } },
    { street: 'flop', analysis: { verdict: 'bad_call' } }
  ] }
];
var ls = HANDS.leakSummary(fakeHands);
assert(ls.decisions === 4 && ls.badCalls === 2 && ls.missedCalls === 1,
  'leakSummary totals: 4 decisions / 2 bad calls / 1 missed call');
assert(ls.byStreet.flop.badCalls === 2 && ls.byStreet.river.missedCalls === 1 &&
       ls.byStreet.turn.decisions === 0,
  'leakSummary per-street breakdown');
assert(HANDS.leakSummary([]).decisions === 0, 'leakSummary empty list ok');

// ---------- 7. 賽事資料 ----------
console.log('--- Tournaments data ---');
var tourneys = JSON.parse(require('fs').readFileSync(__dirname + '/../data/tournaments.json', 'utf8'));
assert(/^\d{4}-\d{2}-\d{2}$/.test(tourneys.updated), 'tournaments.json has ISO updated date');
assert(Array.isArray(tourneys.events) && tourneys.events.length >= 3, 'at least 3 events');
var evOk = tourneys.events.every(function (ev) {
  return typeof ev.series === 'string' && ev.series &&
    typeof ev.region === 'string' && ev.region &&
    typeof ev.country === 'string' && ev.country &&
    typeof ev.city === 'string' && ev.city &&
    (ev.start === '' || /^\d{4}-\d{2}-\d{2}$/.test(ev.start)) &&
    (ev.end === '' || /^\d{4}-\d{2}-\d{2}$/.test(ev.end)) &&
    typeof ev.url === 'string';
});
assert(evOk, 'every event has series/region/country/city + ISO or empty dates + url');

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
