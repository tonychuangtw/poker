/* 訓練系統：滾動 30 題熟練度、錯題本、每日任務 + 連續天數、週報
 *
 * 純函式（rollPush / isMastered / accuracy / addMistake / updateStreak /
 * dateAdd / pruneActivity / lastNDays）雙輸出：Node（測試）與 window.TRAINING。
 * UI 部分只在瀏覽器環境執行。
 *
 * localStorage：
 *   poker.roll      {pf:[0/1...], rfi:[], def:[]}    每種最近 30 題結果
 *   poker.mistakes  [{kind,key,ts,idx,best,info}]    錯題本（kind+key 去重、上限 100）
 *   poker.activity  {"YYYY-MM-DD":{pf,rfi,def,drill,c}}  每日答題數（保留 60 天）
 *   poker.streak    {current,best,lastDone}
 */
(function (global) {
  'use strict';

  var ROLL_SIZE = 30;
  var MASTERY_ACC = 0.9;
  var MISTAKE_CAP = 100;
  var ACTIVITY_DAYS = 60;

  /* ================= 純函式 ================= */

  // 推入一筆 0/1，只保留最後 size 筆（回傳新陣列，不改原陣列）
  function rollPush(arr, val, size) {
    size = size || ROLL_SIZE;
    var out = (arr || []).concat([val ? 1 : 0]);
    if (out.length > size) out = out.slice(out.length - size);
    return out;
  }

  function accuracy(arr) {
    if (!arr || !arr.length) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i] ? 1 : 0;
    return sum / arr.length;
  }

  // 熟練：滿 30 題且正確率 >= 90%
  function isMastered(arr) {
    return !!arr && arr.length >= ROLL_SIZE && accuracy(arr) >= MASTERY_ACC;
  }

  // ISO 日期字串加減天數（UTC 計算，避免時區位移）
  function dateAdd(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // 本地今天（每日任務以裝置當地日期計）
  function todayStr() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // 含 today 在內、往前共 n 天的日期陣列（舊 -> 新）
  function lastNDays(today, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(dateAdd(today, -i));
    return out;
  }

  // 移除超過 capDays 天的活動紀錄（回傳新物件）
  function pruneActivity(activity, today, capDays) {
    capDays = capDays || ACTIVITY_DAYS;
    var cutoff = dateAdd(today, -(capDays - 1));
    var out = {};
    for (var k in activity) {
      if (Object.prototype.hasOwnProperty.call(activity, k) && k >= cutoff && k <= today) {
        out[k] = activity[k];
      }
    }
    return out;
  }

  // 加入錯題：kind+key 去重（舊的移除、新的排最後），上限 cap 筆（丟最舊）
  function addMistake(list, m, cap) {
    cap = cap || MISTAKE_CAP;
    var out = (list || []).filter(function (x) {
      return !(x.kind === m.kind && x.key === m.key);
    });
    out.push(m);
    while (out.length > cap) out.shift();
    return out;
  }

  // 全部任務完成時呼叫：昨天也完成 -> +1，否則重設為 1；同日重複呼叫不變
  function updateStreak(streak, today) {
    var s = streak || { current: 0, best: 0, lastDone: '' };
    if (s.lastDone === today) return s;
    var cur = (s.lastDone === dateAdd(today, -1)) ? (s.current || 0) + 1 : 1;
    return { current: cur, best: Math.max(s.best || 0, cur), lastDone: today };
  }

  var TRAINING = {
    ROLL_SIZE: ROLL_SIZE,
    MASTERY_ACC: MASTERY_ACC,
    MISTAKE_CAP: MISTAKE_CAP,
    ACTIVITY_DAYS: ACTIVITY_DAYS,
    rollPush: rollPush,
    accuracy: accuracy,
    isMastered: isMastered,
    dateAdd: dateAdd,
    todayStr: todayStr,
    lastNDays: lastNDays,
    pruneActivity: pruneActivity,
    addMistake: addMistake,
    updateStreak: updateStreak
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRAINING;
  if (typeof global.window !== 'undefined') global.TRAINING = TRAINING;

  /* ================= 瀏覽器端：儲存 + UI ================= */
  if (typeof document === 'undefined') return;

  var $ = function (sel) { return document.querySelector(sel); };

  var KEYS = {
    roll: 'poker.roll',
    mistakes: 'poker.mistakes',
    activity: 'poker.activity',
    streak: 'poker.streak'
  };
  var KIND_NAMES = { pf: 'Push/Fold', rfi: '開牌 RFI', def: '面對開牌' };
  var KINDS = ['pf', 'rfi', 'def'];

  function load(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function save(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

  function loadRoll() {
    var r = load(KEYS.roll, {});
    KINDS.forEach(function (k) { if (!Array.isArray(r[k])) r[k] = []; });
    return r;
  }
  function loadMistakes() {
    var m = load(KEYS.mistakes, []);
    return Array.isArray(m) ? m : [];
  }
  function loadActivity() { return load(KEYS.activity, {}) || {}; }
  function loadStreak() {
    var s = load(KEYS.streak, null);
    return (s && typeof s.current === 'number')
      ? s : { current: 0, best: 0, lastDone: '' };
  }

  function dayRec(activity, date) {
    if (!activity[date]) activity[date] = { pf: 0, rfi: 0, def: 0, drill: 0, c: 0 };
    var rec = activity[date];
    ['pf', 'rfi', 'def', 'drill', 'c'].forEach(function (f) {
      if (typeof rec[f] !== 'number') rec[f] = 0;
    });
    return rec;
  }

  // field: 'pf'|'rfi'|'def'|'drill'
  function bumpActivity(field, ok) {
    var today = todayStr();
    var act = pruneActivity(loadActivity(), today, ACTIVITY_DAYS);
    var rec = dayRec(act, today);
    rec[field]++;
    if (ok) rec.c++;
    save(KEYS.activity, act);
    return act;
  }

  /* ---------- 每日任務判定 ---------- */
  function taskState() {
    var today = todayStr();
    var act = loadActivity();
    var rec = dayRec(act, today);
    var mistakes = loadMistakes();
    var t1 = mistakes.length === 0 || rec.drill >= 20;       // 清錯題
    var t2 = rec.pf >= 10 && rec.rfi >= 10 && rec.def >= 10; // 每種各 10 題
    return { today: today, rec: rec, mistakes: mistakes, t1: t1, t2: t2, allDone: t1 && t2 };
  }

  function checkStreak() {
    var st = taskState();
    if (!st.allDone) return;
    var s = loadStreak();
    var ns = updateStreak(s, st.today);
    if (ns !== s) save(KEYS.streak, ns);
  }

  /* ---------- 答題記錄（由 app.js 測驗呼叫） ---------- */
  // kind: 'pf'|'rfi'|'def'；payload: {idx, best, info}（錯題重練用）
  TRAINING.record = function (kind, isCorrect, questionKey, payload) {
    if (KINDS.indexOf(kind) === -1) return;
    var roll = loadRoll();
    roll[kind] = rollPush(roll[kind], isCorrect ? 1 : 0, ROLL_SIZE);
    save(KEYS.roll, roll);
    bumpActivity(kind, isCorrect);
    if (!isCorrect && questionKey) {
      var m = { kind: kind, key: String(questionKey), ts: Date.now() };
      if (payload) {
        if (typeof payload.idx === 'number') m.idx = payload.idx;
        if (payload.best) m.best = payload.best;
        if (payload.info) m.info = String(payload.info);
      }
      save(KEYS.mistakes, addMistake(loadMistakes(), m, MISTAKE_CAP));
    }
    checkStreak();
    renderAll();
  };

  /* ---------- 渲染：每日任務 ---------- */
  function renderTasks() {
    var st = taskState();
    var mk = function (done, txt) {
      return '<div class="train-task">' + (done ? '✅' : '⬜') + ' ' + txt + '</div>';
    };
    var drillTxt = st.mistakes.length === 0
      ? '錯題本已清空'
      : '今日已重練 ' + Math.min(st.rec.drill, 20) + ' / 20 題（錯題本剩 ' + st.mistakes.length + ' 題）';
    $('#trainTasks').innerHTML =
      mk(st.t1, '清錯題 — ' + drillTxt) +
      mk(st.t2, '每種測驗各答 10 題 — Push/Fold ' + Math.min(st.rec.pf, 10) +
        '/10、RFI ' + Math.min(st.rec.rfi, 10) + '/10、面對開牌 ' + Math.min(st.rec.def, 10) + '/10');
    var s = loadStreak();
    $('#trainStreak').textContent = '🔥 連續完成 ' + (s.current || 0) + ' 天（最佳 ' +
      (s.best || 0) + ' 天）' + (st.allDone ? '，今日任務全數完成！' : '');
  }

  /* ---------- 渲染：熟練度 ---------- */
  function renderMastery() {
    var roll = loadRoll();
    var html = '';
    KINDS.forEach(function (k) {
      var arr = roll[k];
      var acc = accuracy(arr);
      var mastered = isMastered(arr);
      var pct = Math.round(acc * 100);
      html += '<div class="bar-row">' +
        '<span class="bar-label">' + KIND_NAMES[k] + '</span>' +
        '<div class="bar-track"><div class="bar-fill ' +
        (mastered ? 'bar-pos' : 'bar-acc') + '" style="width:' +
        (arr.length ? pct : 0) + '%"></div></div>' +
        '<span class="bar-value">' + arr.length + '/' + ROLL_SIZE +
        (arr.length ? '｜' + pct + '%' : '') + (mastered ? ' 🏆' : '') + '</span>' +
        '</div>';
    });
    $('#masteryBars').innerHTML = html;
  }

  /* ---------- 錯題重練 ---------- */
  var drillQueue = [];
  var drillCur = null;
  var drillDone = 0, drillFixed = 0;

  function mistakeById(m) {
    return loadMistakes().findIndex(function (x) {
      return x.kind === m.kind && x.key === m.key;
    });
  }
  function removeMistake(m) {
    var list = loadMistakes();
    var i = mistakeById(m);
    if (i >= 0) { list.splice(i, 1); save(KEYS.mistakes, list); }
  }

  function renderMistakeCount() {
    var n = loadMistakes().length;
    $('#mistakeCountTxt').textContent = n
      ? '錯題本共 ' + n + ' 題。答對即從錯題本移除，答錯保留。'
      : '錯題本是空的，太強了！去「圖表」分頁做測驗累積題目。';
    $('#btnDrillStart').disabled = n === 0;
    $('#btnDrillStart').textContent = n ? '錯題重練（' + n + ' 題）' : '錯題重練';
  }

  function aggroLabel(kind) {
    return kind === 'pf' ? '全下' : kind === 'rfi' ? '加注' : '3-bet';
  }
  function actionTxt(kind, act) {
    return act === 'aggro' ? aggroLabel(kind) : act === 'call' ? '跟注' : '蓋牌';
  }

  function drillShow() {
    if (!drillQueue.length) { drillFinish(); return; }
    drillCur = drillQueue[0];
    var label = (typeof drillCur.idx === 'number' && global.PushFold)
      ? global.PushFold.classLabel(drillCur.idx) : drillCur.key;
    $('#drillHand').textContent = label;
    $('#drillInfo').textContent = (drillCur.info || '') +
    '（' + KIND_NAMES[drillCur.kind] + '）';
    $('#btnDrillAggro').textContent = aggroLabel(drillCur.kind);
    $('#btnDrillCall').hidden = drillCur.kind !== 'def';
    $('#drillFeedback').hidden = true;
    $('#btnDrillNext').hidden = true;
    $('#btnDrillAggro').disabled = false;
    $('#btnDrillCall').disabled = false;
    $('#btnDrillFold').disabled = false;
  }

  function drillAnswer(action) {
    if (!drillCur) return;
    var ok = action === (drillCur.best || 'fold');
    drillDone++;
    if (ok) { drillFixed++; removeMistake(drillCur); }
    drillQueue.shift();
    bumpActivity('drill', ok);
    checkStreak();
    var fb = $('#drillFeedback');
    fb.hidden = false;
    fb.innerHTML = (ok
      ? '<span class="pos">✔ 正確！已從錯題本移除。</span>'
      : '<span class="neg">✘ 錯誤，保留在錯題本。</span>') +
      ' 正解：<b>' + actionTxt(drillCur.kind, drillCur.best || 'fold') + '</b>。';
    $('#btnDrillNext').hidden = false;
    $('#btnDrillNext').textContent = drillQueue.length ? '下一題' : '看結果';
    $('#btnDrillAggro').disabled = true;
    $('#btnDrillCall').disabled = true;
    $('#btnDrillFold').disabled = true;
    drillCur = null;
    renderTasks();
    renderMistakeCount();
    renderWeek();
  }

  function drillFinish() {
    var fb = $('#drillFeedback');
    fb.hidden = false;
    fb.innerHTML = '<span class="pos">完成！</span>本輪重練 ' + drillDone + ' 題，修正 ' +
      drillFixed + ' 題，錯題本剩 ' + loadMistakes().length + ' 題。';
    $('#btnDrillAggro').disabled = true;
    $('#btnDrillCall').disabled = true;
    $('#btnDrillFold').disabled = true;
    $('#btnDrillNext').hidden = true;
    $('#drillHand').textContent = '🎉';
    $('#drillInfo').textContent = '';
  }

  function drillQuit() {
    $('#drillRun').hidden = true;
    $('#btnDrillStart').hidden = false;
    drillQueue = [];
    drillCur = null;
    renderAll();
  }

  /* ---------- 渲染：週報 ---------- */
  function dayTotal(rec) {
    if (!rec) return 0;
    return (rec.pf || 0) + (rec.rfi || 0) + (rec.def || 0) + (rec.drill || 0);
  }

  function renderWeek() {
    var today = todayStr();
    var days = lastNDays(today, 7);
    var act = loadActivity();
    var totals = days.map(function (d) { return dayTotal(act[d]); });
    var max = Math.max.apply(null, totals.concat([1]));
    var html = '';
    days.forEach(function (d, i) {
      html += '<div class="bar-row">' +
        '<span class="bar-label">' + d.slice(5) + (d === today ? '＊' : '') + '</span>' +
        '<div class="bar-track"><div class="bar-fill bar-acc" style="width:' +
        Math.round(totals[i] / max * 100) + '%"></div></div>' +
        '<span class="bar-value">' + totals[i] + ' 題</span>' +
        '</div>';
    });
    $('#weekChart').innerHTML = html;
    var sum = 0, correct = 0;
    days.forEach(function (d) {
      sum += dayTotal(act[d]);
      correct += (act[d] && act[d].c) || 0;
    });
    $('#weekTotals').textContent = sum
      ? '本週共答 ' + sum + ' 題，正確率 ' + Math.round(correct / sum * 100) + '%。'
      : '本週還沒答題，去「圖表」分頁開始測驗吧。';
  }

  function renderAll() {
    renderTasks();
    renderMastery();
    renderMistakeCount();
    renderWeek();
  }
  TRAINING.renderAll = renderAll;

  /* ---------- 事件 ---------- */
  function init() {
    $('#btnDrillStart').addEventListener('click', function () {
      drillQueue = loadMistakes().slice();
      if (!drillQueue.length) return;
      drillDone = 0; drillFixed = 0;
      $('#btnDrillStart').hidden = true;
      $('#drillRun').hidden = false;
      drillShow();
    });
    $('#btnDrillAggro').addEventListener('click', function () { drillAnswer('aggro'); });
    $('#btnDrillCall').addEventListener('click', function () { drillAnswer('call'); });
    $('#btnDrillFold').addEventListener('click', function () { drillAnswer('fold'); });
    $('#btnDrillNext').addEventListener('click', drillShow);
    $('#btnDrillQuit').addEventListener('click', drillQuit);
    // 切到訓練分頁時重新整理（跨日、他分頁作答後）
    var nav = $('#tabNav');
    if (nav) nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (btn && btn.dataset.tab === 'train') renderAll();
    });
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
