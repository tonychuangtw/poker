/* 產生 9-max Full Ring 的「面對開牌」與「被 3-bet」建議表（現場 live 取向）
 *
 *   node tools/gen-9max-ranges.js          # 印出可直接貼進 js/ranges.js 的資料
 *   node tools/gen-9max-ranges.js --report # 只印擬合品質與寬度檢查，不印資料
 *
 * 為什麼用產生器而不是手打：9-max 有 36 個 (開牌位置 × 防守位置) 組合，
 * 憑印象打 36 組 range 很容易寫出「看起來合理但其實彼此不一致」的表。
 * 這裡的作法是把「多寬」與「哪些牌」分開處理：
 *
 *   多寬 —— 從已經確認過的 15 個 6-max 情境量出 3-bet% 與跟注%，
 *            用少數參數擬合（殘差全部印出來），再外推到 9-max 的位置。
 *   哪些牌 —— 交給 ranges.js 既有的「對上開牌者 range 的 equity + 隱含賠率」排序引擎，
 *            用 thresholdAt 把目標寬度換成門檻，所以寬度是被鎖住的，
 *            調整隱含賠率權重只會改變組成、不會偷偷改變寬度。
 *
 * 一開始是反過來擬合「門檻」，結果是隱含賠率權重一調高，寬度就跟著飄，
 * BB 對 UTG 開牌會跑出 32s / J3s 這種東西。改成鎖寬度之後就沒這個問題。
 *
 * 現場（live full ring）調整 —— 這是 9-max 表跟 6-max 表最大的差別：
 *   1. 冷跟寬度放大：現場很少 squeeze、對手拿爛牌跟到底 → 隱含賠率高
 *   2. SB 反而縮小：多人底池比例高，SB 無位置又夾在中間，冷跟最吃虧
 *   3. 3-bet 縮小且偏價值：現場對手不夠棄牌，純 bluff 3-bet 沒有 fold equity
 *   4. 隱含賠率權重調高：多人底池讓同花連張／小對子更值錢、雜色邊緣牌更差
 */
'use strict';
global.t = global.t || function (s) { return s; }; /* i18n stub for Node */
var path = require('path');
var Ranges = require(path.join(__dirname, '../js/ranges.js'));
var PushFold = require(path.join(__dirname, '../js/pushfold.js'));

var REPORT_ONLY = process.argv.indexOf('--report') >= 0;
function log() { console.error.apply(console, arguments); }

/* ---------- 現場調整 ---------- */
var LIVE = {
  callCold: 1.15,   // 冷跟寬度 ×1.15
  callSb: 0.85,     // SB 冷跟 ×0.85
  callBb: 1.05,     // BB 防守 ×1.05
  tb: 0.85,         // 3-bet 寬度 ×0.85（偏價值）
  impliedW: 0.14,   // 隱含賠率權重（ranges.js 預設 0.10）→ 只影響組成
  v3bFourBet: 0.85, // 被 3-bet 的 4-bet 寬度 ×0.85
  v3bCall: 0.90     // 被 3-bet 的跟注寬度 ×0.90
};
var FLOOR = { tb: 1.2, call: 0.8 };   // 寬度下限（%），避免產出空的 range

/* 3-bet range 裡 bluff 的占比：純 equity 排序會產生「完全沒有 bluff」的線性 3-bet range，
 * 那不但不像真的策略，還會讓「被 3-bet」那張圖退化成「除了 AA/KK 全棄」。
 * 對很緊的早位開牌幾乎不 bluff，對寬的後位開牌才需要 —— 依開牌寬度線性內插。
 * 現場取向：這個比例明顯低於 GTO（對手不夠棄牌，bluff 3-bet 的 fold equity 差）。 */
function bluffRatio(W) { return Math.min(0.30, 0.10 + 0.004 * W); }

