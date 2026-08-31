/* node test/test.js */
'use strict';
global.t = global.t || function (s) { return s; }; /* i18n stub for Node */
var Evaluator = require('../js/evaluator.js');
var EquityLib = require('../js/equity.js');
var ICM = require('../js/icm.js');
var PreflopTable = require('../js/preflop-table.js');
var PushFold = require('../js/pushfold.js');
var TrackerStats = require('../js/tracker-stats.js');

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

// bestScore：5/6/7 張都取最佳 5 張
assert(EquityLib.bestScore(cards('Ah Kh Qh Jh Th 2c'))[0] === 8,
  'bestScore: 6 張取最佳 = 同花順');
assert(EquityLib.bestScore(cards('Ac Ad 7h 2c 5d'))[0] === 1,
  'bestScore: 5 張直算 = 一對');

// outsNext：落後方下一張反超的 outs
var on = EquityLib.outsNext(
  [cards('2c 2d'), cards('Ac Kc')], cards('As Kd 7h'));
assert(on && on.trail === 0 && on.outs.length === 2,
  'outsNext: 22 vs AK 頂兩對，flop 反超 outs = 2 張（剩下兩張 2）');
on = EquityLib.outsNext(
  [cards('Ah Kh'), cards('2c 2d')], cards('Qh 7h 3s 8c'));
assert(on && on.trail === 0 && on.outs.length === 15,
  'outsNext: 同花聽＋兩張 overcard，turn 反超 outs = 15 張（9 紅心＋3A＋3K）');
assert(EquityLib.outsNext([cards('Ah Kh'), cards('2c 2d')], cards('Qh 7h')) === null,
  'outsNext: 非翻牌/轉牌回 null');
assert(EquityLib.outsNext(
  [cards('Ah Kh'), cards('2c 2d'), cards('7s 8s')], cards('Qh 7h 3s')) === null,
  'outsNext: 三人以上回 null');

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

// ---------- 3b. Final table 分錢 ----------
console.log('--- Deal calculator ---');

// ICM deal 合計 = 剩餘獎池 + 已鎖定總額
var deal1 = ICM.icmDeal([5000, 3000, 2000], [50, 30, 20], 1000, [100, 100, 100]);
var dealSum = deal1.reduce(function (a, b) { return a + b; }, 0);
assert(Math.abs(dealSum - 1300) < 1e-9, 'ICM deal sums to pool + locked (1300)');

// chip-chop：鎖定以外的部分嚴格依籌碼比例
var chop1 = ICM.chipChopDeal([5000, 3000, 2000], 1000, [100, 100, 100]);
assert(Math.abs(chop1[0] - 600) < 1e-9 && Math.abs(chop1[1] - 400) < 1e-9 &&
       Math.abs(chop1[2] - 300) < 1e-9,
  'chip-chop proportional: 600/400/300 with 100 locked each');
var chopSum = chop1.reduce(function (a, b) { return a + b; }, 0);
assert(Math.abs(chopSum - 1300) < 1e-9, 'chip-chop sums to pool + locked (1300)');

// 已知 2 人對稱情境：籌碼相等 → 各拿一半
var deal2 = ICM.icmDeal([4000, 4000], [60, 40], 500);
var chop2 = ICM.chipChopDeal([4000, 4000], 500);
assert(Math.abs(deal2[0] - 250) < 1e-9 && Math.abs(deal2[1] - 250) < 1e-9,
  '2-player symmetric ICM deal = 250/250');
assert(Math.abs(chop2[0] - 250) < 1e-9, '2-player symmetric chip-chop = 250/250');

// ICM 分法對短碼較有利、chip leader 被折價
var dIcm = ICM.icmDeal([3000, 1000], [60, 40], 100);
var dChop = ICM.chipChopDeal([3000, 1000], 100);
assert(dIcm[1] > dChop[1] && dIcm[0] < dChop[0],
  'ICM deal favors short stack vs chip-chop');

// 獎金結構名次多於剩餘人數時自動截斷（2 人只分前 2 名比例）
var deal3 = ICM.icmDeal([1000, 1000], [50, 30, 20], 100);
assert(Math.abs(deal3[0] - 50) < 1e-9 && Math.abs(deal3[1] - 50) < 1e-9,
  'payouts truncated to remaining players (2 equal stacks -> 50/50)');

// locked 選填：省略時等同全 0
var deal4 = ICM.icmDeal([5000, 3000, 2000], [50, 30, 20], 1000);
assert(Math.abs(deal4.reduce(function (a, b) { return a + b; }, 0) - 1000) < 1e-9,
  'locked omitted -> deal sums to pool only');

// 非法輸入
var dthrew = false;
try { ICM.icmDeal([1000], [100], 100); } catch (e) { dthrew = true; }
assert(dthrew, 'icmDeal rejects single player');

// ---------- 3c. 記帳分析 ----------
console.log('--- Tracker stats ---');

var tsess = [
  { date: '2026-01-05', type: 'cash', venue: 'CTP', tag: '系列A', buyin: 100, cashout: 300, hours: 2 },
  { date: '2026-01-06', type: 'cash', venue: 'CTP', tag: '系列A', buyin: 100, cashout: 0, hours: 2 },
  { date: '2026-01-07', type: 'mtt', venue: '線上', buyin: 50, cashout: 80 },   // 舊紀錄無 tag → 退回場地
  { date: '2026-02-02', type: 'mtt', venue: '', buyin: 50, cashout: 40 }        // 無 tag 無場地 → 未標籤
];
var tags = TrackerStats.tagStats(tsess);
assert(tags.length === 3, 'tagStats: 3 groups');
assert(tags[0].tag === '系列A' && tags[0].n === 2 && Math.abs(tags[0].pl - 100) < 1e-9,
  'tagStats: 系列A n=2, pl=+100, sorted first');
assert(Math.abs(tags[0].hourly - 25) < 1e-9, 'tagStats: 系列A hourly = 100/4 = 25');
assert(tags[1].tag === '線上' && tags[1].hourly === null,
  'tagStats: untagged falls back to venue, hourly null without hours');
assert(tags[2].tag === '未標籤' && Math.abs(tags[2].pl + 10) < 1e-9,
  'tagStats: no tag/venue grouped as 未標籤, sorted last by profit');

var months = TrackerStats.monthlyStats(tsess);
assert(months.length === 2 && months[0].month === '2026-01' && months[1].month === '2026-02',
  'monthlyStats: grouped into 2 months, ascending');
assert(months[0].n === 3 && Math.abs(months[0].pl - 130) < 1e-9 && months[0].hours === 4,
  'monthlyStats: 2026-01 n=3, pl=+130, hours=4');
assert(months[1].n === 1 && Math.abs(months[1].pl + 10) < 1e-9,
  'monthlyStats: 2026-02 n=1, pl=-10');

// 傾斜偵測：合成序列 pl = [100,-50,-50,30,-20,60,10,-40,-40,-40,80]
var tiltPls = [100, -50, -50, 30, -20, 60, 10, -40, -40, -40, 80];
var tiltSess = tiltPls.map(function (p, i) {
  var d = i + 1;
  return { date: '2026-03-' + (d < 10 ? '0' + d : d), type: 'cash',
           buyin: 100, cashout: 100 + p };
});
var tilt = TrackerStats.tiltStats(tiltSess);
assert(tilt.n === 11 && Math.abs(tilt.overallAvg - 40 / 11) < 1e-9,
  'tiltStats: overall avg = 40/11');
assert(tilt.afterLossCount === 6 && Math.abs(tilt.afterLossAvg - 40 / 6) < 1e-9,
  'tiltStats: 6 sessions after a loss, avg = 40/6');
assert(tilt.longestLossStreak === 3, 'tiltStats: longest losing streak = 3');

// 空清單不炸
var tilt0 = TrackerStats.tiltStats([]);
assert(tilt0.n === 0 && tilt0.afterLossAvg === null && tilt0.longestLossStreak === 0,
  'tiltStats: empty list safe defaults');

// 行為標籤彙總
var msess = [
  { date: '2026-08-03', buyin: 100, cashout: 300, mood: ['狀態好'] },          // +200
  { date: '2026-08-04', buyin: 100, cashout: 200, mood: ['狀態好', '魚多'] },  // +100
  { date: '2026-08-05', buyin: 100, cashout: 0, mood: ['上頭'] },              // -100
  { date: '2026-08-06', buyin: 100, cashout: 50 }                              // 無標籤
];
var moods = TrackerStats.moodStats(msess);
assert(moods.length === 3, 'moodStats: 3 tags');
assert(moods[0].tag === '狀態好' && moods[0].n === 2 && moods[0].pl === 300 && moods[0].avg === 150,
  'moodStats: 狀態好 n=2 pl=+300 avg=+150, sorted first by avg');
assert(moods[moods.length - 1].tag === '上頭' && moods[moods.length - 1].avg === -100,
  'moodStats: 上頭 avg=-100 last');
assert(TrackerStats.moodStats([]).length === 0, 'moodStats: empty safe');

// 規則型洞察
function mk(date, pl, extra) {
  var r = { date: date, buyin: 100, cashout: 100 + pl };
  if (extra) for (var k in extra) r[k] = extra[k];
  return r;
}
// 平日全贏、週末全輸，各 5 場（2026-08-03 一 ~ 08-09 日）
var isess = [
  mk('2026-08-03', 50), mk('2026-08-04', 50), mk('2026-08-05', 50), mk('2026-08-06', 50), mk('2026-08-07', 50),
  mk('2026-08-08', -30), mk('2026-08-09', -30), mk('2026-08-15', -30), mk('2026-08-16', -30), mk('2026-08-22', -30)
];
var ins = TrackerStats.insights(isess);
var wkIns = ins.filter(function (x) { return x.k === 'weekday'; })[0];
assert(wkIns && wkIns.a === 50 && wkIns.b === -30 && wkIns.an === 5 && wkIns.bn === 5,
  'insights: weekday vs weekend a=+50 b=-30');
assert(TrackerStats.insights(isess.slice(0, 6)).filter(function (x) { return x.k === 'weekday'; }).length === 0,
  'insights: below minN emits nothing');
// 場地洞察：A 場全贏 B 場全輸
var vsess = [];
for (var vi = 0; vi < 5; vi++) { vsess.push(mk('2026-08-0' + (vi + 1), 40, { venue: 'A' })); }
for (vi = 0; vi < 5; vi++) { vsess.push(mk('2026-08-1' + vi, -40, { venue: 'B' })); }
var vIns = TrackerStats.insights(vsess);
assert(vIns.filter(function (x) { return x.k === 'venue-best' && x.name === 'A' && x.a === 40; }).length === 1,
  'insights: venue-best A +40');
assert(vIns.filter(function (x) { return x.k === 'venue-worst' && x.name === 'B' && x.a === -40; }).length === 1,
  'insights: venue-worst B -40');
assert(TrackerStats.insights([]).length === 0, 'insights: empty safe');
// 現場 vs 線上
var asess = [];
for (var ai = 0; ai < 5; ai++) { asess.push(mk('2026-08-0' + (ai + 1), 60)); }              // 無 arena → 視為現場
for (ai = 0; ai < 5; ai++) { asess.push(mk('2026-08-1' + ai, -20, { arena: 'online' })); }
var aIns = TrackerStats.insights(asess).filter(function (x) { return x.k === 'arena'; })[0];
assert(aIns && aIns.a === 60 && aIns.b === -20 && aIns.an === 5 && aIns.bn === 5,
  'insights: arena live +60 vs online -20, legacy defaults to live');

// summary（統計磚：場次/平均/勝率/ROI/時薪）
var ssess = [
  { date: '2026-08-01', buyin: 100, cashout: 300, hours: 2 },  // +200
  { date: '2026-08-02', buyin: 100, cashout: 0, hours: 2 },    // -100
  { date: '2026-08-03', buyin: 100, cashout: 100 }             // 0，無時數
];
var sm = TrackerStats.summary(ssess);
assert(sm.n === 3 && sm.pl === 100 && sm.buyin === 300, 'summary: n/pl/buyin');
assert(Math.abs(sm.avg - 100 / 3) < 1e-9, 'summary: avg');
assert(Math.abs(sm.winRate - 100 / 3) < 1e-9, 'summary: winRate counts pl>0 only');
assert(Math.abs(sm.roi - 100 / 3) < 1e-9, 'summary: roi = pl/buyin');
assert(sm.hours === 4 && sm.hourly === 25, 'summary: hourly over timed sessions only');
var sm0 = TrackerStats.summary([]);
assert(sm0.n === 0 && sm0.winRate === null && sm0.roi === null && sm0.hourly === null,
  'summary: empty safe');

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

// 區間記號（dash）
assert(labels('88-22') === '88 77 66 55 44 33 22', '88-22 pair range expands');
assert(labels('22-44') === '44 33 22', '22-44 order-insensitive pair range');
assert(labels('A5s-A2s') === 'A5s A4s A3s A2s', 'A5s-A2s suited kicker range');
assert(labels('A2o-A4o') === 'A4o A3o A2o', 'A2o-A4o order-insensitive offsuit range');
assert(PushFold.rangeComboTotal(PushFold.rangeFromNotation('K9s-K6s')) === 16,
  'K9s-K6s = 4 classes x 4 combos = 16');
var badDash = 0;
try { PushFold.rangeFromNotation('A9s-K6s'); } catch (e) { badDash++; } // 高牌不同
try { PushFold.rangeFromNotation('A9s-A6o'); } catch (e) { badDash++; } // s/o 不一致
try { PushFold.rangeFromNotation('A9-A6'); } catch (e) { badDash++; }   // 缺 s/o
try { PushFold.rangeFromNotation('88s-22'); } catch (e) { badDash++; }  // 對子帶 s
assert(badDash === 4, 'invalid dash notations all rejected');

// ---------- 5d. 防守 range 資料（js/ranges.js） ----------
console.log('--- Defense ranges (vs RFI) ---');
var Ranges = require('../js/ranges.js');

var nine = Ranges.DEF_SPOT_KEYS.filter(function (k) { return Ranges.DEF_SPOTS[k].table === 9; });
assert(Array.isArray(Ranges.DEF_SPOT_KEYS) && Ranges.DEF_SPOT_KEYS.length === 51,
  '51 defense spots defined (' + (51 - nine.length) + ' six-max + ' + nine.length + ' nine-max)');
assert(nine.length === 36 && nine.every(function (k) { return /9$/.test(k); }),
  '9-max defense spots flagged table=9 and keyed with a 9 suffix');
assert(Ranges.DEF_SPOT_KEYS.every(function (k) { return Ranges.DEF_SPOTS[k]; }),
  'every spot key resolves to a spot definition');
assert(Object.keys(Ranges.DEF_SPOTS).length === Ranges.DEF_SPOT_KEYS.length,
  'no orphan spot definitions outside DEF_SPOT_KEYS');

// 6-max 完整覆蓋：每個「開牌位置 → 其後每個位置」的組合都要有情境
var ORDER_6 = ['utg', 'hj', 'co', 'btn', 'sb', 'bb'];
var missing6 = [];
ORDER_6.forEach(function (opener, oi) {
  ORDER_6.slice(oi + 1).forEach(function (hero) {
    if (!Ranges.DEF_SPOTS[hero + '_vs_' + opener]) missing6.push(hero + '_vs_' + opener);
  });
});
assert(missing6.length === 0, '6-max vs-RFI coverage complete (missing: ' +
  (missing6.join(',') || 'none') + ')');

// 9-max 完整覆蓋：8 個開牌位置 × 其後每個位置 = 36 個情境
var ORDER_9 = ['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn', 'sb', 'bb'];
var missing9 = [];
ORDER_9.forEach(function (opener, oi) {
  ORDER_9.slice(oi + 1).forEach(function (hero) {
    if (!Ranges.DEF_SPOTS[hero + '_vs_' + opener + '9']) missing9.push(hero + '_vs_' + opener + '9');
  });
});
assert(missing9.length === 0, '9-max vs-RFI coverage complete (missing: ' +
  (missing9.join(',') || 'none') + ')');

