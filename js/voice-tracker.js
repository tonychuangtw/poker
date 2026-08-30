/* 語音記帳 —「🎤 用講的記一筆」：錄音 → STT → AI 萃取 → 預填新增紀錄表單
 *
 * 流程：MediaRecorder（重用 voice.js 的 setupMic）→ /sttapi 轉文字
 * → POST /aiapi/review（伺服器端 LLM 萃取，回結構化欄位）→ sanitize()
 * 白名單驗證 → 預填表單當「確認卡」，使用者校正後照常按「新增」走原本
 * 的儲存流程 —— 聽錯也不會直接污染帳本。
 *
 * sanitize(rec) 是純函式、無 DOM，Node 可 require 供測試：LLM 回來的
 * 東西一律不信任，enum 對白名單、數字驗非負、字串裁長度、mood 只收
 * app.js 既有的 8 個 canonical 標籤（行為分析卡直接沿用，不另開欄位）。
 *
 * /sttapi 與 /aiapi 的 health 都通過才顯示 🎤 —— GitHub Pages／離線／
 * App 內拿不到服務就整組隱藏，完全不影響原本的手動輸入。
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  /* ================= 白名單（與 index.html 表單、app.js MOODS 對齊） ================= */

  var TYPES = ['cash', 'timed', 'mtt', 'sng', 'home'];
  var ARENAS = ['live', 'online'];
  var CURS = ['TWD', 'KRW', 'USD', 'VND', 'JPY', 'PHP', 'EUR', 'GBP', 'CNY', 'HKD', 'THB', 'MYR', 'SGD'];
  var MOODS = ['狀態好', '疲勞', '上頭', '分心', 'Read 準', 'Read 失誤', '魚多', '桌硬'];

  function posNum(v) {
    var n = Number(v);
    return (isFinite(n) && n >= 0) ? n : undefined;
  }
  function cleanStr(v, max) {
    if (typeof v !== 'string') return undefined;
    v = v.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return v ? v.slice(0, max) : undefined;
  }

  /* sanitize(rec) → 只留驗證通過的欄位；全部沒過就回 {} */
  function sanitize(rec) {
    if (!rec || typeof rec !== 'object') return {};
    var out = {}, v;
    if (typeof rec.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.date)) out.date = rec.date;
    if (TYPES.indexOf(rec.type) >= 0) out.type = rec.type;
    if (ARENAS.indexOf(rec.arena) >= 0) out.arena = rec.arena;
    if ((v = cleanStr(rec.venue, 40)) !== undefined) out.venue = v;
    if ((v = cleanStr(rec.tag, 40)) !== undefined) out.tag = v;
    if ((v = cleanStr(rec.note, 200)) !== undefined) out.note = v;
    if ((v = posNum(rec.buyin)) !== undefined) out.buyin = v;
    if ((v = posNum(rec.cashout)) !== undefined) out.cashout = v;
    if ((v = posNum(rec.hours)) !== undefined && v <= 48) out.hours = v;
    if ((v = posNum(rec.bb)) !== undefined) out.bb = v;
    if (CURS.indexOf(rec.cur) >= 0) out.cur = rec.cur;
    if (Array.isArray(rec.mood)) {
      var m = [];
      rec.mood.forEach(function (x) {
        if (MOODS.indexOf(x) >= 0 && m.indexOf(x) < 0) m.push(x);
      });
      if (m.length) out.mood = m;
    }
    return out;
  }

  var VoiceTracker = { sanitize: sanitize };
  if (isNode) { module.exports = VoiceTracker; return; }
  global.VoiceTracker = VoiceTracker;

  /* ================= 瀏覽器：健檢 → 錄音 → 萃取 → 預填表單 ================= */

  var AI_BASE = global.VOICE_AI_BASE || '/aiapi';

  function $(id) { return document.getElementById(id); }

  function setInput(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hotwords() {
    var zh = (global.I18N_LANG || 'zh-TW').indexOf('zh') === 0;
    return zh
      ? '買入、兌現、現金局、限時桌、錦標賽、大盲、小時、盲注、線上、現場、標籤、備註、' + MOODS.join('、')
      : 'buy-in, cash out, cash game, tournament, sit and go, big blind, hours, online, live, tilt, tired, focused, soft table, tough table';
  }

  /* 把驗證過的欄位灌進新增表單；回傳填了幾個欄位 */
  function apply(rec) {
    var n = 0;
    ['date', 'type', 'arena', 'venue', 'tag', 'note', 'buyin', 'cashout', 'hours', 'bb', 'cur']
      .forEach(function (k) {
        if (rec[k] === undefined) return;
        var el = $('f' + k.charAt(0).toUpperCase() + k.slice(1));
        if (k === 'bb') el = $('fBB');
        if (!el) return;
        setInput(el, rec[k]);
        n++;
      });
    if (rec.mood) {
      var box = $('fMood');
      rec.mood.forEach(function (m) {
        var chip = box && box.querySelector('.mood-chip[data-mood="' + m + '"]');
        if (chip && !chip.classList.contains('active')) chip.classList.add('active');
      });
      n++;
    }
    return n;
  }

  function handleText(text, status) {
    status(t('聽到：') + text + ' → ' + t('AI 分析中…'));
    fetch(AI_BASE + '/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, lang: global.I18N_LANG || 'zh-TW' })
    })
      .then(function (resp) {
        return resp.json().then(function (d) { return { http: resp.status, d: d }; });
      })
      .then(function (res) {
        var d = res.d;
        if (!d || !d.ok) throw new Error((d && d.error) || ('HTTP ' + res.http));
        var rec = sanitize(d.rec);
        var n = apply(rec);
        if (!n) {
          status(t('聽到：') + text + ' → ' + t('沒聽到可以填的內容，再試一次'));
          return;
        }
        status(t('聽到：') + text + ' → ' + t('已填入 ') + n + t(' 個欄位，請確認後儲存'));
      })
      .catch(function (err) {
        status(t('聽到：') + text + ' → ' + t('AI 萃取失敗：') + (err && err.message ? err.message : err));
      });
  }
  VoiceTracker.handleText = handleText; // console 除錯／測試直接餵文字（跳過錄音）

  function health(url) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (d) { return !!(d && d.ok); })
      .catch(function () { return false; });
  }

  function init() {
    var btn = $('btnVoiceTrk'), row = $('voiceTrkRow'), statusEl = $('voiceTrkStatus');
    if (!btn || !row || !statusEl) return;
    var VC = global.VoiceCards;
    if (!VC || !VC.setupMic) return;
    Promise.all([health(VC.sttBase + '/health'), health(AI_BASE + '/health')])
      .then(function (oks) {
        if (!oks[0] || !oks[1]) return;
        var example = t('語音範例：「昨天在CTP打現金局，買入5000兌現8000，打了6小時，大盲100，有點上頭」');
        row.hidden = false;
        statusEl.hidden = false;
        statusEl.textContent = example;
        VC.setupMic(btn, statusEl, example, handleText, hotwords);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