/* bluff 候選的優先序：阻斷牌價值 + 被跟注後好打，同時「當跟注牌很差」。
 * 同花輪子 A（A5s–A2s）最優先 —— 擋住對方 AA/AK，被跟注還能做順做同花，
 * 但拿來平跟又打不動，正好適合放在 3-bet。 */
function bluffScore(idx) {
  var r = Math.floor(idx / 13), c = idx % 13;
  if (r === c) return 0;                        // 對子該價值就價值，不當 bluff
  if (r > c) return 0;                          // 雜色牌被跟注後太難打
  var hi = 14 - r, lo = 14 - c, gap = hi - lo;
  if (hi === 14) return lo <= 5 ? 3.0 : lo <= 9 ? 1.6 : 0.8;   // 同花 A：輪子最佳
  if (gap === 1 && lo <= 9) return 2.4;         // 同花連張
  if (hi === 13) return lo <= 5 ? 2.0 : 1.0;    // 同花 K 也擋 AK / KK
  if (gap === 2 && lo <= 9) return 1.8;         // 同花一張間隔
  return 0.5;
}

var SEATS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
var SEATS9 = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
var KEY9 = { 'UTG': 'utg', 'UTG+1': 'utg1', 'MP': 'mp', 'LJ': 'lj', 'HJ': 'hj',
             'CO': 'co', 'BTN': 'btn', 'SB': 'sb', 'BB': 'bb' };
var BASE = Ranges.VS3B_BASE_BB;

/** p = 離 BTN 幾個座位（BTN=0、CO=1…），盲注不適用 */
function seatsFromBtn(seats, hero) { return seats.indexOf('BTN') - seats.indexOf(hero); }
function pct(combos) { return combos / 1326 * 100; }

/* ---------- 1. 量出 15 個 6-max 情境的寬度 ---------- */
var rows = [];
Ranges.DEF_SPOT_KEYS.forEach(function (k) {
  var s = Ranges.DEF_SPOTS[k];
  if (s.table === 9) return;
  rows.push({
    key: k, hero: s.hero, W: Ranges.openerOpenPct(k), p: seatsFromBtn(SEATS6, s.hero),
    tb: pct(PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.threeBet))),
    call: pct(PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.call)))
  });
});

/* ---------- 2. 最小平方擬合（正規方程 + 高斯消去） ---------- */
function lstsq(X, y) {
  var n = X[0].length, i, j, t;
  var A = [], B = [];
  for (i = 0; i < n; i++) {
    A.push(new Array(n).fill(0));
    B.push(0);
    for (t = 0; t < X.length; t++) {
      B[i] += X[t][i] * y[t];
      for (j = 0; j < n; j++) A[i][j] += X[t][i] * X[t][j];
    }
  }
  for (i = 0; i < n; i++) {
    var piv = A[i][i];
    for (j = i; j < n; j++) A[i][j] /= piv;
    B[i] /= piv;
    for (var r = 0; r < n; r++) {
      if (r === i) continue;
      var f = A[r][i];
      for (j = i; j < n; j++) A[r][j] -= f * A[i][j];
      B[r] -= f * B[i];
    }
  }
  return B;
}
function fitGroup(list, cols, field) {
  var X = list.map(cols), y = list.map(function (r) { return r[field]; });
  var b = lstsq(X, y), worst = 0;
  list.forEach(function (r, t) {
    var pred = X[t].reduce(function (s, x, j) { return s + x * b[j]; }, 0);
    worst = Math.max(worst, Math.abs(pred - r[field]));
  });
  return { b: b, worst: worst, predict: function (x) {
    return x.reduce(function (s, v, j) { return s + v * b[j]; }, 0);
  } };
}