Ranges.DEF_SPOT_KEYS.forEach(function (key) {
  var spot = Ranges.DEF_SPOTS[key];
  var tb, call, parsed = true;
  try {
    tb = PushFold.rangeFromNotation(spot.threeBet);
    call = PushFold.rangeFromNotation(spot.call);
  } catch (e) { parsed = false; }
  assert(parsed, key + ': notations parse');
  if (!parsed) return;
  assert(tb.length > 0 && call.length > 0, key + ': 3bet & call ranges non-empty');
  var tbC = PushFold.rangeComboTotal(tb), callC = PushFold.rangeComboTotal(call);
  var tbPct = tbC / 1326 * 100, totPct = (tbC + callC) / 1326 * 100;
  assert(tbPct >= 1.2 && tbPct <= 16,
    key + ': 3bet in 1.2-16% (' + tbPct.toFixed(1) + '%, ' + tbC + ' combos)');
  // call 與 3bet 不可重疊（測驗需要唯一正解）
  var tbSet = {};
  tb.forEach(function (i) { tbSet[i] = true; });
  assert(call.every(function (i) { return !tbSet[i]; }), key + ': call/3bet disjoint');
  if (key.indexOf('bb_') === 0) {
    assert(totPct >= 20 && totPct <= 45,
      key + ': BB total defend in 20-45% (' + totPct.toFixed(1) + '%)');
  } else {
    assert(totPct < 30, key + ': non-BB total continue < 30% (' + totPct.toFixed(1) + '%)');
  }
  // 價值核心：AA/KK 一定在 3bet range
  var idxAA = labelIdx('AA'), idxKK = labelIdx('KK');
  assert(tbSet[idxAA] && tbSet[idxKK], key + ': AA & KK in 3bet range');
  // 垃圾牌一定蓋：72o 不在 call 也不在 3bet
  var idx72o = labelIdx('72o');
  assert(!tbSet[idx72o] && call.indexOf(idx72o) < 0, key + ': 72o folded');
  // 對子不可以有破洞：防守的對子必須是「AA 往下連續一段」。
  // 破洞（例如 JJ+ 3-bet、TT 棄、99 跟注）代表排序被隱含賠率加成翻過去了。
  var pairIn = [];
  for (var pr = 0; pr < 13; pr++) {
    var pi = pr * 13 + pr;
    if (tbSet[pi] || call.indexOf(pi) >= 0) pairIn.push(pr);
  }
  var contiguous = pairIn.length === 0 ||
    (pairIn[0] === 0 && pairIn[pairIn.length - 1] - pairIn[0] === pairIn.length - 1);
  assert(contiguous, key + ': defended pairs form a gapless top run (' +
    pairIn.map(function (r) { return PushFold.classLabel(r * 13 + r); }).join(',') + ')');
});

// BB 防守寬於中間位置的冷跟 range
var bbBtnTot = PushFold.rangeComboTotal(PushFold.rangeFromNotation(Ranges.DEF_SPOTS.bb_vs_btn.call)) +
  PushFold.rangeComboTotal(PushFold.rangeFromNotation(Ranges.DEF_SPOTS.bb_vs_btn.threeBet));
var coUtgTot = PushFold.rangeComboTotal(PushFold.rangeFromNotation(Ranges.DEF_SPOTS.co_vs_utg.call)) +
  PushFold.rangeComboTotal(PushFold.rangeFromNotation(Ranges.DEF_SPOTS.co_vs_utg.threeBet));
assert(bbBtnTot > coUtgTot * 2, 'BB vs BTN defends much wider than CO vs UTG');

/* 產生出來的 9-max 表要滿足的關係（這些才是「表有沒有寫歪」的真正檢查）：
 * 位置越好防守越寬、對手開得越寬防守越寬、BB 最寬、SB 冷跟最窄。 */
function defTot(key) {
  var s = Ranges.DEF_SPOTS[key];
  return PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.threeBet)) +
    PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.call));
}
function defCall(key) {
  return PushFold.rangeComboTotal(PushFold.rangeFromNotation(Ranges.DEF_SPOTS[key].call));
}
var COLD_9 = ['utg1', 'mp', 'lj', 'hj', 'co', 'btn'];   // 冷跟位置，由差到好
var badOrder = [];
['utg', 'utg1', 'mp', 'lj', 'hj'].forEach(function (opener) {
  var oi = ORDER_9.indexOf(opener);
  var seats = COLD_9.filter(function (h) { return ORDER_9.indexOf(h) > oi; });
  for (var i = 1; i < seats.length; i++) {
    var prev = seats[i - 1] + '_vs_' + opener + '9', cur = seats[i] + '_vs_' + opener + '9';
    if (defTot(cur) < defTot(prev)) badOrder.push(cur + '<' + prev);
  }
});
assert(badOrder.length === 0,
  '9-max: closer to the button always defends wider (' + (badOrder.join(',') || 'ok') + ')');

var badWide = [];
['bb', 'sb', 'btn'].forEach(function (hero) {
  var openers = ['utg', 'utg1', 'mp', 'lj', 'hj', 'co'].filter(function (o) {
    return Ranges.DEF_SPOTS[hero + '_vs_' + o + '9'];
  });
  for (var i = 1; i < openers.length; i++) {
    var prev = hero + '_vs_' + openers[i - 1] + '9', cur = hero + '_vs_' + openers[i] + '9';
    if (defTot(cur) < defTot(prev)) badWide.push(cur + '<' + prev);
  }
});
assert(badWide.length === 0,
  '9-max: a wider opener is always defended wider (' + (badWide.join(',') || 'ok') + ')');

var badBb = [], badSb = [];
['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn'].forEach(function (opener) {
  var bbKey = 'bb_vs_' + opener + '9', sbKey = 'sb_vs_' + opener + '9';
  if (!Ranges.DEF_SPOTS[bbKey]) return;
  COLD_9.concat(['sb']).forEach(function (hero) {
    var k = hero + '_vs_' + opener + '9';
    if (Ranges.DEF_SPOTS[k] && defTot(k) >= defTot(bbKey)) badBb.push(k);
  });
  if (Ranges.DEF_SPOTS[sbKey] && defCall(sbKey) >= defCall(bbKey)) badSb.push(sbKey);
});
assert(badBb.length === 0, '9-max: BB defends widest at every opener (' +
  (badBb.join(',') || 'ok') + ')');
assert(badSb.length === 0, '9-max: SB cold-calls tighter than BB everywhere (' +
  (badSb.join(',') || 'ok') + ')');

// 被 3-bet：對手 3-bet 越寬，續玩越寬
var v3b9 = Ranges.VS3B_SPOT_KEYS.filter(function (k) { return Ranges.VS3B_SPOTS[k].table === 9; });
assert(v3b9.length === 36, '36 nine-max facing-3-bet spots (8 開牌位置 × 之後每個位置各一格)');
var pairsChecked = 0, badCont = [];
v3b9.forEach(function (a) {
  v3b9.forEach(function (b) {
    var sa = Ranges.VS3B_SPOTS[a], sb = Ranges.VS3B_SPOTS[b];
    if (sa.hero !== sb.hero) return;
    var wa = PushFold.rangeComboTotal(Ranges.vs3bVillainRange(a));
    var wb = PushFold.rangeComboTotal(Ranges.vs3bVillainRange(b));
    // 只比「明顯不同寬」的組合：差 15% 以內時，range 只差一兩個 combo，
    // 誰寬誰窄是取整雜訊決定的，拿來當不變量會抓到假問題
    if (wb < wa * 1.15) return;
    pairsChecked++;
    var ca = PushFold.rangeComboTotal(PushFold.rangeFromNotation(sa.fourBet)) +
      PushFold.rangeComboTotal(PushFold.rangeFromNotation(sa.call));
    var cb = PushFold.rangeComboTotal(PushFold.rangeFromNotation(sb.fourBet)) +
      PushFold.rangeComboTotal(PushFold.rangeFromNotation(sb.call));
    if (ca > cb) badCont.push(a + '>' + b);
  });
});
assert(pairsChecked > 0 && badCont.length === 0,
  'facing a wider 3-bet always continues wider (' + pairsChecked + ' pairs, ' +
  (badCont.join(',') || 'ok') + ')');

// ---------- 5d-2. 被 3-bet 的 4-bet / 跟注 range ----------
console.log('--- Facing a 3-bet (4-bet / call) ---');

// 6-max 15 格（UTG…SB 開牌 × 之後每個位置）+ 9-max 36 格 = 完整矩陣，不能有缺角
assert(Array.isArray(Ranges.VS3B_SPOT_KEYS) && Ranges.VS3B_SPOT_KEYS.length === 51 &&
  Object.keys(Ranges.VS3B_SPOTS).length === 51,
  '51 vs-3bet spots defined, keys and definitions in sync');
assert(Ranges.VS3B_SPOT_KEYS.every(function (k) { return Ranges.VS3B_SPOTS[k]; }),
  'every vs-3bet key resolves to a spot definition');
// CO / BTN 被 SB、BB 3-bet 這 4 個核心情境都要有
assert(['co_vs_sb3b', 'co_vs_bb3b', 'btn_vs_sb3b', 'btn_vs_bb3b']
  .every(function (k) { return Ranges.VS3B_SPOTS[k]; }),
  'CO/BTN vs SB/BB 3-bet all covered');
/* 完整矩陣：每個會開牌的位置 × 它後面每個位置都要有一格。
 * 2026-08-19 Tony 回報「UTG 被 3-bet 沒有」—— 當時 6-max 只做到 CO 起跳、
 * 9-max 只做 BTN/SB/BB 3-bet，缺角在圖上就是點不到的情境。 */
[[['utg', 'hj', 'co', 'btn', 'sb', 'bb'], ''],
 [['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn', 'sb', 'bb'], '9']].forEach(function (tbl) {
  var seats = tbl[0], suffix = tbl[1], missing = [];
  seats.slice(0, seats.length - 1).forEach(function (h, hi) {
    seats.slice(hi + 1).forEach(function (v) {
      var k = h + '_vs_' + v + '3b' + suffix;
      if (!Ranges.VS3B_SPOTS[k]) missing.push(k);
    });
  });
  assert(missing.length === 0, (suffix ? '9' : '6') + '-max vs-3bet 矩陣無缺角 (' +
    (missing.join(',') || 'ok') + ')');
});

var RFI_BY_NAME = { 6: {}, 9: {} };
Ranges.RFI_POS_6.forEach(function (k) {
  RFI_BY_NAME[6][Ranges.RFI_RANGES_6[k].name] = Ranges.RFI_RANGES_6[k].notation;
});
Ranges.RFI_POS_9.forEach(function (k) {
  RFI_BY_NAME[9][Ranges.RFI_RANGES_9[k].name] = Ranges.RFI_RANGES_9[k].notation;
});

Ranges.VS3B_SPOT_KEYS.forEach(function (key) {
  var spot = Ranges.VS3B_SPOTS[key];
  var fb, call, parsed = true;
  try {
    fb = PushFold.rangeFromNotation(spot.fourBet);
    call = PushFold.rangeFromNotation(spot.call);
  } catch (e) { parsed = false; }
  assert(parsed, key + ': notations parse');
  if (!parsed) return;
  var fbC = PushFold.rangeComboTotal(fb), callC = PushFold.rangeComboTotal(call);
  assert(fbC > 0 && callC > 0, key + ': 4bet & call ranges non-empty');
  var fbPct = fbC / 1326 * 100;
  assert(fbPct >= 1.2 && fbPct <= 6,
    key + ': 4bet in 1.2-6% (' + fbPct.toFixed(1) + '%, ' + fbC + ' combos)');
  var fbSet = {};
  fb.forEach(function (i) { fbSet[i] = true; });
  assert(call.every(function (i) { return !fbSet[i]; }), key + ': call/4bet disjoint');
  assert(fbSet[labelIdx('AA')] && fbSet[labelIdx('KK')], key + ': AA & KK 4-bet');
  assert(!fbSet[labelIdx('72o')] && call.indexOf(labelIdx('72o')) < 0, key + ': 72o folded');
  // 被 3-bet 後續玩的量必須明顯小於自己的開牌範圍
  var openC = PushFold.rangeComboTotal(PushFold.rangeFromNotation(
    RFI_BY_NAME[spot.table === 9 ? 9 : 6][spot.hero]));
  var contRatio = (fbC + callC) / openC;
  assert(contRatio > 0.15 && contRatio < 0.55,
    key + ': continues 15-55% of own open range (' + (contRatio * 100).toFixed(0) + '%)');
  // 底池賠率：跟注額 = 3-bet 額 - 開牌額；底池 = 雙方各 3-bet 額 + 死錢
  var p = Ranges.callPrice(key);
  assert(Math.abs(p.toCall - (spot.tbBb - spot.openBb)) < 1e-9 &&
    Math.abs(p.pot - (spot.tbBb * 2 + spot.deadBb)) < 1e-9 &&
    Math.abs(p.needEq - p.toCall / p.pot) < 1e-9,
    key + ': callPrice math (call ' + p.toCall + 'bb into ' + p.pot + 'bb → ' +
    (p.needEq * 100).toFixed(1) + '%)');
  assert(p.needEq > 0.25 && p.needEq < 0.45, key + ': needed equity in 25-45%');
});

// 有位置（BTN vs BB 3-bet）續玩應寬於無位置（SB vs BB 3-bet）
function v3bCont(k) {
  var s = Ranges.VS3B_SPOTS[k];
  return PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.fourBet)) +
    PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.call));
}
assert(v3bCont('btn_vs_bb3b') > v3bCont('sb_vs_bb3b'),
  'IP (BTN) continues wider vs BB 3-bet than OOP (SB)');
assert(Ranges.callPrice('co_vs_btn3b').needEq < Ranges.callPrice('co_vs_bb3b').needEq,
  'smaller IP 3-bet size (BTN 3x) gives a better price than BB 4x');
// vs3b 圖與防守圖共用三態循環
assert(Ranges.cycleState('vs3b', 'out') === 'in' &&
  Ranges.cycleState('vs3b', 'in') === 'tb' &&
  Ranges.cycleState('vs3b', 'tb') === 'out',
  'cycleState vs3b: out -> in (call) -> tb (4-bet) -> out');
assert(Ranges.callPrice('nope') === null, 'callPrice: unknown key -> null');

// ---------- 5d-3. 被 3-bet 的籌碼深度試算（10–300bb） ----------
console.log('--- Facing a 3-bet: stack depth (10-300bb) ---');

function v3bCombos(map, state) {
  var n = 0;
  for (var i = 0; i < 169; i++) {
    if (map[PushFold.classLabel(i)] === state) n += PushFold.comboCount(i);
  }
  return n;
}

// 每個情境都要指到一個真實存在的防守情境，對手 3-bet range 由該處取得（單一資料來源）
Ranges.VS3B_SPOT_KEYS.forEach(function (key) {
  var spot = Ranges.VS3B_SPOTS[key];
  var def = Ranges.DEF_SPOTS[spot.villainSpot];
  assert(!!def && def.hero === spot.villain,
    key + ': villainSpot ' + spot.villainSpot + ' 的 hero 就是 3-bet 方 (' + spot.villain + ')');
  var vr = Ranges.vs3bVillainRange(key);
  assert(Array.isArray(vr) && vr.length > 0, key + ': villain 3-bet range resolves');
});

// 隱含賠率指數：小對子最高、雜色最低、全部落在 0..1
(function () {
  var idx = {};
  for (var i = 0; i < 169; i++) idx[PushFold.classLabel(i)] = Ranges.impliedIndex(i);
  var all = Object.keys(idx).map(function (k) { return idx[k]; });
  assert(all.every(function (v) { return v >= 0 && v <= 1; }), 'impliedIndex within 0..1');
  assert(idx['55'] === 1 && idx['22'] === 1, 'small pairs get max implied index');
  assert(idx['87s'] > idx['87o'] && idx['A5s'] > idx['A5o'],
    'suited hands out-imply their offsuit twins');
  assert(idx.AA < idx['55'], 'AA needs depth less than small pairs (already made hand)');
  assert(idx.KQo <= 0.1, 'offsuit broadways have almost no implied odds');
})();

Ranges.VS3B_SPOT_KEYS.forEach(function (key) {
  var spot = Ranges.VS3B_SPOTS[key];
  var calib = Ranges.vs3bCalibrate(key);
  assert(!!calib && calib.eq.length === 169, key + ': calibration produces 169 equities');

  // 局面數字：3-bet 大小被籌碼蓋住時就是全下，底池/賠率/SPR 一致
  var deep = Ranges.vs3bStackInfo(key, 200);
  assert(deep.tbBb === spot.tbBb && Math.abs(deep.pot - (spot.tbBb * 2 + spot.deadBb)) < 1e-9 &&
    Math.abs(deep.spr - (200 - spot.tbBb) / deep.pot) < 1e-9,
    key + ': 200bb stack info (pot ' + deep.pot + ', SPR ' + deep.spr.toFixed(1) + ')');
  var tiny = Ranges.vs3bStackInfo(key, 10);
  assert(tiny.tbBb === Math.min(spot.tbBb, 10), key + ': 3-bet size capped by the stack');
  // 滑桿範圍外會夾回 10–300
  assert(Ranges.vs3bStackInfo(key, 1).effBb === Ranges.VS3B_MIN_BB &&
    Ranges.vs3bStackInfo(key, 9999).effBb === Ranges.VS3B_MAX_BB,
    key + ': effective stack clamped to ' + Ranges.VS3B_MIN_BB + '-' + Ranges.VS3B_MAX_BB + 'bb');

  // 100bb 應回到建議表（校準往返，容許同分並列造成的誤差）
  var m100 = Ranges.vs3bDefense(key, Ranges.VS3B_BASE_BB, calib);
  var fb100 = v3bCombos(m100, 'tb'), cont100 = fb100 + v3bCombos(m100, 'in');
  var curFb = PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.fourBet));
  var curCont = curFb + PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.call));
  assert(Math.abs(fb100 - curFb) <= 40,
    key + ': 100bb 4-bet combos ' + fb100 + ' ~ curated ' + curFb);
  assert(Math.abs(cont100 - curCont) <= 40,
    key + ': 100bb continue combos ' + cont100 + ' ~ curated ' + curCont);

  // 籌碼越深 → 跟注越寬；籌碼越淺 → 4-bet(全下) 越寬
  var call60 = v3bCombos(Ranges.vs3bDefense(key, 60, calib), 'in');
  var call100 = v3bCombos(m100, 'in');
  var call300 = v3bCombos(Ranges.vs3bDefense(key, 300, calib), 'in');
  assert(call60 < call100 && call100 < call300,
    key + ': call range widens with depth (' + call60 + ' < ' + call100 + ' < ' + call300 + ')');
  var jam25 = v3bCombos(Ranges.vs3bDefense(key, 25, calib), 'tb');
  var fb300 = v3bCombos(Ranges.vs3bDefense(key, 300, calib), 'tb');
  assert(jam25 > fb100 && fb100 >= fb300,
    key + ': 4-bet/jam range tightens with depth (' + jam25 + ' > ' + fb100 + ' >= ' + fb300 + ')');

  // 淺籌碼沒有平跟這個選項；AA 在任何深度都不會蓋牌
  [10, 15, 20, 60, 100, 300].forEach(function (bb) {
    var info = Ranges.vs3bStackInfo(key, bb);
    var m = Ranges.vs3bDefense(key, bb, calib);
    if (info.mode !== 'normal') {
      assert(v3bCombos(m, 'in') === 0,
        key + ' @' + bb + 'bb: mode ' + info.mode + ' has no flat-call cells');
    }
    assert(m.AA === 'tb', key + ' @' + bb + 'bb: AA always continues aggressively');
    assert(!m['72o'], key + ' @' + bb + 'bb: 72o still folds');
  });
});

