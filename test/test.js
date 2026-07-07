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

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