var coldRows = rows.filter(function (r) { return r.hero !== 'SB' && r.hero !== 'BB'; });
var sbRows = rows.filter(function (r) { return r.hero === 'SB'; });
var bbRows = rows.filter(function (r) { return r.hero === 'BB'; });
var COLD_X = function (r) { return [1, r.p, r.W]; };
var BLIND_X = function (r) { return [1, r.W]; };
var FIT = {
  coldTb: fitGroup(coldRows, COLD_X, 'tb'), coldCall: fitGroup(coldRows, COLD_X, 'call'),
  sbTb: fitGroup(sbRows, BLIND_X, 'tb'), sbCall: fitGroup(sbRows, BLIND_X, 'call'),
  bbTb: fitGroup(bbRows, BLIND_X, 'tb'), bbCall: fitGroup(bbRows, BLIND_X, 'call')
};

log('=== 寬度擬合（樣本 = 15 個 6-max 情境，單位 = combo 占比 %）===');
Object.keys(FIT).forEach(function (k) {
  log('  %s：係數 [%s]，最大殘差 %s 個百分點', k.padEnd(8),
    FIT[k].b.map(function (x) { return x.toFixed(2); }).join(', '), FIT[k].worst.toFixed(1));
});

/** 某個 9-max 情境的目標寬度（%），已套現場調整與下限 */
function widthsFor(hero, W) {
  var tb, call;
  if (hero === 'SB') {
    tb = FIT.sbTb.predict([1, W]) * LIVE.tb;
    call = FIT.sbCall.predict([1, W]) * LIVE.callSb;
  } else if (hero === 'BB') {
    tb = FIT.bbTb.predict([1, W]) * LIVE.tb;
    call = FIT.bbCall.predict([1, W]) * LIVE.callBb;
  } else {
    var p = seatsFromBtn(SEATS9, hero);
    tb = FIT.coldTb.predict([1, p, W]) * LIVE.tb;
    call = FIT.coldCall.predict([1, p, W]) * LIVE.callCold;
  }
  return { tb: Math.max(FLOOR.tb, tb), call: Math.max(FLOOR.call, call) };
}

/* ---------- 家族單調化 ----------
 * 「對子」「同高牌的同花」「同高牌的雜色」各自是一個家族，家族內由強到弱排。
 * 直接拿 equity + 隱含賠率去切門檻會切出破洞 —— 例如 99 的隱含賠率加成比 TT 高
 * （impliedIndex 在 99 以下跳一階），排序就會翻過來，產出「JJ+ 3-bet、TT 棄、99 跟注」。
 * 這裡把每個家族的分數由強到弱取累進最小值，任何門檻切下去都保證是「前綴」，
 * 不會出現中間破一格的表。刻意當 bluff 的手牌是後面另外加的，不受這裡限制。 */
function familyIndices() {
  var fams = [], h, k, fam;
  fam = [];
  for (h = 0; h < 13; h++) fam.push(h * 13 + h);
  fams.push(fam);
  for (h = 0; h < 12; h++) {
    fam = [];
    for (k = h + 1; k < 13; k++) fam.push(h * 13 + k);      // 同花，kicker 由大到小
    fams.push(fam);
    fam = [];
    for (k = h + 1; k < 13; k++) fam.push(k * 13 + h);      // 雜色
    fams.push(fam);
  }
  return fams;
}
var FAMILIES = familyIndices();

function monotone(score) {
  var out = score.slice();
  FAMILIES.forEach(function (fam) {
    for (var i = 1; i < fam.length; i++) {
      if (out[fam[i]] > out[fam[i - 1]]) out[fam[i]] = out[fam[i - 1]];
    }
  });
  return out;
}

/* ---------- 3. 由目標寬度挑牌 ----------
 * 分數 = 對上開牌者 range 的 equity + 隱含賠率加成（權重用現場值）。
 * 先用 thresholdAt 把「總防守寬度」換成門檻取出防守集合，
 * 再把其中最強的部分當 3-bet 價值、剩下當跟注，
 * 最後從外面挑阻斷牌／同花連張補滿 3-bet 的 bluff 額度。 */