// 10bb：3-bet 蓋住你 → 只能跟全下或棄，門檻就是底池賠率
(function () {
  var key = 'btn_vs_sb3b';
  var info = Ranges.vs3bStackInfo(key, 10);
  assert(info.mode === 'callAllin' && info.tbBb === 10,
    '10bb vs SB 3-bet: villain is effectively all-in (mode ' + info.mode + ')');
  var calib = Ranges.vs3bCalibrate(key);
  var m = Ranges.vs3bDefense(key, 10, calib);
  var wrong = 0;
  for (var i = 0; i < 169; i++) {
    var want = calib.eq[i] >= info.needEq;
    if (want !== (m[PushFold.classLabel(i)] === 'tb')) wrong++;
  }
  assert(wrong === 0, 'call-all-in range is exactly the hands beating the pot odds (' +
    (info.needEq * 100).toFixed(1) + '%)');
})();

// ---------- 5d-4. 開牌 RFI 與防守的籌碼深度規則 ----------
console.log('--- Stack depth: RFI & defense ---');

// RFI：深度只換組成，寬度必須維持
(function () {
  var target = PushFold.rangeComboTotal(
    PushFold.rangeFromNotation(Ranges.RFI_RANGES_6.co.notation));
  function width(bb) {
    var m = Ranges.rfiAtDepth(target, bb), n = 0;
    for (var i = 0; i < 169; i++) if (m[PushFold.classLabel(i)] === 'in') n += PushFold.comboCount(i);
    return n;
  }
  [10, 25, 60, 100, 200, 300].forEach(function (bb) {
    assert(Math.abs(width(bb) - target) <= 40,
      'RFI @' + bb + 'bb keeps its width (' + width(bb) + ' ~ ' + target + ' combos)');
  });
  assert(Ranges.rfiStackInfo(10).mode === 'jam' &&
    Ranges.rfiStackInfo(Ranges.RFI_JAM_BB).mode === 'jam' &&
    Ranges.rfiStackInfo(Ranges.RFI_JAM_BB + 5).mode === 'raise',
    'RFI mode flips to jam at or below ' + Ranges.RFI_JAM_BB + 'bb');
  assert(Ranges.rfiStackInfo(1).effBb === Ranges.VS3B_MIN_BB &&
    Ranges.rfiStackInfo(9999).effBb === Ranges.VS3B_MAX_BB, 'RFI stack clamped to 10-300bb');

  // 組成輪替：淺 → 雜色高張進來、同花小連張出去；深 → 反過來
  var shallow = Ranges.rfiAtDepth(target, 10), deep = Ranges.rfiAtDepth(target, 300);
  function suitedConnCombos(map) {
    var n = 0;
    for (var i = 0; i < 169; i++) {
      var r = Math.floor(i / 13), c = i % 13;
      var suited = r < c, hi = 14 - (suited ? r : c), lo = 14 - (suited ? c : r);
      if (suited && r !== c && hi - lo <= 2 && hi <= 11 &&
          map[PushFold.classLabel(i)] === 'in') n += PushFold.comboCount(i);
    }
    return n;
  }
  function offsuitCombos(map) {
    var n = 0;
    for (var i = 0; i < 169; i++) {
      var r = Math.floor(i / 13), c = i % 13;
      if (r > c && map[PushFold.classLabel(i)] === 'in') n += PushFold.comboCount(i);
    }
    return n;
  }
  assert(suitedConnCombos(deep) > suitedConnCombos(shallow),
    'deep RFI holds more suited connectors (' + suitedConnCombos(deep) + ' > ' +
    suitedConnCombos(shallow) + ')');
  assert(offsuitCombos(shallow) > offsuitCombos(deep),
    'shallow RFI holds more offsuit hands (' + offsuitCombos(shallow) + ' > ' +
    offsuitCombos(deep) + ')');
  assert(shallow.AA === 'in' && deep.AA === 'in', 'AA opens at every depth');
})();

// 防守：局面數字 + 深度單調性
(function () {
  function contCombos(map, st) {
    var n = 0;
    for (var i = 0; i < 169; i++) {
      if (map[PushFold.classLabel(i)] === st) n += PushFold.comboCount(i);
    }
    return n;
  }
  // 底池賠率：BB 只要補 1.5bb 進 5.5bb → 27%；CO 要補整份 2.5bb 進 6.5bb → 38%
  var bbInfo = Ranges.defStackInfo('bb_vs_btn', 100);
  var coInfo = Ranges.defStackInfo('co_vs_utg', 100);
  assert(Math.abs(bbInfo.toCall - 1.5) < 1e-9 && Math.abs(bbInfo.pot - 5.5) < 1e-9 &&
    Math.abs(bbInfo.needEq - 1.5 / 5.5) < 1e-9,
    'BB defends at ' + (bbInfo.needEq * 100).toFixed(0) + '% pot odds (posts 1bb already)');
  assert(Math.abs(coInfo.toCall - 2.5) < 1e-9 && Math.abs(coInfo.pot - 6.5) < 1e-9,
    'IP cold-caller pays the full open into a ' + coInfo.pot + 'bb pot');
  assert(Math.abs(Ranges.defStackInfo('bb_vs_sb', 100).openBb - 3) < 1e-9,
    'SB opens 3bb in bb_vs_sb (openBb read from the spot)');
  // 3-bet 大小：無位置 4 倍、有位置 3 倍，被籌碼蓋住就是全下
  assert(Math.abs(bbInfo.threeBetBb - 10) < 1e-9 && !bbInfo.threeBetAllIn,
    'OOP 3-bets to 4x (' + bbInfo.threeBetBb + 'bb) at 100bb');
  assert(Math.abs(coInfo.threeBetBb - 7.5) < 1e-9,
    'IP 3-bets to 3x (' + coInfo.threeBetBb + 'bb) at 100bb');
  assert(Ranges.defStackInfo('bb_vs_btn', 10).threeBetAllIn,
    '10bb: the 3-bet is all-in');

  Ranges.DEF_SPOT_KEYS.forEach(function (key) {
    var spot = Ranges.DEF_SPOTS[key];
    var tbC = PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.threeBet));
    var contC = tbC + PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.call));
    var villain = PushFold.topPercentRange(Ranges.openerOpenPct(key));
    var thr = Ranges.defenseCalibrate(key, villain, tbC, contC);

    var m100 = Ranges.defenseAtDepth(key, villain, thr, 100);
    assert(Math.abs(contCombos(m100, 'tb') - tbC) <= 40 &&
      Math.abs(contCombos(m100, 'tb') + contCombos(m100, 'in') - contC) <= 40,
      key + ' @100bb: calibration round-trips (3bet ' + contCombos(m100, 'tb') + '/' + tbC +
      ', cont ' + (contCombos(m100, 'tb') + contCombos(m100, 'in')) + '/' + contC + ')');

    var call40 = contCombos(Ranges.defenseAtDepth(key, villain, thr, 40), 'in');
    var call100 = contCombos(m100, 'in');
    var call300 = contCombos(Ranges.defenseAtDepth(key, villain, thr, 300), 'in');
    assert(call40 <= call100 && call100 <= call300,
      key + ': flat-call range widens with depth (' + call40 + ' <= ' + call100 +
      ' <= ' + call300 + ')');
    var tb15 = contCombos(Ranges.defenseAtDepth(key, villain, thr, 15), 'tb');
    var tb300 = contCombos(Ranges.defenseAtDepth(key, villain, thr, 300), 'tb');
    assert(tb15 > contCombos(m100, 'tb') && contCombos(m100, 'tb') >= tb300,
      key + ': 3-bet range tightens with depth (' + tb15 + ' > ' +
      contCombos(m100, 'tb') + ' >= ' + tb300 + ')');

    [10, 15, 40, 100, 300].forEach(function (bb) {
      var m = Ranges.defenseAtDepth(key, villain, thr, bb);
      var info = Ranges.defStackInfo(key, bb);
      assert(m.AA === 'tb', key + ' @' + bb + 'bb: AA always 3-bets');
      assert(!m['72o'], key + ' @' + bb + 'bb: 72o folds');
      if (info.mode !== 'normal') {
        assert(contCombos(m, 'in') === 0, key + ' @' + bb + 'bb: no flat calls below SPR 0.5');
      }
    });
  });
})();

// ---------- 5e. RFI range 資料（6-max / 9-max） ----------
console.log('--- RFI ranges (6-max / 9-max) ---');

function rfiCombos(tbl, pos) {
  return PushFold.rangeComboTotal(PushFold.rangeFromNotation(tbl[pos].notation));
}

assert(Ranges.RFI_POS_6.length === 5 &&
  Ranges.RFI_POS_6.every(function (k) { return Ranges.RFI_RANGES_6[k]; }),
  '6-max RFI: 5 positions all defined');
assert(Ranges.RFI_POS_9.length === 8 &&
  Ranges.RFI_POS_9.every(function (k) { return Ranges.RFI_RANGES_9[k]; }),
  '9-max RFI: 8 positions all defined');

var rfi9Parsed = true;
try {
  Ranges.RFI_POS_9.forEach(function (k) {
    PushFold.rangeFromNotation(Ranges.RFI_RANGES_9[k].notation);
  });
} catch (e) { rfi9Parsed = false; }
assert(rfi9Parsed, '9-max RFI: all notations parse');

// 6-max 資料驅動的單調性（UTG < HJ < CO < BTN）
var w6 = ['utg', 'hj', 'co', 'btn'].map(function (k) { return rfiCombos(Ranges.RFI_RANGES_6, k); });
assert(w6[0] < w6[1] && w6[1] < w6[2] && w6[2] < w6[3],
  '6-max RFI data widens by position: ' + w6.join(' < '));

// 9-max 單調性（UTG < UTG+1 < MP < LJ < HJ < CO < BTN）
var order9 = ['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn'];
var w9 = order9.map(function (k) { return rfiCombos(Ranges.RFI_RANGES_9, k); });
var mono9 = w9.every(function (w, i) { return i === 0 || w9[i - 1] < w; });
assert(mono9, '9-max RFI widens monotonically UTG->BTN: ' + w9.join(' < '));

// 寬度合理：UTG 約 10%、BTN 40% 以上，且 9-max UTG 緊於 6-max UTG
var utg9Pct = rfiCombos(Ranges.RFI_RANGES_9, 'utg') / 1326 * 100;
var btn9Pct = rfiCombos(Ranges.RFI_RANGES_9, 'btn') / 1326 * 100;
assert(utg9Pct >= 8 && utg9Pct <= 13, '9-max UTG in 8-13% (' + utg9Pct.toFixed(1) + '%)');
assert(btn9Pct >= 40 && btn9Pct <= 55, '9-max BTN in 40-55% (' + btn9Pct.toFixed(1) + '%)');
assert(rfiCombos(Ranges.RFI_RANGES_9, 'utg') < rfiCombos(Ranges.RFI_RANGES_6, 'utg'),
  '9-max UTG tighter than 6-max UTG');
// SB 介於 CO 與 BTN 之間
var sb9 = rfiCombos(Ranges.RFI_RANGES_9, 'sb');
assert(sb9 > rfiCombos(Ranges.RFI_RANGES_9, 'co') && sb9 < rfiCombos(Ranges.RFI_RANGES_9, 'btn'),
  '9-max SB width between CO and BTN');

// ---------- 5f. 自訂 range 覆寫（純函式） ----------
console.log('--- Custom range overrides ---');

// cycleState：RFI 兩態循環；def 三態循環
assert(Ranges.cycleState('rfi', 'out') === 'in' && Ranges.cycleState('rfi', 'in') === 'out',
  'cycleState rfi: out <-> in');
assert(Ranges.cycleState('def', 'out') === 'in' &&
  Ranges.cycleState('def', 'in') === 'tb' &&
  Ranges.cycleState('def', 'tb') === 'out',
  'cycleState def: out -> in (call) -> tb -> out');

// mergeOverride：空覆寫 = 原樣，且不改動輸入
var baseMap = { AA: 'tb', KQs: 'in', T9s: 'in' };
var merged0 = Ranges.mergeOverride(baseMap, null);
assert(JSON.stringify(merged0) === JSON.stringify(baseMap) && merged0 !== baseMap,
  'mergeOverride: empty override returns equal copy');
var merged1 = Ranges.mergeOverride(baseMap, { T9s: 'out', '72o': 'in', KQs: 'tb' });
assert(!merged1.T9s && merged1['72o'] === 'in' && merged1.KQs === 'tb' && merged1.AA === 'tb',
  'mergeOverride: applies out/add/change');
assert(baseMap.T9s === 'in' && !baseMap['72o'], 'mergeOverride: does not mutate default map');

// diffOverride：merge 後再 diff 回到相同覆寫；無差異 -> 空物件
var diff1 = Ranges.diffOverride(baseMap, merged1);
assert(diff1.T9s === 'out' && diff1['72o'] === 'in' && diff1.KQs === 'tb' && !('AA' in diff1),
  'diffOverride: sparse diff round-trips');
assert(Object.keys(Ranges.diffOverride(baseMap, merged0)).length === 0,
  'diffOverride: identical maps -> empty diff');
// 再套 diff 應還原完整自訂 map
assert(JSON.stringify(Ranges.mergeOverride(baseMap, diff1)) === JSON.stringify(merged1),
  'mergeOverride(default, diff) reconstructs custom map');

// ---------- 5f. 動態防守試算（opener 開牌 % 滑桿） ----------
console.log('--- Dynamic defense (opener % slider) ---');

// 預設開牌 % 直接由 RFI notation 算出，非硬編碼
var openPct = {};
Ranges.DEF_SPOT_KEYS.forEach(function (k) { openPct[k] = Ranges.openerOpenPct(k); });
assert(Math.abs(openPct.co_vs_utg - 12.2) < 0.6,
  'default opener % CO_vs_UTG (6-max UTG) ~12.2: ' + openPct.co_vs_utg.toFixed(1));
assert(Math.abs(openPct.btn_vs_co - 25.2) < 0.8,
  'default opener % BTN_vs_CO ~25.2: ' + openPct.btn_vs_co.toFixed(1));
assert(Math.abs(openPct.sb_vs_btn - 42.1) < 1.2,
  'default opener % SB_vs_BTN ~42.1: ' + openPct.sb_vs_btn.toFixed(1));
assert(Math.abs(openPct.hj_vs_utg9 - 10.4) < 0.6,
  'default opener % HJ_vs_UTG9 (9-max UTG) ~10.4: ' + openPct.hj_vs_utg9.toFixed(1));
assert(Math.abs(openPct.bb_vs_utg9 - openPct.hj_vs_utg9) < 0.01,
  'both 9-max UTG spots share the same opener %');

function dynCombos(map, state) {
  var n = 0;
  for (var i = 0; i < 169; i++) {
    if (map[PushFold.classLabel(i)] === state) n += PushFold.comboCount(i);
  }
  return n;
}

Ranges.DEF_SPOT_KEYS.forEach(function (key) {
  var spot = Ranges.DEF_SPOTS[key];
  var tbCombos = PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.threeBet));
  var contCombos = tbCombos +
    PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.call));
  var villain0 = PushFold.topPercentRange(openPct[key]);
  var thr = Ranges.defenseCalibrate(key, villain0, tbCombos, contCombos);

  // 兩個門檻各自有效：3-bet 門檻量的是 raw equity，續玩門檻量的是「equity + 隱含加成」，
  // 兩者尺度不同（小對子/同花連張帶加成），所以不能互比大小，只檢查落在合理區間。
  assert(thr.tb > 0 && thr.tb < 1 && thr.cont > 0 && thr.cont < 1.2 && thr.sprBase > 0,
    key + ': thresholds in range — tb ' + thr.tb.toFixed(3) + ', cont ' +
    thr.cont.toFixed(3) + ', 100bb SPR ' + thr.sprBase.toFixed(1));

  // 校準：在預設 villain 上重建 → combo 數應貼近建議表（±40 combo，容許同分並列）
  var map0 = Ranges.defenseAtDepth(key, villain0, thr, Ranges.VS3B_BASE_BB);
  var tb0 = dynCombos(map0, 'tb'), cont0 = tb0 + dynCombos(map0, 'in');
  assert(Math.abs(tb0 - tbCombos) <= 40,
    key + ': calibrated 3-bet combos ' + tb0 + ' ~ curated ' + tbCombos);
  assert(Math.abs(cont0 - contCombos) <= 40,
    key + ': calibrated continue combos ' + cont0 + ' ~ curated ' + contCombos);
});

// 單調性：對手開 5%（緊）→ 續玩必須嚴格少於對手開 20%（鬆）
(function () {
  var spot = Ranges.DEF_SPOTS.co_vs_utg;
  var tbC = PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.threeBet));
  var contC = tbC + PushFold.rangeComboTotal(PushFold.rangeFromNotation(spot.call));
  var thr = Ranges.defenseCalibrate('co_vs_utg',
    PushFold.topPercentRange(Ranges.openerOpenPct('co_vs_utg')), tbC, contC);
  var tight = Ranges.defenseAtDepth('co_vs_utg', PushFold.topPercentRange(5), thr, 100);
  var loose = Ranges.defenseAtDepth('co_vs_utg', PushFold.topPercentRange(20), thr, 100);
  var contTight = dynCombos(tight, 'tb') + dynCombos(tight, 'in');
  var contLoose = dynCombos(loose, 'tb') + dynCombos(loose, 'in');
  assert(contTight < contLoose,
    'monotonic: continue vs 5% opener (' + contTight + ') < vs 20% opener (' +
    contLoose + ')');
  assert(dynCombos(tight, 'tb') <= dynCombos(loose, 'tb'),
    'monotonic: 3-bet combos vs 5% <= vs 20%');
  // AA 任何情況都在 3-bet 內
  assert(tight.AA === 'tb' && loose.AA === 'tb', 'AA always 3-bet in dynamic map');
})();

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

// prettyCards（花色符號＋容錯）
assert(HANDS.prettyCards('As Kd') === 'A♠ K♦', 'prettyCards "As Kd"');
assert(HANDS.prettyCards('AsKd') === 'A♠ K♦', 'prettyCards concatenated');
assert(HANDS.prettyCards('th 7c') === 'T♥ 7♣', 'prettyCards lowercase + T');
assert(HANDS.prettyCards('xyz') === 'xyz', 'prettyCards keeps unparsable token');
assert(HANDS.prettyCards('') === '', 'prettyCards empty');

// handToText（匯出文字：關鍵行都在）
var exRec = {
  date: '2026-08-15', name: 'Daily Game', gtype: 'mtt', players: 8,
  blinds: '2500/5000', ante: 5000, stack: 16, pos: 'LJ', hero: 'Kc Jc',
  opps: [{ pos: 'BTN', stack: 18 }],
  showdown: [{ pos: 'BB', cards: '9s 8d' }],
  result: -14, note: 'test note',
  streets: [{ street: 'preflop', boardTxt: '', pot: 2.5, toCall: 0, action: 'raise',
              range: '77+ A9s+',
              analysis: { needed: 0, equity: 0.62, verdict: 'raise_ahead' } }]
};
var exTxt = HANDS.handToText(exRec);
assert(exTxt.indexOf('2026-08-15') === 0, 'handToText starts with date');
assert(exTxt.indexOf('K♣ J♣') !== -1, 'handToText pretty hero cards');
assert(exTxt.indexOf('BTN') !== -1 && exTxt.indexOf('18 bb') !== -1, 'handToText opps line');
assert(exTxt.indexOf('9♠ 8♦') !== -1, 'handToText showdown line');
assert(exTxt.indexOf('-14 bb') !== -1, 'handToText result line');
assert(exTxt.indexOf('62.0%') !== -1, 'handToText analysis line');
var exMin = HANDS.handToText({ date: '2026-08-15', pos: 'BTN', hero: 'As Kd', streets: [] });
assert(exMin.indexOf('A♠ K♦') !== -1, 'handToText minimal rec ok');

// dateBucket（列表時間分組；today=2026-08-15 是週六）
assert(HANDS.dateBucket('2026-08-15', '2026-08-15') === 'today', 'dateBucket today');
assert(HANDS.dateBucket('2026-08-14', '2026-08-15') === 'yesterday', 'dateBucket yesterday');
assert(HANDS.dateBucket('2026-08-10', '2026-08-15') === 'thisweek', 'dateBucket monday -> thisweek');
assert(HANDS.dateBucket('2026-08-09', '2026-08-15') === 'lastweek', 'dateBucket sunday -> lastweek');
assert(HANDS.dateBucket('2026-08-01', '2026-08-15') === 'thismonth', 'dateBucket same month');
assert(HANDS.dateBucket('2026-07-20', '2026-08-15') === '2026-07', 'dateBucket previous month');
assert(HANDS.dateBucket('bogus', '2026-08-15') === 'unknown', 'dateBucket bad date');

// ---------- 6b. 訓練系統（純函式） ----------
console.log('--- Training ---');
var TRAINING = require('../js/training.js');

// rollPush：推入 + 截尾
var roll = [];
roll = TRAINING.rollPush(roll, 1);
roll = TRAINING.rollPush(roll, 0);
assert(roll.length === 2 && roll[0] === 1 && roll[1] === 0, 'rollPush appends 0/1');
var full = [];
for (var ri = 0; ri < 35; ri++) full = TRAINING.rollPush(full, 1, 30);
assert(full.length === 30, 'rollPush trims to window size (30)');
assert(TRAINING.rollPush([1, 1, 0], 1, 3).join(',') === '1,0,1',
  'rollPush drops oldest when full');
var orig = [1, 0];
TRAINING.rollPush(orig, 1);
assert(orig.length === 2, 'rollPush does not mutate input array');

// accuracy
assert(TRAINING.accuracy([]) === 0, 'accuracy of empty = 0');
assert(Math.abs(TRAINING.accuracy([1, 1, 0, 0]) - 0.5) < 1e-9, 'accuracy 2/4 = 50%');

// isMastered 邊界：需滿 30 題且 >= 90%
function mkRoll(correct, total) {
  var a = [];
  for (var i = 0; i < total; i++) a.push(i < correct ? 1 : 0);
  return a;
}
assert(TRAINING.isMastered(mkRoll(27, 30)) === true, 'mastered at exactly 27/30 (90%)');
assert(TRAINING.isMastered(mkRoll(26, 30)) === false, 'not mastered at 26/30 (86.7%)');
assert(TRAINING.isMastered(mkRoll(29, 29)) === false, 'not mastered with only 29 answers (100%)');
assert(TRAINING.isMastered(mkRoll(30, 30)) === true, 'mastered at 30/30');
assert(TRAINING.isMastered([]) === false, 'empty roll not mastered');

// dateAdd
assert(TRAINING.dateAdd('2026-07-16', -1) === '2026-07-15', 'dateAdd -1 day');
assert(TRAINING.dateAdd('2026-03-01', -1) === '2026-02-28', 'dateAdd across month');
assert(TRAINING.dateAdd('2026-12-31', 1) === '2027-01-01', 'dateAdd across year');

// lastNDays
var week = TRAINING.lastNDays('2026-07-16', 7);
assert(week.length === 7 && week[0] === '2026-07-10' && week[6] === '2026-07-16',
  'lastNDays 7-day window oldest->newest');

// updateStreak
var st0 = { current: 0, best: 0, lastDone: '' };
var st1 = TRAINING.updateStreak(st0, '2026-07-15');
assert(st1.current === 1 && st1.best === 1 && st1.lastDone === '2026-07-15',
  'streak starts at 1');
var st2 = TRAINING.updateStreak(st1, '2026-07-16');
assert(st2.current === 2 && st2.best === 2, 'streak increments when lastDone = yesterday');
var st3 = TRAINING.updateStreak(st2, '2026-07-16');
assert(st3.current === 2 && st3.lastDone === '2026-07-16', 'same-day repeat is a no-op');
var st4 = TRAINING.updateStreak(st2, '2026-07-20');
assert(st4.current === 1 && st4.best === 2, 'streak resets to 1 after a gap, best kept');

// pruneActivity：保留 60 天內
var act = {};
act['2026-07-16'] = { pf: 1 };
act['2026-05-18'] = { pf: 2 }; // 60 天窗口內最舊一天
act['2026-05-17'] = { pf: 3 }; // 第 61 天，應剔除
var pruned = TRAINING.pruneActivity(act, '2026-07-16', 60);
assert(!!pruned['2026-07-16'] && !!pruned['2026-05-18'] && !pruned['2026-05-17'],
  'pruneActivity keeps 60-day window, drops day 61');

// addMistake：去重 + 上限
var ms = [];
ms = TRAINING.addMistake(ms, { kind: 'pf', key: 'pf:10:5', ts: 1 });
ms = TRAINING.addMistake(ms, { kind: 'rfi', key: 'rfi:utg:5', ts: 2 });
ms = TRAINING.addMistake(ms, { kind: 'pf', key: 'pf:10:5', ts: 3 });
assert(ms.length === 2, 'addMistake dedups by kind+key');
assert(ms[1].kind === 'pf' && ms[1].ts === 3, 'dedup keeps latest entry (moved to end)');
var big = [];
for (var mi = 0; mi < 105; mi++) {
  big = TRAINING.addMistake(big, { kind: 'pf', key: 'pf:2:' + mi, ts: mi }, 100);
}
assert(big.length === 100 && big[0].key === 'pf:2:5' && big[99].key === 'pf:2:104',
  'addMistake caps at 100, drops oldest');

// SRS（Leitner 間隔重複）
var srsBase = { kind: 'pf', key: 'pf:10:5', ts: 1 };
var srsNew = TRAINING.normalizeMistake(srsBase, '2026-07-16');
assert(srsNew.box === 1 && srsNew.due === '2026-07-16',
  'normalizeMistake defaults to box 1 due today');
var b2 = TRAINING.srsNext(srsNew, true, '2026-07-16');
assert(b2.box === 2 && b2.due === '2026-07-17', 'correct: box 1 -> 2, due +1 day');
var b3 = TRAINING.srsNext(b2, true, '2026-07-17');
assert(b3.box === 3 && b3.due === '2026-07-20', 'correct: box 2 -> 3, due +3 days');
var b4 = TRAINING.srsNext(b3, true, '2026-07-20');
assert(b4.box === 4 && b4.due === '2026-07-27', 'correct: box 3 -> 4, due +7 days');
var b5 = TRAINING.srsNext(b4, true, '2026-07-27');
assert(b5.box === 5 && b5.due === '2026-08-10', 'correct: box 4 -> 5, due +14 days');
assert(TRAINING.srsNext(b5, true, '2026-08-10') === null,
  'correct at box 5 graduates out of the book');
var demoted = TRAINING.srsNext(b4, false, '2026-07-27');
assert(demoted.box === 1 && demoted.due === '2026-07-27',
  'wrong answer resets to box 1, due today');
assert(TRAINING.srsNext(b4, false, '2026-07-27').kind === 'pf',
  'srsNext keeps the payload fields');

// srsDue：只拿今天（含）之前到期的，盒號小的先考
var dueList = [
  { kind: 'pf', key: 'a', box: 3, due: '2026-07-20' },
  { kind: 'pf', key: 'b', box: 1, due: '2026-07-16' },
  { kind: 'pf', key: 'c', box: 2, due: '2026-07-16' },
  { kind: 'pf', key: 'd' }                                   // 舊資料，無 box/due
];
var due = TRAINING.srsDue(dueList, '2026-07-16');
assert(due.length === 3, 'srsDue drops entries not due yet');
assert(due[0].key === 'b' && due[1].key === 'd' && due[2].key === 'c',
  'srsDue sorts by box then due date');
assert(TRAINING.srsDue(dueList, '2026-07-20').length === 4, 'srsDue includes items due today');
// 再答錯一次 → 不管升到第幾盒都打回第 1 盒
var relapse = TRAINING.addMistake([b5], { kind: 'pf', key: 'pf:10:5', ts: 9 }, 100, '2026-08-01');
assert(relapse.length === 1 && relapse[0].box === 1 && relapse[0].due === '2026-08-01',
  'addMistake on an existing entry resets it to box 1');

// ---------- 5d-3. 冷 4-bet / 冷跟（前面開牌 + 有人 3-bet） ----------
console.log('--- Cold 4-bet / cold call ---');

assert(Ranges.COLD_SPOT_KEYS.length === 94 &&
  Object.keys(Ranges.COLD_SPOTS).length === 94,
  '94 cold-4bet spots (6-max 20 + 9-max 74), keys in sync');
assert(Ranges.COLD_SPOT_KEYS.every(function (k) {
  var s = Ranges.COLD_SPOTS[k];
  return s && Ranges.DEF_SPOTS[s.villainSpot];
}), 'every cold spot points at a real 3-bettor defence spot');
/* 完整矩陣：你在 CO 之後的每個位置 × 你前面每一組（開牌者, 3-bet 者）都要有一格。
 * 2026-08-20 Tony 定的範圍是「冷 4b 做到 CO 就可以了」，所以 CO 之前的位置不做。 */
[[['utg', 'hj', 'co', 'btn', 'sb', 'bb'], ''],
 [['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn', 'sb', 'bb'], '9']].forEach(function (tbl) {
  var seats = tbl[0], suffix = tbl[1], missing = [], extra = [];
  var first = seats.indexOf('co');
  seats.forEach(function (hero, h) {
    seats.forEach(function (opener, o) {
      seats.forEach(function (tb, v) {
        var k = hero + '_' + opener + '_' + tb + suffix;
        var want = h >= first && o < v && v < h;
        if (want && !Ranges.COLD_SPOTS[k]) missing.push(k);
        if (!want && Ranges.COLD_SPOTS[k]) extra.push(k);
      });
    });
  });
  assert(missing.length === 0 && extra.length === 0,
    (suffix ? '9' : '6') + '-max cold-4bet 矩陣無缺角、無多餘格 (' +
    (missing.concat(extra).join(',') || 'ok') + ')');
});
// 位置規則：3-bet 者是 SB → 尺度較大且小盲不算死錢；你是盲注 → 已投的錢算進底池
Ranges.COLD_SPOT_KEYS.forEach(function (k) {
  var s = Ranges.COLD_SPOTS[k];
  var post = s.hero === 'SB' ? 0.5 : s.hero === 'BB' ? 1 : 0;
  assert(s.tbBb === (s.tbettor === 'SB' ? 11 : 8) && s.heroPost === post &&
    Math.abs(s.deadBb - (1.5 - post - (s.tbettor === 'SB' ? 0.5 : 0))) < 1e-9,
    k + ': sizes and blinds follow from the seats');
});
// 位置懲罰的排序：BTN（有位置、只剩兩盲）< CO（有位置但後面三家）< BB < SB
assert(Ranges.COLD_SPOTS.btn_mp_co9.oopPenalty < Ranges.COLD_SPOTS.co_mp_hj9.oopPenalty &&
  Ranges.COLD_SPOTS.co_mp_hj9.oopPenalty < Ranges.COLD_SPOTS.bb_mp_co9.oopPenalty &&
  Ranges.COLD_SPOTS.bb_mp_co9.oopPenalty < Ranges.COLD_SPOTS.sb_mp_co9.oopPenalty,
  'cold-4bet position penalty ordering BTN < CO < BB < SB');

// 底池賠率算式：補的錢 = 3-bet 額 − 自己已投的盲注；底池含自己的盲注
Ranges.COLD_SPOT_KEYS.forEach(function (key) {
  var s = Ranges.COLD_SPOTS[key];
  var info = Ranges.coldStackInfo(key, 100);
  assert(Math.abs(info.toCall - (s.tbBb - s.heroPost)) < 1e-9 &&
    Math.abs(info.pot - (s.openBb + s.tbBb + s.deadBb + s.heroPost)) < 1e-9 &&
    Math.abs(info.needEq - info.toCall / (info.pot + info.toCall)) < 1e-9,
    key + ': pot odds arithmetic');
});

function coldSets(key, villain, bb) {
  var map = Ranges.coldDefense(key, villain, bb);
  var tb = [], call = [];
  for (var i = 0; i < 169; i++) {
    var st = map[PushFold.classLabel(i)];
    if (st === 'tb') tb.push(i);
    else if (st === 'in') call.push(i);
  }
  return { tb: tb, call: call,
           total: PushFold.rangeComboTotal(tb) + PushFold.rangeComboTotal(call) };
}

// Tony 問的那一手：BTN 拿 AQo，MP 開牌、CO 3-bet
var AQO = labelIdx('AQo');
var btnDefault = coldSets('btn_mp_co9', Ranges.coldVillainRange('btn_mp_co9'), 100);
assert(btnDefault.tb.indexOf(AQO) < 0 && btnDefault.call.indexOf(AQO) < 0,
  'AQo folds to a 3.6% cold 3-bet on the BTN');
assert(btnDefault.tb.indexOf(labelIdx('AA')) >= 0 && btnDefault.tb.indexOf(labelIdx('QQ')) >= 0,
  'AA/QQ cold 4-bet at the default width');
assert(btnDefault.call.indexOf(labelIdx('22')) >= 0,
  'small pairs cold-call at 100bb (set mining)');
// 對手寬到一定程度 AQo 才續玩 —— 這就是滑桿存在的理由
var aqoWide = coldSets('btn_mp_co9', PushFold.topPercentRange(12), 100);
assert(aqoWide.tb.indexOf(AQO) >= 0 || aqoWide.call.indexOf(AQO) >= 0,
  'AQo continues once the 3-bettor is wide (12%)');