function buildDefence(villainClasses, W, want) {
  var rawEq = Ranges.equityMapVs(villainClasses);
  var raw = new Array(169), i;
  for (i = 0; i < 169; i++) raw[i] = rawEq[i] + LIVE.impliedW * Ranges.impliedIndex(i);
  var score = monotone(raw);      // 選防守集合：含隱含賠率
  var eq = monotone(rawEq);       // 切價值 / 跟注：只看純 equity

  var ratio = bluffRatio(W);
  var valueCombos = want.tb * (1 - ratio) / 100 * 1326;
  var totalCombos = (want.tb * (1 - ratio) + want.call) / 100 * 1326;

  var thr = Ranges.thresholdAt(score, totalCombos);
  var defended = [];
  for (i = 0; i < 169; i++) if (score[i] >= thr) defended.push(i);

  // 防守集合裡最強的當價值 3-bet，其餘落回跟注
  var byEq = defended.slice().sort(function (a, b) { return eq[b] - eq[a]; });
  var tbCls = [], callCls = [], acc = 0;
  byEq.forEach(function (ci) {
    if (acc < valueCombos) { tbCls.push(ci); acc += PushFold.comboCount(ci); }
    else callCls.push(ci);
  });

  // bluff：從「不在價值 3-bet 裡」的手牌挑，被挑中而原本要跟注的改成 3-bet
  var inValue = {};
  tbCls.forEach(function (ci) { inValue[ci] = true; });
  var cand = [];
  for (i = 0; i < 169; i++) if (!inValue[i] && bluffScore(i) > 0) cand.push(i);
  cand.sort(function (a, b) { return bluffScore(b) - bluffScore(a) || eq[b] - eq[a]; });
  var need = want.tb / 100 * 1326 - acc;
  var asBluff = {};
  cand.forEach(function (ci) {
    if (need <= 0) return;
    asBluff[ci] = true;
    tbCls.push(ci);
    need -= PushFold.comboCount(ci);
  });
  callCls = callCls.filter(function (ci) { return !asBluff[ci]; });

  var num = function (a, b) { return a - b; };
  return { tb: tbCls.sort(num), call: callCls.sort(num) };
}

/* ---------- 4. 產生 36 個防守情境 ---------- */
var OPENERS = SEATS9.slice(0, 8);      // UTG…SB 都可能開牌，BB 不開牌
var defSpots = [], defKeys = [];
OPENERS.forEach(function (opener) {
  var oi = SEATS9.indexOf(opener);
  var openBb = opener === 'SB' ? 3 : 2.5;
  var notation = Ranges.RFI_RANGES_9[KEY9[opener]].notation;
  var W = pct(PushFold.rangeComboTotal(PushFold.rangeFromNotation(notation)));
  var villain = PushFold.topPercentRange(W);

  SEATS9.slice(oi + 1).forEach(function (hero) {
    var key = KEY9[hero] + '_vs_' + KEY9[opener] + '9';
    var behind = SEATS9.length - 1 - SEATS9.indexOf(hero);
    var res = buildDefence(villain, W, widthsFor(hero, W));
    defSpots.push({
      key: key, hero: hero, opener: opener, openBb: openBb, W: W,
      name: hero + ' vs ' + opener + ' 開牌（9-max）',
      sizeTxt: '現場取向，' + opener + ' 開 ' + openBb + 'bb（' +
        (hero === 'BB' ? 'BB 收尾行動、價格最好'
          : hero === 'SB' ? 'SB 無位置且 BB 還在後面，冷跟最吃虧'
            : '你後面還有 ' + behind + ' 家會行動') + '）',
      threeBet: PushFold.notationFromClasses(res.tb),
      call: PushFold.notationFromClasses(res.call),
      tbPct: pct(PushFold.rangeComboTotal(res.tb)),
      callPct: pct(PushFold.rangeComboTotal(res.call))
    });
    defKeys.push(key);
    // 後面產生「被 3-bet」時要靠這些項目查 3-bet range
    Ranges.DEF_SPOTS[key] = defSpots[defSpots.length - 1];
    Ranges.DEF_SPOTS[key].table = 9;
  });
});