// 對手越寬 → 續玩越寬（單調）
var lastTot = -1, monoOk = true;
[3, 5, 7, 9, 12, 15, 20].forEach(function (w) {
  var t = coldSets('btn_mp_co9', PushFold.topPercentRange(w), 100).total;
  if (t < lastTot) monoOk = false;
  lastTot = t;
});
assert(monoOk, 'a wider 3-bettor is always continued against wider');

// 籌碼越淺 → 冷跟越窄（小對子的 set mining 價值消失）
var deep = coldSets('btn_mp_co9', Ranges.coldVillainRange('btn_mp_co9'), 100);
var mid = coldSets('btn_mp_co9', Ranges.coldVillainRange('btn_mp_co9'), 40);
assert(PushFold.rangeComboTotal(mid.call) < PushFold.rangeComboTotal(deep.call),
  'shallower stacks cold-call tighter');
assert(Ranges.coldStackInfo('btn_mp_co9', 15).mode !== 'normal' &&
  coldSets('btn_mp_co9', Ranges.coldVillainRange('btn_mp_co9'), 15).call.length === 0,
  'at 15bb there is no cold-call option, only jam or fold');

// 位置：BTN 續玩最寬、SB 最窄（純看底池賠率會得出相反結論，所以 oopPenalty 是必要的）
var vil9 = Ranges.coldVillainRange('btn_mp_co9');
var btnTot = coldSets('btn_mp_co9', vil9, 100).total;
var bbTot = coldSets('bb_mp_co9', vil9, 100).total;
var sbTot = coldSets('sb_mp_co9', vil9, 100).total;
assert(btnTot > bbTot && bbTot >= sbTot,
  'in position continues widest, SB tightest (BTN ' + btnTot + ' > BB ' + bbTot +
  ' >= SB ' + sbTot + ')');
assert(Ranges.coldStackInfo('sb_mp_co9', 100).needEq <
  Ranges.coldStackInfo('btn_mp_co9', 100).needEq,
  'SB gets a better raw price than BTN — so position cannot come from pot odds alone');

// 對子不可有破洞（家族單調化）
Ranges.COLD_SPOT_KEYS.forEach(function (key) {
  [100, 60, 40].forEach(function (bb) {
    var r = coldSets(key, Ranges.coldVillainRange(key), bb);
    var inSet = {};
    r.tb.concat(r.call).forEach(function (i) { inSet[i] = true; });
    var pairs = [];
    for (var p = 0; p < 13; p++) if (inSet[p * 13 + p]) pairs.push(p);
    var ok2 = pairs.length === 0 ||
      (pairs[0] === 0 && pairs[pairs.length - 1] - pairs[0] === pairs.length - 1);
    assert(ok2, key + '@' + bb + 'bb: defended pairs are a gapless top run');
  });
});

// 頻率表
var coldFreq = Ranges.coldFreqMap('btn_mp_co9', Ranges.coldVillainRange('btn_mp_co9'), 100);
assert(Object.keys(coldFreq).length === 169, 'coldFreqMap covers all 169 hands');
assert(coldFreq.AA.aggro === 1 && coldFreq['72o'].fold === 1, 'AA cold 4-bets, 72o folds');
assert(Math.abs(coldFreq.AQo.aggro + coldFreq.AQo.call + coldFreq.AQo.fold - 1) < 1e-9,
  'cold frequencies sum to 1');

console.log('--- Facing a 4-bet (vs4b) ---');

// 與被 3-bet 圖同一份 key 鏡射：每個 vs3b 情境都有對應的面對 4-bet 情境
assert(Ranges.VS4B_SPOT_KEYS.length === Ranges.VS3B_SPOT_KEYS.length &&
  Ranges.VS4B_SPOT_KEYS.every(function (k) { return !!Ranges.VS3B_SPOTS[k]; }),
  'vs4b spots mirror vs3b spots 1:1 (' + Ranges.VS4B_SPOT_KEYS.length + ')');
Ranges.VS4B_SPOT_KEYS.forEach(function (k) {
  var s = Ranges.VS4B_SPOTS[k], v = Ranges.VS3B_SPOTS[k];
  assert(s.hero === v.villain && s.opener === v.hero &&
    s.fourBet === v.fourBet && s.tbBb === v.tbBb && s.deadBb === v.deadBb,
    k + ': vs4b spot derives hero/opener/ranges from the vs3b spot');
});
// 位置判斷：非盲注 3-bet 都有位置；SB 3-bet 無位置；BB 3-bet 只對 SB 開牌有位置
assert(Ranges.VS4B_SPOTS.co_vs_btn3b.heroIp === true &&
  Ranges.VS4B_SPOTS.btn_vs_sb3b.heroIp === false &&
  Ranges.VS4B_SPOTS.sb_vs_bb3b.heroIp === true &&
  Ranges.VS4B_SPOTS.utg_vs_bb3b.heroIp === false,
  'vs4b hero position flags (BB is IP only vs a SB open)');

function vs4bSets(key, villain, bb) {
  var map = Ranges.vs4bDefense(key, villain, bb);
  var tb = [], call = [];
  for (var i = 0; i < 169; i++) {
    var st = map[PushFold.classLabel(i)];
    if (st === 'tb') tb.push(i);
    else if (st === 'in') call.push(i);
  }
  return { tb: tb, call: call,
           total: PushFold.rangeComboTotal(tb) + PushFold.rangeComboTotal(call) };
}

// 100bb、預設（緊）4-bet range：5-bet 只有 AA/KK，QQ/JJ/TT/AKs 是跟注，AQo 蓋牌
var f0 = vs4bSets('co_vs_btn3b', Ranges.vs4bVillainRange('co_vs_btn3b'), 100);
assert(f0.tb.indexOf(labelIdx('AA')) >= 0 && f0.tb.indexOf(labelIdx('KK')) >= 0,
  'AA/KK five-bet vs the default 4-bet range');
assert(f0.call.indexOf(labelIdx('QQ')) >= 0 && f0.call.indexOf(labelIdx('AKs')) >= 0,
  'QQ/AKs call vs the default 4-bet range');
assert(f0.tb.indexOf(labelIdx('AQo')) < 0 && f0.call.indexOf(labelIdx('AQo')) < 0,
  'AQo folds to a tight 4-bet');
assert(f0.call.indexOf(labelIdx('32s')) < 0 && f0.call.indexOf(labelIdx('22')) < 0,
  'junk/tiny pairs never call a 4-bet at 100bb (MDF cap works)');
// 對超緊（KK+ AKs）的 4-bet：連 QQ 都不 5-bet
var fNit = vs4bSets('utg_vs_bb3b', Ranges.vs4bVillainRange('utg_vs_bb3b'), 100);
assert(fNit.tb.indexOf(labelIdx('QQ')) < 0,
  'QQ does not five-bet into a KK+/AKs-only 4-bettor');
// 對手變寬 → 續玩變寬。門檻以整個 class 為粒度切，容許 ≤1 個 offsuit class（12 combo）的量化抖動
var fLast = -1, fMono = true;
[2, 3, 4, 6, 8, 10, 12].forEach(function (w) {
  var tot = vs4bSets('co_vs_btn3b', PushFold.topPercentRange(w), 100).total;
  if (tot < fLast - 12) fMono = false;
  fLast = Math.max(fLast, tot);
});
assert(fMono, 'a wider 4-bettor is continued against wider (within class-granularity jitter)');
var fWide = vs4bSets('co_vs_btn3b', PushFold.topPercentRange(8), 100);
assert(fWide.tb.indexOf(labelIdx('QQ')) >= 0 &&
  (fWide.tb.indexOf(labelIdx('AKo')) >= 0 || fWide.call.indexOf(labelIdx('AKo')) >= 0),
  'vs an 8% 4-bettor QQ five-bets and AKo continues');
// 淺籌碼：沒有平跟，只剩全下 / 棄，range 收斂到 QQ+/AK 附近
var fShallow = vs4bSets('co_vs_btn3b', Ranges.vs4bVillainRange('co_vs_btn3b'), 25);
assert(Ranges.vs4bStackInfo('co_vs_btn3b', 25).mode !== 'normal' &&
  fShallow.call.length === 0 && fShallow.tb.length > 0 && fShallow.tb.length <= 12,
  'at 25bb facing a 4-bet: jam-or-fold with a tight jam range (' + fShallow.tb.length + ' classes)');
// 賠率算式
Ranges.VS4B_SPOT_KEYS.forEach(function (key) {
  var info = Ranges.vs4bStackInfo(key, 100);
  assert(Math.abs(info.toCall - (info.fbBb - info.tbBb)) < 1e-9 &&
    Math.abs(info.needEq - info.toCall / (info.pot + info.toCall)) < 1e-9,
    key + ': vs4b pot odds arithmetic');
});
// 頻率表
var f4Freq = Ranges.vs4bFreqMap('co_vs_btn3b', Ranges.vs4bVillainRange('co_vs_btn3b'), 100);
assert(Object.keys(f4Freq).length === 169, 'vs4bFreqMap covers all 169 hands');
assert(f4Freq.AA.aggro === 1 && f4Freq['72o'].fold === 1, 'AA five-bets, 72o folds');
assert(Math.abs(f4Freq.QQ.aggro + f4Freq.QQ.call + f4Freq.QQ.fold - 1) < 1e-9,
  'vs4b frequencies sum to 1');
// 對子不可有破洞（家族單調化）
[100, 60, 40].forEach(function (bb) {
  var r = vs4bSets('co_vs_btn3b', Ranges.vs4bVillainRange('co_vs_btn3b'), bb);
  var inSet = {};
  r.tb.concat(r.call).forEach(function (i) { inSet[i] = true; });
  var pairs = [];
  for (var p = 0; p < 13; p++) if (inSet[p * 13 + p]) pairs.push(p);
  var okPairs = pairs.length === 0 ||
    (pairs[0] === 0 && pairs[pairs.length - 1] - pairs[0] === pairs.length - 1);
  assert(okPairs, 'vs4b@' + bb + 'bb: continued pairs are a gapless top run');
});

console.log('--- Squeeze / overcall ---');

// 完整矩陣：跟冷 4-bet 同一套位置組合 → 也是 6-max 20 + 9-max 74 = 94 格
assert(Ranges.SQZ_SPOT_KEYS.length === 94 &&
  Object.keys(Ranges.SQZ_SPOTS).length === 94,
  '94 squeeze spots (6-max 20 + 9-max 74), keys in sync');
Ranges.SQZ_SPOT_KEYS.forEach(function (k) {
  var s = Ranges.SQZ_SPOTS[k];
  assert(!!Ranges.DEF_SPOTS[s.callerSpot], k + ': caller flat range comes from a real defence spot');
  var info = Ranges.sqStackInfo(k, 100);
  assert(Math.abs(info.toCall - (s.openBb - s.heroPost)) < 1e-9 &&
    Math.abs(info.needEq - info.toCall / (info.pot + info.toCall)) < 1e-9,
    k + ': squeeze pot odds arithmetic');
});
// squeeze 尺度：有位置 4x、無位置（盲注）5x 開牌
assert(Ranges.sqStackInfo('btn_utg_hjsq9', 100).sqBb === 10 &&
  Ranges.sqStackInfo('bb_co_btnsq9', 100).sqBb === 12.5,
  'squeeze sizing: 4x IP / 5x OOP');

function sqSets(key, villain, bb) {
  var map = Ranges.sqDefense(key, villain, bb);
  var tb = [], call = [];
  for (var i = 0; i < 169; i++) {
    var st = map[PushFold.classLabel(i)];
    if (st === 'tb') tb.push(i);
    else if (st === 'in') call.push(i);
  }
  return { tb: tb, call: call,
           total: PushFold.rangeComboTotal(tb) + PushFold.rangeComboTotal(call) };
}

// 100bb 預設：BB 收尾 —— squeeze 有價值段、平跟不是全開（賠率雖便宜但被 cap 住）
var sqBb = sqSets('bb_co_btnsq9', Ranges.sqVillainRange('bb_co_btnsq9'), 100);
assert(sqBb.tb.indexOf(labelIdx('AA')) >= 0 && sqBb.tb.indexOf(labelIdx('QQ')) >= 0,
  'AA/QQ squeeze at the default width');
assert(sqBb.call.indexOf(labelIdx('72o')) < 0 && sqBb.call.indexOf(labelIdx('J2o')) < 0,
  'BB does not overcall junk despite the cheap price (cap works)');
assert(sqBb.call.indexOf(labelIdx('22')) >= 0 && sqBb.call.indexOf(labelIdx('76s')) >= 0,
  'small pairs / suited connectors overcall multiway (implied odds)');
// 位置：BB 續玩最寬、SB 最窄
var vilSq = Ranges.sqVillainRange('bb_co_btnsq9');
var sqTotBb = sqSets('bb_co_btnsq9', vilSq, 100).total;
var sqTotSb = sqSets('sb_co_btnsq9', vilSq, 100).total;
var sqTotBtn = sqSets('btn_utg_hjsq9', Ranges.sqVillainRange('btn_utg_hjsq9'), 100).total;
assert(sqTotBb > sqTotSb, 'BB (closing, best price) continues wider than the squeezed SB (' +
  sqTotBb + ' > ' + sqTotSb + ')');
assert(sqTotBtn < sqTotBb, 'BTN vs a tight UTG open continues tighter than BB vs CO (' +
  sqTotBtn + ' < ' + sqTotBb + ')');
// 開牌者越寬 → 續玩越寬（容許 1 個 class 的量化抖動）
var sqLast = -1, sqMono = true;
[12, 16, 20, 26, 32, 40, 50].forEach(function (w) {
  var tot = sqSets('bb_co_btnsq9', PushFold.topPercentRange(w), 100).total;
  if (tot < sqLast - 12) sqMono = false;
  sqLast = Math.max(sqLast, tot);
});
assert(sqMono, 'a wider opener is continued against wider (within class-granularity jitter)');
// 頻率表
var sqFq = Ranges.sqFreqMap('bb_co_btnsq9', Ranges.sqVillainRange('bb_co_btnsq9'), 100);
assert(Object.keys(sqFq).length === 169, 'sqFreqMap covers all 169 hands');
assert(sqFq.AA.aggro === 1 && sqFq['72o'].fold === 1, 'AA squeezes, 72o folds');
assert(Math.abs(sqFq.AQo.aggro + sqFq.AQo.call + sqFq.AQo.fold - 1) < 1e-9,
  'squeeze frequencies sum to 1');
// 對子不可有破洞
[100, 60, 40].forEach(function (bb) {
  var r = sqSets('bb_co_btnsq9', Ranges.sqVillainRange('bb_co_btnsq9'), bb);
  var inSet = {};
  r.tb.concat(r.call).forEach(function (i) { inSet[i] = true; });
  var pairs = [];
  for (var p = 0; p < 13; p++) if (inSet[p * 13 + p]) pairs.push(p);
  var okP = pairs.length === 0 ||
    (pairs[0] === 0 && pairs[pairs.length - 1] - pairs[0] === pairs.length - 1);
  assert(okP, 'sq@' + bb + 'bb: continued pairs are a gapless top run');
});

console.log('--- Facing a squeeze ---');

// Squeeze 圖的鏡射：key 一對一
assert(Ranges.VSQ_SPOT_KEYS.length === Ranges.SQZ_SPOT_KEYS.length &&
  Ranges.VSQ_SPOT_KEYS.every(function (k) { return !!Ranges.SQZ_SPOTS[k]; }),
  'facing-squeeze spots mirror the squeeze spots one-to-one');

// 對手的預設 range = Squeeze 圖那格的 squeeze 段（資料共用）
var vsqVil = Ranges.vsqVillainRange('bb_co_btnsq9');
var sqTb = Ranges.sqDefense('bb_co_btnsq9',
  Ranges.sqVillainRange('bb_co_btnsq9'), Ranges.VS3B_BASE_BB);
var sqTbCount = 0;
for (var vl in sqTb) if (sqTb[vl] === 'tb') sqTbCount++;
assert(vsqVil.length === sqTbCount && vsqVil.indexOf(labelIdx('AA')) >= 0,
  'default villain range = the squeeze side of the squeeze chart');

// 底池算術：pot = 開牌×2 + squeeze + 死錢；needEq = toCall/(pot+toCall)
Ranges.VSQ_SPOT_KEYS.forEach(function (k) {
  var info = Ranges.vsqStackInfo(k, 100);
  var s = Ranges.VSQ_SPOTS[k];
  var expPot = info.openBb * 2 + info.sqzBb + s.deadBb;
  assert(Math.abs(info.pot - expPot) < 1e-9 &&
    Math.abs(info.needEq - info.toCall / (info.pot + info.toCall)) < 1e-9,
    k + ': facing-squeeze pot odds arithmetic');
});

// squeeze 尺度沿用 Squeeze 圖：盲注 squeeze 5x（12.5bb）、有位置 squeeze 4x（10bb）
assert(Ranges.vsqStackInfo('bb_co_btnsq9', 100).sqzBb === 12.5 &&
  Ranges.vsqStackInfo('btn_utg_hjsq9', 100).sqzBb === 10,
  'squeeze sizing mirrors the squeeze chart (5x OOP / 4x IP)');

function vsqSets(key, villain, bb) {
  var map = Ranges.vsqDefense(key, villain, bb);
  var tb = [], call = [];
  for (var i = 0; i < 169; i++) {
    var st = map[PushFold.classLabel(i)];
    if (st === 'tb') tb.push(i);
    else if (st === 'in') call.push(i);
  }
  return { tb: tb, call: call, total: tb.length + call.length };
}

// 100bb 預設：CO 開被 BB squeeze —— 頂端 4-bet、中段跟注、爛牌蓋
var vsqDef = vsqSets('bb_co_btnsq9', Ranges.vsqVillainRange('bb_co_btnsq9'), 100);
assert(vsqDef.tb.indexOf(labelIdx('AA')) >= 0 && vsqDef.tb.indexOf(labelIdx('KK')) >= 0,
  'AA/KK 4-bet at the default squeeze width');
assert(vsqDef.call.indexOf(labelIdx('72o')) < 0 && vsqDef.call.indexOf(labelIdx('J2o')) < 0,
  'trash never continues vs a squeeze');
assert(vsqDef.tb.length + vsqDef.call.length < 40,
  'vs a value-heavy squeeze you continue with a minority of your range');

// 對手變寬 → 續玩變寬（單調，允許類別粒度的抖動）
var vsqLast = -1, vsqMono = true;
[3, 5, 8, 12].forEach(function (w) {
  var tot = vsqSets('bb_co_btnsq9', PushFold.topPercentRange(w), 100).total;
  if (tot < vsqLast - 12) vsqMono = false;
  vsqLast = Math.max(vsqLast, tot);
});
assert(vsqMono, 'a wider squeezer is continued against wider');

// 位置：同一個 squeeze 者寬度，有位置（squeeze 來自盲注）續玩比無位置寬
var vsqIp = vsqSets('bb_co_btnsq9', PushFold.topPercentRange(6), 100).total;
var vsqOop = vsqSets('btn_utg_hjsq9', PushFold.topPercentRange(6), 100).total;
assert(vsqIp > vsqOop, 'IP vs a blind squeeze continues wider than OOP vs a BTN squeeze (' +
  vsqIp + ' > ' + vsqOop + ')');

// 淺碼退化：20bb 只剩全下/棄（sqzBb 12.5 → SPR < 0.5）
var vsq20 = Ranges.vsqStackInfo('bb_co_btnsq9', 20);
assert(vsq20.mode === 'jamOrFold', '20bb facing a 12.5bb squeeze is jam-or-fold');
var vsq20map = Ranges.vsqDefense('bb_co_btnsq9', Ranges.vsqVillainRange('bb_co_btnsq9'), 20);
var vsq20states = Object.keys(vsq20map).map(function (kk) { return vsq20map[kk]; });
assert(vsq20states.length > 0 &&
  vsq20states.every(function (st) { return st === 'tb'; }),
  'jam-or-fold map has no flat calls');
// 10bb：squeeze 蓋住你 → 跟全下/棄
assert(Ranges.vsqStackInfo('bb_co_btnsq9', 10).mode === 'callAllin',
  '10bb: the squeeze covers you, call-allin mode');

// 頻率表
var vsqFq = Ranges.vsqFreqMap('bb_co_btnsq9', Ranges.vsqVillainRange('bb_co_btnsq9'), 100);
assert(Object.keys(vsqFq).length === 169, 'vsqFreqMap covers all 169 hands');
assert(vsqFq.AA.aggro === 1 && vsqFq['72o'].fold === 1, 'AA 4-bets, 72o folds');
assert(Math.abs(vsqFq.AQs.aggro + vsqFq.AQs.call + vsqFq.AQs.fold - 1) < 1e-9,
  'facing-squeeze frequencies sum to 1');

// 對子不可有破洞
[100, 60, 40].forEach(function (bb) {
  var r = vsqSets('bb_co_btnsq9', Ranges.vsqVillainRange('bb_co_btnsq9'), bb);
  var inSet = {};
  r.tb.concat(r.call).forEach(function (i) { inSet[i] = true; });
  var pairs = [];
  for (var p = 0; p < 13; p++) if (inSet[p * 13 + p]) pairs.push(p);
  var okP = pairs.length === 0 ||
    (pairs[0] === 0 && pairs[pairs.length - 1] - pairs[0] === pairs.length - 1);
  assert(okP, 'vsq@' + bb + 'bb: continued pairs are a gapless top run');
});

console.log('--- Facing limpers (iso) ---');

assert(Ranges.ISO_SPOT_KEYS.length === 24 &&
  Object.keys(Ranges.ISO_SPOTS).length === 24,
  '24 iso spots (6-max 9 + 9-max 15), keys in sync');
// limper range 封頂：最強 4% 不在裡面
var limp24 = Ranges.isoLimperRange(24);
var top4 = {};
PushFold.topPercentRange(Ranges.ISO_LIMP_CAP_PCT).forEach(function (i) { top4[i] = true; });
assert(limp24.every(function (i) { return !top4[i]; }) &&
  Math.abs(PushFold.rangeComboTotal(limp24) / 1326 * 100 - 24) < 2,
  'limper range is capped (no top 4%) and about 24% wide');

function isoSets(key, pct, bb) {
  var map = Ranges.isoDefense(key, Ranges.isoLimperRange(pct), bb);
  var tb = [], call = [];
  for (var i = 0; i < 169; i++) {
    var st = map[PushFold.classLabel(i)];
    if (st === 'tb') tb.push(i);
    else if (st === 'in') call.push(i);
  }
  return { tb: tb, call: call,
           total: PushFold.rangeComboTotal(tb) + PushFold.rangeComboTotal(call) };
}

// BTN 面對 1 家 limp：iso 是「比開牌圖寬的大牌」——ATo 進 iso、小對子與同花連張跟 limp
var isoBtn = isoSets('btn_iso19', 24, 100);
assert(isoBtn.tb.indexOf(labelIdx('ATo')) >= 0 && isoBtn.tb.indexOf(labelIdx('AA')) >= 0,
  'ATo/AA iso-raise vs a capped limper range');
assert(isoBtn.call.indexOf(labelIdx('22')) >= 0 && isoBtn.call.indexOf(labelIdx('76s')) >= 0,
  'small pairs / suited connectors limp behind on the BTN');
assert(isoBtn.tb.indexOf(labelIdx('72o')) < 0 && isoBtn.call.indexOf(labelIdx('72o')) < 0,
  '72o folds');
// 2 家 limp → iso 更緊；SB 比 BTN 緊
assert(isoSets('btn_iso29', 24, 100).tb.length < isoBtn.tb.length,
  'two limpers → tighter iso');
assert(isoSets('sb_iso19', 24, 100).total < isoBtn.total,
  'SB continues tighter than BTN vs a limper');
// BB：免費過牌 → 沒有蓋牌，iso 以外全是過牌
var isoBb = isoSets('bb_iso19', 24, 100);
assert(isoBb.tb.length + isoBb.call.length === 169,
  'BB facing limpers never folds (free check)');
// limper 越鬆 → iso 越寬
assert(isoSets('btn_iso19', 40, 100).tb.length > isoBtn.tb.length,
  'looser limpers get iso-raised wider');
// 淺籌碼：iso = 全下
assert(Ranges.isoStackInfo('btn_iso19', 12).isoAllIn === true &&
  Ranges.isoStackInfo('btn_iso19', 100).isoAllIn === false,
  'iso becomes a jam at 15bb and below');
// 尺度：IP 4bb / OOP 5bb，每多一個 limper +1
assert(Ranges.isoStackInfo('btn_iso19', 100).isoBb === 4 &&
  Ranges.isoStackInfo('btn_iso29', 100).isoBb === 5 &&
  Ranges.isoStackInfo('sb_iso19', 100).isoBb === 5,
  'iso sizing 4bb IP / 5bb OOP, +1 per extra limper');
// 頻率表：BB 續玩恆為 1（不是加注就是免費過牌）
var isoFq = Ranges.isoFreqMap('bb_iso19', Ranges.isoLimperRange(24), 100);
assert(Object.keys(isoFq).length === 169 && isoFq['72o'].fold === 0 && isoFq['72o'].call === 1,
  'BB iso freq map: junk checks for free, never folds');
var isoFqBtn = Ranges.isoFreqMap('btn_iso19', Ranges.isoLimperRange(24), 100);
assert(isoFqBtn.AA.aggro === 1 && isoFqBtn['72o'].fold === 1,
  'BTN iso freq map: AA raises, 72o folds');
// 對子不可有破洞
[100, 60, 40].forEach(function (bb) {
  var r = isoSets('btn_iso19', 24, bb);
  var inSet = {};
  r.tb.concat(r.call).forEach(function (i) { inSet[i] = true; });
  var pairs = [];
  for (var p = 0; p < 13; p++) if (inSet[p * 13 + p]) pairs.push(p);
  var okI = pairs.length === 0 ||
    (pairs[0] === 0 && pairs[pairs.length - 1] - pairs[0] === pairs.length - 1);
  assert(okI, 'iso@' + bb + 'bb: continued pairs are a gapless top run');
});

// 家族單調化不是只用在冷 4-bet：另外三張圖的動態試算也要沒有破洞
var defHoleCheck = Ranges.defenseAtDepth('bb_vs_btn',
  PushFold.topPercentRange(Ranges.openerOpenPct('bb_vs_btn')),
  Ranges.defenseCalibrate('bb_vs_btn',
    PushFold.topPercentRange(Ranges.openerOpenPct('bb_vs_btn')), 150, 550), 45);
var dPairs = [];
for (var dp = 0; dp < 13; dp++) {
  if (defHoleCheck[PushFold.classLabel(dp * 13 + dp)]) dPairs.push(dp);
}
assert(dPairs.length === 0 ||
  (dPairs[0] === 0 && dPairs[dPairs.length - 1] - dPairs[0] === dPairs.length - 1),
  'defenceAtDepth also produces gapless pairs (' +
  dPairs.map(function (r) { return PushFold.classLabel(r * 13 + r); }).join(',') + ')');

// ---------- 6b. Postflop ----------
console.log('--- Postflop ---');
var Postflop = require('../js/postflop.js');

// bestScore 支援 5 / 6 / 7 張
assert(Postflop.bestScore(cards('Ah Kh Qh Jh Th'))[0] === 8, 'bestScore 5 cards: straight flush');
assert(Postflop.bestScore(cards('Ah Kh Qh Jh Th 2c'))[0] === 8, 'bestScore 6 cards: straight flush');
assert(Postflop.bestScore(cards('Ah Kh Qh Jh Th 2c 3d'))[0] === 8, 'bestScore 7 cards: straight flush');

// 牌面質地
var texDry = Postflop.classifyBoard(cards('Kd 7c 2h'));
assert(texDry.wetness === 0 && texDry.rainbow && !texDry.paired,
  'K72 rainbow is fully dry (wetness 0)');
var texWet = Postflop.classifyBoard(cards('9s Ts Jh'));
assert(texWet.wetness === 0.75 && texWet.twoTone && texWet.straightSpan === 3,
  '9TJ two-tone connected is wet (0.75)');
var texMono = Postflop.classifyBoard(cards('2h 7h Jh'));
assert(texMono.monotone && texMono.suitMax === 3, 'monotone board detected');
var texPair = Postflop.classifyBoard(cards('8d 8c 3h'));
assert(texPair.paired && !texPair.trips, 'paired board detected');
assert(Postflop.classifyBoard(cards('8d 8c 8h')).trips, 'trips board detected');
assert(texDry.highCard === 13 && texWet.highCard === 11, 'highCard is the top board rank');

// 順子窗 / 聽牌
assert(Postflop.maxStraightWindow([14, 5, 4]) === 3, 'A54 counts A as low (3 in one window)');
var oesd = Postflop.straightDrawInfo(cards('8h 7d'), cards('9c Tc 2s'));
assert(oesd.type === 'oesd' && oesd.outs === 8, '87 on 9T2 is an open-ended draw (8 outs)');
var gut = Postflop.straightDrawInfo(cards('Ah Kd'), cards('Qc Jc 2s'));
assert(gut.type === 'gutshot' && gut.outs === 4, 'AK on QJ2 is a gutshot (4 outs)');
assert(Postflop.straightDrawInfo(cards('Ah 2d'), cards('3c 4c 5s')).type === '',
  'a made straight is not counted as a draw');
assert(Postflop.straightDrawInfo(cards('Ah Kd'), cards('9c 4c 2s')).type === '',
  'no straight draw when nothing connects');
var fd = Postflop.flushDrawInfo(cards('Ac 5c'), cards('Kc 8c 2s'));
assert(fd.draw && fd.nut, 'A5 with two board clubs is a nut flush draw');
assert(!Postflop.flushDrawInfo(cards('Ac 5c'), cards('Kc 8c 2s 9h Ts')).draw,
  'no flush draw once the river is out');

// 手牌分級
assert(Postflop.handClass(cards('Ah Kd'), cards('Kc 7c 2s')).bucket === 'topPair', 'AK on K72 = top pair');
assert(Postflop.handClass(cards('Qh Qd'), cards('9c 7c 2s')).bucket === 'topPair', 'QQ on 972 = overpair');
assert(Postflop.handClass(cards('Qh Qd'), cards('Kc 7c 2s')).bucket === 'weakPair',
  'QQ under a king is only a weak pair');
assert(Postflop.handClass(cards('7h 2d'), cards('7c 5c 2s')).bucket === 'twoPair', '72 on 752 = two pair');
assert(Postflop.handClass(cards('5h 5d'), cards('5c 9c 2s')).bucket === 'nut', 'set = nut bucket');
assert(Postflop.handClass(cards('Ah Kd'), cards('8c 8d 2s')).bucket === 'air',
  'board pair alone is not your pair');
assert(Postflop.handClass(cards('Tc 9c'), cards('8c 7d 2s')).bucket === 'draw',
  'open-ender + backdoor flush = draw bucket');
assert(Postflop.handClass(cards('Ah 3d'), cards('Kc 9c 2s')).bucket === 'air', 'A3 on K92 = air');

// MDF / 底池賠率 / 平衡詐唬比
assert(Math.abs(Postflop.mdf(1, 1) - 0.5) < 1e-9, 'pot-size bet: MDF = 50%');
assert(Math.abs(Postflop.mdf(0.5, 1) - 2 / 3) < 1e-9, 'half-pot bet: MDF = 66.7%');
assert(Math.abs(Postflop.alpha(1, 1) - 0.5) < 1e-9, 'pot-size bet: alpha = 50%');
assert(Math.abs(Postflop.callPotOdds(1, 1) - 1 / 3) < 1e-9, 'pot-size bet: caller needs 33%');
assert(Math.abs(Postflop.balancedBluffCount(2, 1, 1) - 1) < 1e-9,
  'pot-size bet: 2 value hands support 1 bluff');
// 平衡點上，詐唬占比恰好等於跟注方的底池賠率 → 跟注無差異
var nV = 60, betX = 0.75, potX = 1;
var nB = Postflop.balancedBluffCount(nV, betX, potX);
assert(Math.abs(nB / (nB + nV) - Postflop.callPotOdds(betX, potX)) < 1e-9,
  'balanced bluff share equals the caller pot odds (indifference)');

// c-bet 策略
var polDry = Postflop.cbetHandPolicy(cards('Ah Kd'), cards('Kc 7c 2s'), { role: 'ip', potType: 'srp' });
assert(polDry.action === 'small', 'top pair on a dry board: small c-bet');
var polWet = Postflop.cbetHandPolicy(cards('Js Jd'), cards('9s Ts 8h'), { role: 'ip', potType: 'srp' });
assert(polWet.action === 'big', 'overpair on a wet connected board: big c-bet');
var polAir = Postflop.cbetHandPolicy(cards('2c 3d'), cards('9s Ts 8h'), { role: 'oop', potType: 'srp' });
assert(polAir.action === 'check', 'air out of position on a wet board: check');
var polSemi = Postflop.cbetHandPolicy(cards('7h 4d'), cards('9s Ts 8h'), { role: 'ip', potType: 'srp' });
assert(polSemi.action === 'big', 'open-ended draw on a wet board: big semi-bluff');
var polRange = Postflop.cbetRangePolicy(Postflop.classifyBoard(cards('Ad 7c 2h')), { role: 'ip', potType: 'srp' });
var polRangeWet = Postflop.cbetRangePolicy(Postflop.classifyBoard(cards('9s Ts Jh')), { role: 'ip', potType: 'srp' });
assert(polRange.freq > polRangeWet.freq, 'dry ace-high board is c-bet more often than a wet one');
assert(polRange.size === 'small' && polRangeWet.size === 'big', 'wet boards use the bigger size');
assert(Postflop.cbetRangePolicy(Postflop.classifyBoard(cards('Ad 7c 2h')), { role: 'oop' }).freq <
  polRange.freq, 'out of position lowers the c-bet frequency');

// range on board
var rngA = PushFold.rangeFromNotation('QQ+ AKs AKo');
var profA = Postflop.rangeBoardProfile(rngA, cards('Ad 7c 2h'));
assert(profA.combos === 27, 'rangeBoardProfile drops combos blocked by the board (27 left)');
assert(profA.buckets.nut === 3, 'AA makes a set on an ace-high board (3 combos left)');
assert(profA.airPct === 0, 'QQ+/AK has no air on A72');
var rvrBoard = Postflop.rangeVsRangeBoard(PushFold.rangeFromNotation('AA'),
  PushFold.rangeFromNotation('KK'), cards('Ad 7c 2h 5s 9d'));