/* ---------- 5. 被 3-bet ----------
 * 續玩寬度用「相對於對手 3-bet 寬度的比例」來訂 —— 面對越寬的 3-bet 就續玩越多。
 * 比例同樣是從 6 個現成的 6-max 情境量出來的平均值。 */
var v3bRatio = (function () {
  var fb = 0, ca = 0;
  Ranges.VS3B_SPOT_KEYS.forEach(function (k) {
    var s = Ranges.VS3B_SPOTS[k];
    var vr = pct(PushFold.rangeComboTotal(Ranges.vs3bVillainRange(k)));
    fb += pct(PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.fourBet))) / vr;
    ca += pct(PushFold.rangeComboTotal(PushFold.rangeFromNotation(s.call))) / vr;
  });
  var n = Ranges.VS3B_SPOT_KEYS.length;
  return { fourBet: fb / n * LIVE.v3bFourBet, call: ca / n * LIVE.v3bCall };
})();
log('=== 被 3-bet 的續玩比例（6 個 6-max 情境的平均 × 現場調整）===');
log('  4-bet = %s × 對手 3-bet 寬度｜跟注 = %s ×',
  v3bRatio.fourBet.toFixed(3), v3bRatio.call.toFixed(3));

/* 3-bet 大小：有位置的冷 3-bet 約 3.2 倍，盲注 OOP 要更大。死錢 = 桌上其他人的盲注。 */
function tbSize(villain, openBb) {
  var mult = villain === 'BB' ? 4.8 : villain === 'SB' ? 4.4 : 3.2;
  return Math.round(openBb * mult * 2) / 2;
}
function deadFor(villain) { return villain === 'BB' ? 0.5 : villain === 'SB' ? 1 : 1.5; }

var V3B_VILLAINS = ['BTN', 'SB', 'BB'];   // 3-bet 實務上主要來自後位與盲注
var v3bSpots = [], v3bKeys = [];
['MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'].forEach(function (hero) {
  var hi = SEATS9.indexOf(hero);
  var openBb = hero === 'SB' ? 3 : 2.5;
  V3B_VILLAINS.forEach(function (villain) {
    if (SEATS9.indexOf(villain) <= hi) return;
    var villainSpot = KEY9[villain] + '_vs_' + KEY9[hero] + '9';
    if (!Ranges.DEF_SPOTS[villainSpot]) return;
    var key = KEY9[hero] + '_vs_' + KEY9[villain] + '3b9';
    var villainRange = PushFold.rangeFromNotation(Ranges.DEF_SPOTS[villainSpot].threeBet);
    var vw = pct(PushFold.rangeComboTotal(villainRange));
    var res = buildDefence(villainRange, vw, {
      tb: Math.max(FLOOR.tb, vw * v3bRatio.fourBet),
      call: Math.max(FLOOR.call, vw * v3bRatio.call)
    });
    v3bSpots.push({
      key: key, hero: hero, villain: villain, villainSpot: villainSpot,
      name: hero + ' 開牌 vs ' + villain + ' 3-bet（9-max）',
      openBb: openBb, tbBb: tbSize(villain, openBb), deadBb: deadFor(villain),
      note: '9-max 現場：' + villain + ' 在這裡的 3-bet 只有 ' + vw.toFixed(1) +
        '%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多',
      fourBet: PushFold.notationFromClasses(res.tb),
      call: PushFold.notationFromClasses(res.call),
      villainPct: vw,
      fbPct: pct(PushFold.rangeComboTotal(res.tb)),
      callPct: pct(PushFold.rangeComboTotal(res.call))
    });
    v3bKeys.push(key);
  });
});

/* ---------- 6. 寬度檢查 ---------- */
log('\n=== 9-max 防守寬度 ===');
log('  %s %s %s %s %s %s', 'opener'.padEnd(6), 'hero'.padEnd(6), '開牌%'.padStart(7),
  '3bet%'.padStart(7), '跟注%'.padStart(7), '總防守%'.padStart(8));
defSpots.forEach(function (s) {
  log('  %s %s %s %s %s %s', s.opener.padEnd(6), s.hero.padEnd(6),
    s.W.toFixed(1).padStart(7), s.tbPct.toFixed(1).padStart(7),
    s.callPct.toFixed(1).padStart(7), (s.tbPct + s.callPct).toFixed(1).padStart(8));
});
log('\n=== 9-max 被 3-bet 寬度 ===');
v3bSpots.forEach(function (s) {
  log('  %s 開 vs %s 3-bet 到 %sbb（對手 %s%%）：4-bet %s%%、跟注 %s%%',
    s.hero.padEnd(4), s.villain.padEnd(4), String(s.tbBb).padStart(4),
    s.villainPct.toFixed(1).padStart(5), s.fbPct.toFixed(1), s.callPct.toFixed(1));
});

if (REPORT_ONLY) process.exit(0);

/* ---------- 7. 輸出可貼進 ranges.js 的原始碼 ---------- */
function q(s) { return "'" + s + "'"; }
function wrap(str, indent) {
  var words = str.split(' '), lines = [], cur = '';
  words.forEach(function (w) {
    if (cur && (cur + ' ' + w).length > 70) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  });
  if (cur) lines.push(cur);
  return lines.map(function (l, i) {
    return (i ? indent : '') + q(l + (i < lines.length - 1 ? ' ' : ''));
  }).join(' +\n');
}

var out = [];
out.push('  /* ===== 9-max Full Ring：面對開牌（現場取向） =====');
out.push('   * 由 tools/gen-9max-ranges.js 產生，請改產生器後重跑，不要手改這一段。');
out.push('   * 寬度擬合自 15 個 6-max 情境並套現場調整（冷跟 ×' + LIVE.callCold +
  '、SB ×' + LIVE.callSb + '、BB ×' + LIVE.callBb + '、3-bet ×' + LIVE.tb + '），');
out.push('   * 選牌用 equity + 隱含賠率排序（權重 ' + LIVE.impliedW +
  '），3-bet 內含依開牌寬度遞增的 bluff 比例。 */');
defSpots.forEach(function (s) {
  out.push('  ' + s.key + ': {');
  out.push('    name: ' + q(s.name) + ', table: 9,');
  out.push('    hero: ' + q(s.hero) + ', opener: ' + q(s.opener) +
    (s.openBb !== 2.5 ? ', openBb: ' + s.openBb : '') + ',');
  out.push('    sizeTxt: ' + q(s.sizeTxt) + ',');
  out.push('    threeBet: ' + wrap(s.threeBet, '      ') + ',');
  out.push('    call: ' + wrap(s.call, '      '));
  out.push('  },');
});
out.push('');
out.push('  /* ===== 9-max Full Ring：被 3-bet（同一支產生器） ===== */');
v3bSpots.forEach(function (s) {
  out.push('  ' + s.key + ': {');
  out.push('    name: ' + q(s.name) + ', table: 9,');
  out.push('    hero: ' + q(s.hero) + ', villain: ' + q(s.villain) +
    ', villainSpot: ' + q(s.villainSpot) + ',');
  out.push('    openBb: ' + s.openBb + ', tbBb: ' + s.tbBb + ', deadBb: ' + s.deadBb + ',');
  out.push('    note: ' + q(s.note) + ',');
  out.push('    fourBet: ' + wrap(s.fourBet, '      ') + ',');
  out.push('    call: ' + wrap(s.call, '      '));
  out.push('  },');
});
out.push('');
out.push('  DEF_KEYS_9 = ' + JSON.stringify(defKeys) + ';');
out.push('  VS3B_KEYS_9 = ' + JSON.stringify(v3bKeys) + ';');
console.log(out.join('\n'));