assert(rvrBoard.method === 'exact' && rvrBoard.a === 1, 'AA with a set beats KK 100% on A72-5-9');
var rvrFlop = Postflop.rangeVsRangeBoard(PushFold.rangeFromNotation('AA'),
  PushFold.rangeFromNotation('22'), cards('Ad 7c 2h'), 3000);
assert(rvrFlop.a > 0.9 && rvrFlop.a < 1, 'top set over bottom set: ahead but not drawing dead');

// 題目產生器（注入固定亂數 → 可重現）
function lcg(seed) {
  var s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
var rngQ = lcg(2026);
for (var qi = 0; qi < 25; qi++) {
  var spot = Postflop.buildRiverSpot({ rand: rngQ, pot: 10 });
  var heroScore = Postflop.bestScore(spot.hero.concat(spot.board));
  var loseToValue = spot.value.every(function (c) {
    return Evaluator.compareScore(Postflop.bestScore(c.concat(spot.board)), heroScore) > 0;
  });
  var beatBluffs = spot.bluff.every(function (c) {
    return Evaluator.compareScore(Postflop.bestScore(c.concat(spot.board)), heroScore) < 0;
  });
  if (!loseToValue || !beatBluffs) { assert(false, 'river spot #' + qi + ' is not a clean bluff-catcher'); break; }
  if (Math.abs(spot.equity - spot.nBluff / (spot.nBluff + spot.nValue)) > 1e-12) {
    assert(false, 'river spot #' + qi + ' equity mismatch'); break;
  }
  if (spot.best !== (spot.equity >= spot.needEq ? 'call' : 'fold')) {
    assert(false, 'river spot #' + qi + ' verdict mismatch'); break;
  }
  if (qi === 24) {
    assert(true, 'buildRiverSpot: hero always beats every bluff and loses to every value hand (25 spots)');
    assert(true, 'buildRiverSpot: equity = bluff share and the verdict follows pot odds (25 spots)');
  }
}
var cbSpot = Postflop.buildCbetSpot({ rand: lcg(7) });
assert(cbSpot.board.length === 3 && cbSpot.hero.length === 2, 'buildCbetSpot deals a flop and a hand');
assert(['big', 'small', 'check'].indexOf(cbSpot.policy.action) >= 0, 'buildCbetSpot returns a valid action');
var cbCards = cbSpot.board.concat(cbSpot.hero).map(Evaluator.cardToString);
assert(cbCards.length === new Set(cbCards).size, 'buildCbetSpot never deals a duplicate card');

// ---------- 6c. 混合頻率 ----------
console.log('--- Mixed frequencies ---');
assert(Math.abs(Ranges.mixRamp(0.5, 0.5) - 0.5) < 1e-9, 'score at the threshold = 50/50');
assert(Ranges.mixRamp(0.5 + Ranges.MIX_BAND, 0.5) === 1, 'a full band above the threshold is pure');
assert(Ranges.mixRamp(0.5 - Ranges.MIX_BAND, 0.5) === 0, 'a full band below the threshold is pure fold');
var fs = Ranges.freqSplit(0.3, 0.8);
assert(Math.abs(fs.aggro - 0.3) < 1e-9 && Math.abs(fs.call - 0.5) < 1e-9 &&
  Math.abs(fs.fold - 0.2) < 1e-9, 'freqSplit turns aggro/continue into three frequencies');
assert(Math.abs(fs.aggro + fs.call + fs.fold - 1) < 1e-9, 'the three frequencies sum to 1');
var fsClamp = Ranges.freqSplit(0.9, 0.4);
assert(fsClamp.call === 0 && Math.abs(fsClamp.fold - 0.1) < 1e-9,
  'continue can never be below aggro');
assert(Ranges.mixBest({ aggro: 0.1, call: 0.6, fold: 0.3 }) === 'call', 'mixBest picks the top frequency');
assert(Ranges.mixAccept({ aggro: 0.3, call: 0.5, fold: 0.2 }, 'aggro'), 'a 30% action is accepted');
assert(!Ranges.mixAccept({ aggro: 0.1, call: 0.7, fold: 0.2 }, 'aggro'), 'a 10% action is not accepted');
// 放寬判定：兩邊都要有頻率
var frBoth = { aggro: 0.5, call: 0.5, fold: 0 };
assert(Ranges.mixTolerates(frBoth, 'aggro', 'call'), 'both actions above 25% -> either is accepted');
var frOneSided = { aggro: 0, call: 1, fold: 0 };
assert(!Ranges.mixTolerates(frOneSided, 'call', 'aggro'),
  'model gives the chart answer 0% -> grade strictly by the chart, no leniency');
assert(!Ranges.mixTolerates(frBoth, 'fold', 'call'), 'a 0% action is never accepted');
assert(!Ranges.mixTolerates(frBoth, 'call', 'call'), 'same action is not a leniency case');
assert(!Ranges.mixTolerates(null, 'call', 'fold'), 'mixTolerates handles a missing frequency map');
assert(Ranges.isMixed({ aggro: 0.4, call: 0.4, fold: 0.2 }), 'no action >= 90% means mixed');
assert(!Ranges.isMixed({ aggro: 0.95, call: 0.05, fold: 0 }), '95% aggro is a pure strategy');

var rfiTarget = PushFold.rangeComboTotal(PushFold.rangeFromNotation(Ranges.RFI_RANGES_6.co.notation));
var rfiFreq = Ranges.rfiFreqMap(rfiTarget, 100);
assert(Object.keys(rfiFreq).length === 169, 'rfiFreqMap covers all 169 hands');
assert(rfiFreq.AA.aggro === 1 && rfiFreq['32o'].aggro === 0, 'RFI: AA always opens, 32o never does');
assert(rfiFreq.AA.call === 0, 'RFI has no call option');
var v3bFreq = Ranges.vs3bFreqMap('btn_vs_bb3b', 100, Ranges.vs3bCalibrate('btn_vs_bb3b'));
assert(v3bFreq.AA.aggro === 1 && v3bFreq['72o'].fold === 1, 'vs 3-bet: AA 4-bets, 72o folds');
var mixedHands = Object.keys(v3bFreq).filter(function (k) { return Ranges.isMixed(v3bFreq[k]); });
assert(mixedHands.length > 0 && mixedHands.length < 60,
  'vs 3-bet has a sane number of mixed hands (' + mixedHands.length + ')');
var v3bSum = v3bFreq.ATo.aggro + v3bFreq.ATo.call + v3bFreq.ATo.fold;
assert(Math.abs(v3bSum - 1) < 1e-9, 'vs 3-bet frequencies sum to 1');
var defDynPct = Ranges.openerOpenPct('bb_vs_btn');
var defCal = Ranges.defenseCalibrate('bb_vs_btn', PushFold.topPercentRange(defDynPct), 100, 400);
var defFreq = Ranges.defFreqMap('bb_vs_btn', PushFold.topPercentRange(defDynPct), defCal, 100);
assert(Object.keys(defFreq).length === 169, 'defFreqMap covers all 169 hands');
assert(defFreq.AA.aggro === 1, 'defence: AA always 3-bets');
// 淺籌碼沒有平跟這個選項 → 跟注頻率一律 0
var defShallow = Ranges.defFreqMap('bb_vs_btn', PushFold.topPercentRange(defDynPct), defCal, 12);
var anyCall = Object.keys(defShallow).some(function (k) { return defShallow[k].call > 0; });
assert(Ranges.defStackInfo('bb_vs_btn', 12).mode !== 'normal' ? !anyCall : true,
  'no flat-call frequency when the SPR is too low to flat');

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

// ---------- 8. 語音選牌解析 ----------
console.log('--- VoiceCards ---');
var Voice = require('../js/voice.js');

function vparse(txt, villains) { return Voice.parse(txt, { villains: villains || 1 }); }
function vslots(p) {
  var m = {};
  p.entries.forEach(function (e) { m[e.slot] = Evaluator.cardToString(e.card); });
  return m;
}

var vp = vparse('我的牌紅心A黑桃K');
var vm = vslots(vp);
assert(vp.entries.length === 2 && vm.hero0 === 'Ah' && vm.hero1 === 'Ks',
  'voice: zh hero 紅心A黑桃K');

vp = vparse('我 紅心A 黑桃K，對手 方塊Q 方塊J，公牌 黑桃10 紅心9 梅花2');
vm = vslots(vp);
assert(vp.entries.length === 7 && vm.hero0 === 'Ah' && vm.hero1 === 'Ks' &&
  vm.v0a === 'Qd' && vm.v0b === 'Jd' &&
  vm.board0 === 'Ts' && vm.board1 === '9h' && vm.board2 === '2c',
  'voice: zh 完整句（hero+對手+公牌）');

vm = vslots(vparse('红心十 方块二'));
assert(vm.hero0 === 'Th' && vm.hero1 === '2d', 'voice: 簡體字＋中文數字');

vm = vslots(vparse('轉牌 黑桃2'));
assert(vm.board3 === '2s', 'voice: 轉牌 → board3');
vm = vslots(vparse('river 紅心A'));
assert(vm.board4 === 'Ah', 'voice: river → board4');

vp = vparse('對手二 梅花8 梅花9');
vm = vslots(vp);
assert(vm.v1a === '8c' && vm.v1b === '9c' && vp.maxVillain === 1,
  'voice: 對手二 → v1');

vm = vslots(vparse('對手 紅心2 紅心3 對手 紅心4 紅心5'));
assert(vm.v0a === '2h' && vm.v0b === '3h' && vm.v1a === '4h' && vm.v1b === '5h',
  'voice: 未編號對手自動遞增');

vm = vslots(vparse('黑桃A 黑桃K 紅心Q 紅心J 方塊2 方塊3 方塊4'));
assert(vm.hero0 === 'As' && vm.hero1 === 'Ks' && vm.v0a === 'Qh' && vm.v0b === 'Jh' &&
  vm.board0 === '2d' && vm.board2 === '4d',
  'voice: 連續模式 7 張（hero→對手→公牌）');

vm = vslots(vparse('黑桃A 黑桃K 紅心Q 紅心J 方塊9 方塊8 梅花2 梅花3 梅花4', 2));
assert(vm.v1a === '9d' && vm.v1b === '8d' && vm.board0 === '2c',
  'voice: 連續模式吃 villains 參數（2 位對手）');

vm = vslots(vparse('hero ace of hearts king of spades board ten of clubs nine of clubs two of clubs'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks' && vm.board0 === 'Tc' && vm.board2 === '2c',
  'voice: 英文 rank of suit');

vm = vslots(vparse('AH KD'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Kd', 'voice: 縮寫 AH KD');
assert(vparse('as well as that').entries.length === 0, 'voice: 英文小寫 as 不是黑桃A');
vm = vslots(vparse('9h 10c'));
assert(vm.hero0 === '9h' && vm.hero1 === 'Tc', 'voice: 含數字縮寫 9h 10c');

assert(vparse('紅心A 紅心A').errors.some(function (e) { return e.code === 'dup'; }),
  'voice: 同句重複牌報 dup');
assert(vparse('黑桃2 黑桃3 黑桃4 黑桃5 黑桃6 黑桃7 黑桃8 黑桃9 黑桃10 黑桃J 黑桃Q 黑桃K')
  .errors.some(function (e) { return e.code === 'overflow'; }),
  'voice: 牌多過牌位報 overflow');
assert(vparse('全部清除').clear === true, 'voice: 清除指令');

vp = vparse('對手一 紅心Q 對手一 方塊Q 方塊J');
vm = vslots(vp);
assert(vp.entries.length === 2 && vm.v0a === 'Qd' && vm.v0b === 'Jd',
  'voice: 重講同一位對手 = 蓋掉舊值');

// 多語系花色/人頭詞
vm = vslots(vparse('ハートのエース スペードのキング'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 日文');
vm = vslots(vparse('하트 에이스 스페이드 킹'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 韓文');
vm = vslots(vparse('as de corazones rey de picas'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 西文');
vm = vslots(vparse('туз червей король пик'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 俄文');
vm = vslots(vparse('Herz Ass Pik König'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 德文（花色在前）');
vm = vslots(vparse('át cơ già bích'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 越文');
vm = vslots(vparse('เอซโพแดง คิงโพดำ'));
assert(vm.hero0 === 'Ah' && vm.hero1 === 'Ks', 'voice: 泰文（無空白相鄰）');

// whisper 實測輸出：頓號黏牌、「十」聽成「石」都要能解（2026-08-20 真音檔回歸）
vp = vparse('我紅心A黑桃、K、對手、方塊、Q、方塊、J、公牌、黑桃、石、紅心、九、梅花、二。');
vm = vslots(vp);
assert(vp.entries.length === 7 && vm.hero0 === 'Ah' && vm.hero1 === 'Ks' &&
  vm.v0a === 'Qd' && vm.v0b === 'Jd' &&
  vm.board0 === 'Ts' && vm.board1 === '9h' && vm.board2 === '2c',
  'voice: whisper 實測輸出（頓號＋十→石同音）');

// 底池/需跟金額：抽出金額並確保數字不會被當牌
var va = Voice.parseAmounts('我 紅心A 黑桃K，對手 方塊Q 方塊J，底池100 需跟30');
assert(va.pot === 100 && va.call === 30, 'voice: parseAmounts 底池/需跟');
vm = vslots(vparse(va.cleaned));
assert(Object.keys(vm).length === 4 && vm.hero0 === 'Ah' && vm.v0a === 'Qd',
  'voice: 金額拿掉後不會被當牌');
va = Voice.parseAmounts('pot 80 call 20 hero ace of hearts');
assert(va.pot === 80 && va.call === 20, 'voice: parseAmounts 英文 pot/call');
va = Voice.parseAmounts('底持60 跟注15'); // whisper 同音
assert(va.pot === 60 && va.call === 15, 'voice: parseAmounts 底持/跟注 同音');
va = Voice.parseAmounts('我 紅心A 黑桃K');
assert(va.pot === undefined && va.call === undefined, 'voice: 沒講金額回 undefined');

// 每個語系的「語音範例」翻譯本身都要能解析出同樣 7 張牌＋金額
var voiceExampleKey = '語音範例：「我 紅心A 黑桃K，對手 方塊Q 方塊J，公牌 黑桃10 紅心9 梅花2，底池100 需跟30」';
var voiceLangs = ['zh-CN', 'en', 'ja', 'ko', 'es', 'pt-BR', 'fr', 'de', 'ru', 'vi', 'th'];
var voiceExamplesOk = [voiceExampleKey].concat(voiceLangs.map(function (lang) {
  var tbl = JSON.parse(require('fs').readFileSync(
    __dirname + '/../tools/i18n-src/' + lang + '.json', 'utf8'));
  return tbl[voiceExampleKey];
})).every(function (ex, idx) {
  var amt = Voice.parseAmounts(ex);
  var p = Voice.parse(amt.cleaned, { villains: 1 });
  var m = vslots(p);
  var ok = p.entries.length === 7 && p.errors.length === 0 &&
    m.hero0 === 'Ah' && m.hero1 === 'Ks' && m.v0a === 'Qd' && m.v0b === 'Jd' &&
    m.board0 === 'Ts' && m.board1 === '9h' && m.board2 === '2c' &&
    amt.pot === 100 && amt.call === 30;
  if (!ok) console.log('  範例解析失敗 [' + (idx === 0 ? 'zh-TW' : voiceLangs[idx - 1]) + ']: ' + ex +
    ' → ' + JSON.stringify(m) + ' errors=' + JSON.stringify(p.errors) +
    ' pot=' + amt.pot + ' call=' + amt.call);
  return ok;
});
assert(voiceExamplesOk, 'voice: 12 語系的語音範例字串全數可解析成同樣 7 張牌＋底池/需跟');

// ---------- 9. 複盤語音（位置＋逐街） ----------
console.log('--- VoiceCards streets ---');

assert(Voice.parsePosition('我在CO 紅心A 黑桃K') === 'CO', 'voice: parsePosition 我在CO');
assert(Voice.parsePosition('button') === 'BTN' && Voice.parsePosition('按鈕位') === 'BTN',
  'voice: parsePosition button/按鈕');
assert(Voice.parsePosition('under the gun') === 'UTG' && Voice.parsePosition('UTG+1') === 'UTG+1',
  'voice: parsePosition UTG 家族');
assert(Voice.parsePosition('小盲') === 'SB' && Voice.parsePosition('大盲') === 'BB',
  'voice: parsePosition 盲注位');
assert(Voice.parsePosition('as de corazones rey de picas') === null,
  'voice: corazones 裡的 CO 不會誤判成位置');

var vs = Voice.parseStreets('翻牌 黑桃10 紅心9 梅花2 底池45 需跟30 我加注，轉牌 黑桃2 底池105 我跟注');
assert(vs.segs.flop && vs.segs.flop.pot === 45 && vs.segs.flop.call === 30 && vs.segs.flop.action === 'raise',
  'voice: 翻牌段 底池/需跟/加注');
assert(vs.segs.turn && vs.segs.turn.pot === 105 && vs.segs.turn.action === 'call' && vs.segs.turn.call === undefined,
  'voice: 轉牌段 底池/跟注');
vp = vparse(vs.cleaned);
vm = vslots(vp);
assert(vm.board0 === 'Ts' && vm.board1 === '9h' && vm.board2 === '2c' && vm.board3 === '2s',
  'voice: 逐街公牌 flop 3 張 + turn 1 張');

vs = Voice.parseStreets('翻前 底池15 需跟10 全下');
assert(vs.segs.preflop && vs.segs.preflop.pot === 15 && vs.segs.preflop.call === 10 &&
  vs.segs.preflop.action === 'allin', 'voice: 翻前段 全下');

vs = Voice.parseStreets('river 梅花A 過牌');
assert(vs.segs.river && vs.segs.river.action === 'call', 'voice: 過牌視為跟 0');
vs = Voice.parseStreets('轉牌 蓋牌');
assert(vs.segs.turn && vs.segs.turn.action === 'fold', 'voice: 蓋牌');

// 口語 range → 記號（產出必須能被 rangeFromNotation 吃下去）
vs = Voice.parseStreets('翻牌 對手 口袋七以上 AK');
assert(vs.segs.flop.range === '77+ AKs AKo', 'voice: 口袋七以上 AK → 77+ AKs AKo');
assert(!!PushFold.rangeFromNotation(vs.segs.flop.range), 'voice: 產出的 range 記號合法');
vs = Voice.parseStreets('turn A9同花以上 KQ雜色');
assert(vs.segs.turn.range === 'A9s+ KQo', 'voice: A9同花以上 KQ雜色');
assert(!!PushFold.rangeFromNotation(vs.segs.turn.range), 'voice: s/o 記號合法');
vs = Voice.parseStreets('river 口袋Q JJ以上 A10同花');
assert(vs.segs.river.range === 'QQ JJ+ ATs', 'voice: 口袋Q / JJ以上 / A10同花');
vs = Voice.parseStreets('flop pocket sevens plus AQ suited');
assert(vs.segs.flop.range === '77+ AQs', 'voice: 英文 pocket sevens plus + AQ suited');
vs = Voice.parseStreets('翻牌 底池95 我加注');   // 95 是底池不是 range
assert(vs.segs.flop.range === undefined && vs.segs.flop.pot === 95, 'voice: 純數字不誤判成 range');
vs = Voice.parseStreets('flop take the stack and raise'); // TAKE/STACK 裡的 TA 不是 range
assert(vs.segs.flop.range === undefined, 'voice: 英文單字內的字母對不誤判');

// 「底池10 梅花2」不可誤讀成 rank10+梅花（金額先拔掉再抓牌）
vs = Voice.parseStreets('翻牌 底池10 梅花2 梅花3 梅花4');
vp = vparse(vs.cleaned);
vm = vslots(vp);
assert(vs.segs.flop.pot === 10 && vm.board0 === '2c' && vm.board1 === '3c' && vm.board2 === '4c' &&
  vp.entries.length === 3, 'voice: 金額不會黏成牌');

// whisper 真音檔同音字回歸（2026-08-20：底持/須跟/家住/酒/CEO）
vs = Voice.parseStreets('翻牌黑桃、紅心、酒梅花2、底持45須跟30我家住,對手口袋7以上AK。');
assert(vs.segs.flop.pot === 45 && vs.segs.flop.call === 30 && vs.segs.flop.action === 'raise' &&
  vs.segs.flop.range === '77+ AKs AKo', 'voice: 底持/須跟/家住 同音字');
vp = vparse(vs.cleaned);
vm = vslots(vp);
assert(vm.board0 === '9h' && vm.board1 === '2c', 'voice: 紅心酒 → 9h');
assert(Voice.parsePosition('我在CEO') === 'CO', 'voice: CEO → CO');

// 兩個新語音範例：12 語系都要能解出正確結果
var heroExKey = '語音範例：「我在CO 紅心A 黑桃K」';
var streetExKey = '語音範例：「翻牌 黑桃10 紅心9 梅花2 底池45 需跟30 我加注 對手 口袋七以上 AK，轉牌 黑桃2 底池105 我跟注」';
var langTables = { 'zh-TW': null };
voiceLangs.forEach(function (lang) {
  langTables[lang] = JSON.parse(require('fs').readFileSync(
    __dirname + '/../tools/i18n-src/' + lang + '.json', 'utf8'));
});
var heroExOk = Object.keys(langTables).every(function (lang) {
  var ex = langTables[lang] ? langTables[lang][heroExKey] : heroExKey;
  var p = Voice.parse(ex, { villains: 1 });
  var m = vslots(p);
  var ok = m.hero0 === 'Ah' && m.hero1 === 'Ks' && Voice.parsePosition(ex) === 'CO';
  if (!ok) console.log('  hero 範例失敗 [' + lang + ']: ' + ex + ' → ' + JSON.stringify(m) +
    ' pos=' + Voice.parsePosition(ex));
  return ok;
});
assert(heroExOk, 'voice: 12 語系「位置+手牌」範例全數可解析');
var streetExOk = Object.keys(langTables).every(function (lang) {
  var ex = langTables[lang] ? langTables[lang][streetExKey] : streetExKey;
  var st = Voice.parseStreets(ex);
  var p = Voice.parse(st.cleaned, { villains: 1 });
  var m = vslots(p);
  var ok = m.board0 === 'Ts' && m.board1 === '9h' && m.board2 === '2c' && m.board3 === '2s' &&
    st.segs.flop && st.segs.flop.pot === 45 && st.segs.flop.call === 30 && st.segs.flop.action === 'raise' &&
    st.segs.flop.range === '77+ AKs AKo' &&
    st.segs.turn && st.segs.turn.pot === 105 && st.segs.turn.action === 'call';
  if (!ok) console.log('  street 範例失敗 [' + lang + ']: ' + ex + ' → ' + JSON.stringify(m) +
    ' segs=' + JSON.stringify(st.segs));
  return ok;
});
assert(streetExOk, 'voice: 12 語系「逐街」範例全數可解析');

// ---------- 10. 一句話錄整手（桌況／結果／對手／攤牌） ----------
console.log('--- VoiceCards hand-record ---');

var vt = Voice.parseTable('盲注5/10 前注1 有效籌碼100 8人 錦標賽');
assert(vt.blinds === '5/10' && vt.ante === 1 && vt.stack === 100 && vt.players === 8 && vt.gtype === 'mtt',
  'voice: parseTable zh 全欄位');
vt = Voice.parseTable('blinds 50 100 cash 6 players stack 80');
assert(vt.blinds === '50/100' && vt.gtype === 'cash' && vt.players === 6 && vt.stack === 80,
  'voice: parseTable en＋空白分隔盲注');
vt = Voice.parseTable('盲注510');
assert(vt.blinds === undefined, 'voice: 盲注沒分隔不亂猜');
vt = Voice.parseTable('有效籌碼100 對手BTN 籌碼80');
assert(vt.stack === 100, 'voice: stack 取第一個（桌況在前）');

assert(Voice.parseResult('結果輸35') === -35 && Voice.parseResult('贏75') === 75 &&
  Voice.parseResult('lost 12.5') === -12.5 && Voice.parseResult('結果 -20') === -20 &&
  Voice.parseResult('底池45 我加注') === null, 'voice: parseResult 贏/輸/lost/結果');

assert(Voice.parsePosition('對手BTN 80') === null, 'voice: 對手BTN 不是我的位置');
assert(Voice.parsePosition('我在CO，對手BTN 80') === 'CO', 'voice: 有對手詞時仍取到我的 CO');

var vo = Voice.parseOppStacks('BTN 80，SB 45');
assert(vo.length === 2 && vo[0].pos === 'BTN' && vo[0].stack === 80 && vo[1].pos === 'SB' && vo[1].stack === 45,
  'voice: parseOppStacks 兩列');
vo = Voice.parseOppStacks('對手BTN 80');
assert(vo.length === 1 && vo[0].pos === 'BTN' && vo[0].stack === 80, 'voice: 對手BTN 80');
assert(Voice.parseOppStacks('as de corazones').length === 0, 'voice: corazones 不產生對手列');

var vsd = Voice.parseShowdown('BTN 方塊9 方塊8，SB 紅心A 紅心K');
assert(vsd.length === 2 && vsd[0].pos === 'BTN' &&
  Evaluator.cardToString(vsd[0].cards[0]) === '9d' && Evaluator.cardToString(vsd[0].cards[1]) === '8d' &&
  vsd[1].pos === 'SB' && Evaluator.cardToString(vsd[1].cards[0]) === 'Ah',
  'voice: parseShowdown 兩家');
assert(Voice.parseShowdown('BTN 方塊9').length === 0, 'voice: 攤牌不足兩張略過');

// 一句話整手：12 語系範例鎖（桌況+位置+手牌+逐街+結果）
var allExKey = '語音範例：「盲注5/10 有效籌碼100 8人 錦標賽，我在CO 紅心A 黑桃K，翻牌 黑桃10 紅心9 梅花2 底池45 需跟30 我加注 對手 口袋七以上 AK，結果輸35」';
var allExOk = Object.keys(langTables).every(function (lang) {
  var ex = langTables[lang] ? langTables[lang][allExKey] : allExKey;
  var tb = Voice.parseTable(ex);
  var st = Voice.parseStreets(ex);
  var p = Voice.parse(st.cleaned, { villains: 1 });
  var m = vslots(p);
  var ok = tb.blinds === '5/10' && tb.stack === 100 && tb.players === 8 && tb.gtype === 'mtt' &&
    Voice.parsePosition(ex) === 'CO' &&
    m.hero0 === 'Ah' && m.hero1 === 'Ks' &&
    m.board0 === 'Ts' && m.board1 === '9h' && m.board2 === '2c' &&
    st.segs.flop && st.segs.flop.pot === 45 && st.segs.flop.call === 30 &&
    st.segs.flop.action === 'raise' && st.segs.flop.range === '77+ AKs AKo' &&
    Voice.parseResult(ex) === -35;
  if (!ok) console.log('  整手範例失敗 [' + lang + ']: ' + ex + ' → table=' + JSON.stringify(tb) +
    ' slots=' + JSON.stringify(m) + ' segs=' + JSON.stringify(st.segs) +
    ' pos=' + Voice.parsePosition(ex) + ' result=' + Voice.parseResult(ex));
  return ok;
});
assert(allExOk, 'voice: 12 語系「一句話錄整手」範例全數可解析');

// 攤牌範例：12 語系鎖
var showExKey = '語音範例：「BTN 方塊9 方塊8」';
var showExOk = Object.keys(langTables).every(function (lang) {
  var ex = langTables[lang] ? langTables[lang][showExKey] : showExKey;
  var sd = Voice.parseShowdown(ex);
  var ok = sd.length === 1 && sd[0].pos === 'BTN' &&
    Evaluator.cardToString(sd[0].cards[0]) === '9d' && Evaluator.cardToString(sd[0].cards[1]) === '8d';
  if (!ok) console.log('  攤牌範例失敗 [' + lang + ']: ' + ex + ' → ' + JSON.stringify(sd));
  return ok;
});
assert(showExOk, 'voice: 12 語系「攤牌」範例全數可解析');

// ---------- 9. 語音記帳 sanitize（LLM 輸出白名單驗證） ----------
console.log('--- VoiceTracker ---');
var VT = require('../js/voice-tracker.js');

var sr = VT.sanitize({
  date: '2026-08-29', type: 'cash', arena: 'live', venue: 'CTP',
  buyin: 5000, cashout: 8000, hours: 6, bb: 100, cur: 'TWD',
  mood: ['上頭', '疲勞']
});
assert(sr.date === '2026-08-29' && sr.type === 'cash' && sr.venue === 'CTP' &&
  sr.buyin === 5000 && sr.cashout === 8000 && sr.hours === 6 && sr.bb === 100 &&
  sr.cur === 'TWD' && sr.mood.length === 2,
  'vtrack: 完整合法紀錄全數保留');

sr = VT.sanitize({
  date: '昨天', type: 'plo', arena: 'casino', buyin: -5, cashout: 'abc',
  hours: 999, cur: 'BTC', mood: ['上頭', '上頭', '爽', 123], venue: '  '
});
assert(sr.date === undefined && sr.type === undefined && sr.arena === undefined &&
  sr.buyin === undefined && sr.cashout === undefined && sr.hours === undefined &&
  sr.cur === undefined && sr.venue === undefined &&
  sr.mood.length === 1 && sr.mood[0] === '上頭',
  'vtrack: 非法值全擋（mood 去重＋白名單）');

sr = VT.sanitize(null);
assert(Object.keys(sr).length === 0, 'vtrack: null → 空物件');

sr = VT.sanitize({ note: '  a'.repeat(300), tag: 'WSOP' });
assert(sr.note.length <= 200 && sr.tag === 'WSOP', 'vtrack: 字串裁長度');

// ---------- 10. AI 語音分析 cardsToEntries（LLM 牌字串 → VoiceCardsApply 形狀） ----------
console.log('--- VoiceAi ---');
var VA = require('../js/voice-ai.js');

var va = VA.cardsToEntries({ hero: ['As', 'Ks'], villain: ['Qd', 'Td'], board: ['Kh', 'Ts', '8c', '9h', '4d'] });
assert(va.entries.length === 9 && va.errors.length === 0 && va.maxVillain === 0 &&
  va.entries[0].slot === 'hero0' && Evaluator.cardToString(va.entries[0].card) === 'As' &&
  va.entries[8].slot === 'board4' && Evaluator.cardToString(va.entries[8].card) === '4d',
  'vai: hero+villain+board 全落位');

va = VA.cardsToEntries({ hero: ['As', 'XX', '??'], board: ['Kh', 'banana'] });
assert(va.entries.length === 2 && va.maxVillain === -1 &&
  va.entries[1].slot === 'board0',
  'vai: 無效牌字串略過、無對手 maxVillain=-1');

va = VA.cardsToEntries({ hero: ['As', 'As'] });
assert(va.errors.length === 1 && va.errors[0].code === 'dup', 'vai: 重複牌回報 dup');

va = VA.cardsToEntries({});
assert(va.entries.length === 0 && va.errors.length === 0, 'vai: 空輸入 → 空 entries');

assert(VA.fmtCard(Evaluator.cardFromString('As')) === 'A♠' &&
  VA.fmtCard(Evaluator.cardFromString('Th')) === '10♥' &&
  VA.fmtCard(Evaluator.cardFromString('2c')) === '2♣',
  'vai: fmtCard A♠ / 10♥ / 2♣');

var vsr = VA.vsRandom([Evaluator.cardFromString('As'), Evaluator.cardFromString('Ah')], [], 5000);
assert(vsr > 0.8 && vsr < 0.9, 'vai: AA vs 隨機手牌 翻前約 85%（MC 5000 手，got ' + vsr.toFixed(3) + '）');

// ---------- 11. 自架同步伺服器（server/sync-server.js 純函式，不需 better-sqlite3） ----------
console.log('--- sync-server ---');
var SyncSrv = require('../server/sync-server.js');

var ssTok = SyncSrv.mintSess('unit-secret', '12345678901234567890', 'a@b.c');
var ssP = SyncSrv.verifySess('unit-secret', ssTok);
assert(!!ssP && ssP.s === '12345678901234567890' && ssP.e === 'a@b.c' && ssP.x > Date.now(),
  'sync-server: 票鑄造/驗證 roundtrip');
assert(SyncSrv.verifySess('wrong-secret', ssTok) === null, 'sync-server: 錯密鑰驗不過');
var ssParts = ssTok.split('.');
var ssTampered = 'sess.' + SyncSrv.b64url(JSON.stringify({ s: '99999999999999999999', e: 'evil@x', x: Date.now() + 86400000 })) + '.' + ssParts[2];
assert(SyncSrv.verifySess('unit-secret', ssTampered) === null, 'sync-server: 竄改 payload 驗不過');
var ssExpired = (function () {
  var crypto = require('crypto');
  var payload = SyncSrv.b64url(JSON.stringify({ s: '12345678901234567890', e: 'a@b.c', x: Date.now() - 1000 }));
  var sig = SyncSrv.b64url(crypto.createHmac('sha256', 'unit-secret').update(payload).digest());
  return 'sess.' + payload + '.' + sig;
})();
assert(SyncSrv.verifySess('unit-secret', ssExpired) === null, 'sync-server: 過期票驗不過');

var ssRow = SyncSrv.validReplicaRow({ sub: '12345678901234567890', email: 'a@b.c', app: 'poker', level: 'main', blob: '{}', updated_at: 1788000000000.7 });
assert(!!ssRow && ssRow.updated_at === 1788000000000 && ssRow.app === 'poker', 'sync-server: 合法複寫列（updated_at 取整）');
assert(SyncSrv.validReplicaRow({ sub: 'abc', app: 'poker', level: 'main', blob: '{}', updated_at: 1 }) === null,
  'sync-server: sub 非數字拒收');
assert(SyncSrv.validReplicaRow({ sub: '12345678901234567890', app: 'po ker', level: 'main', blob: '{}', updated_at: 1 }) === null,
  'sync-server: app 帶空白拒收');
assert(SyncSrv.validReplicaRow({ sub: '12345678901234567890', app: 'poker', level: 'main', blob: {}, updated_at: 1 }) === null,
  'sync-server: blob 非字串拒收');
assert(SyncSrv.validReplicaRow({ sub: '12345678901234567890', app: 'poker', level: 'main', blob: '{}', updated_at: 0 }) === null,
  'sync-server: updated_at<=0 拒收');

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
