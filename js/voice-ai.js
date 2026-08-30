/* 首頁 AI 語音分析 —「🎤 AI 語音分析」：整段錄音直接給 LLM 聽，自動分流
 *
 * 與其他 🎤 的差別：不經 STT 文字，整段音檔 POST /aiapi/analyze（站方 serve.js
 * 轉 wav 後餵 Gemini 聽原音——中英夾雜的撲克術語 whisper 會聽歪，LLM 聽原音
 * 實測全對）。AI 判斷意圖後分流：
 * - equity：切到 EV 分頁，牌灌進 window.VoiceCardsApply（自動算勝率）
 * - session：開新增紀錄表單，欄位走 VoiceTracker.sanitize + apply 預填確認
 * - other：顯示轉錄與 AI 的簡短回覆
 *
 * cardsToEntries() 是純函式（吃 Evaluator），Node 可 require 測試。
 * /aiapi/health 通過才顯示按鈕——GitHub Pages／離線／App 內整組隱藏。
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Evaluator = isNode ? require('./evaluator.js') : global.Evaluator;

  /* AI 回的 {hero, villain, board}（牌字串陣列，如 ["As","Ks"]）
     → VoiceCardsApply 吃的 parsed 形狀。無效牌字串直接略過。 */
  function cardsToEntries(d) {
    var entries = [], errors = [];
    function push(list, slots) {
      (Array.isArray(list) ? list : []).slice(0, slots.length).forEach(function (s, i) {
        var card;
        try { card = Evaluator.cardFromString(String(s)); } catch (e) { return; }
        entries.push({ slot: slots[i], card: card });
      });
    }
    push(d.hero, ['hero0', 'hero1']);
    push(d.villain, ['v0a', 'v0b']);
    push(d.board, ['board0', 'board1', 'board2', 'board3', 'board4']);
    var seen = {};
    entries.forEach(function (e) {
      if (seen[e.card] !== undefined) errors.push({ code: 'dup', card: e.card });
      seen[e.card] = 1;
    });
    var maxV = -1;
    entries.forEach(function (e) { if (e.slot.charAt(0) === 'v') maxV = 0; });
    return { clear: false, entries: entries, errors: errors, maxVillain: maxV };
  }

  var VoiceAi = { cardsToEntries: cardsToEntries };
  if (isNode) { module.exports = VoiceAi; return; }
  global.VoiceAi = VoiceAi;

  /* ================= 瀏覽器 ================= */

  var AI_BASE = global.VOICE_AI_BASE || '/aiapi';
  var MAX_SEC = 90; // 「整段講完」比單句長，放寬到 90 秒

  function $(id) { return document.getElementById(id); }

  function handleResult(d, status) {
    var msg = t('聽到：') + (d.transcript || '');

    if (d.kind === 'equity') {
      var parsed = cardsToEntries(d);
      if (!parsed.entries.length) {
        status(msg + ' → ' + t('沒聽到可用的牌，再試一次'));
        return;
      }
      var tabBtn = document.querySelector('.tab-btn[data-tab="equity"]');
      if (tabBtn) tabBtn.click();
      var amt = {
        pot: (typeof d.pot === 'number') ? d.pot : undefined,
        call: (typeof d.call === 'number') ? d.call : undefined
      };
      var out = global.VoiceCardsApply
        ? global.VoiceCardsApply(parsed, amt)
        : { ok: false, msg: 'voice hook missing' };
      if (out.ok && out.n) {
        msg += ' → ' + t('已填入 ') + out.n + t(' 張牌');
        if (out.analyzed) msg += t('，分析見下方');
      } else if (out.msg) msg += ' → ' + out.msg;
      if (d.answer) msg += '（' + d.answer + '）';
      // 人已被切到 EV 分頁，訊息同步寫到那邊的語音狀態列才看得到
      var eqSt = $('voiceEquityStatus');
      if (eqSt) { eqSt.hidden = false; eqSt.textContent = msg; }
      status(msg);
      return;
    }

    if (d.kind === 'session' && d.session && global.VoiceTracker) {
      var rec = global.VoiceTracker.sanitize(d.session);
      var fab = $('fabAddSession');
      if (fab) fab.click(); // 開新增紀錄表單（confirm card）
      var n = global.VoiceTracker.apply ? global.VoiceTracker.apply(rec) : 0;
      if (!n) {
        status(msg + ' → ' + t('沒聽到可以填的內容，再試一次'));
        return;
      }
      var doneMsg = msg + ' → ' + t('已填入 ') + n + t(' 個欄位，請確認後儲存');
      var trkSt = $('voiceTrkStatus');
      if (trkSt) { trkSt.hidden = false; trkSt.textContent = doneMsg; } // 表單裡也看得到
      status(doneMsg);
      return;
    }

    status(msg + (d.answer ? ' → ' + d.answer : ' → ' + t('沒聽到可以填的內容，再試一次')));
  }
  VoiceAi.handleResult = handleResult; // console 除錯／測試直接餵結果（跳過錄音）

  function init() {
    var btn = $('btnVoiceAi'), row = $('voiceAiRow'), statusEl = $('voiceAiStatus');
    if (!btn || !row || !statusEl) return;
    var VC = global.VoiceCards;
    if (!VC || !VC.setupMic) return;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    fetch(AI_BASE + '/health', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var example = t('按一下錄音再按一下結束：講牌局問勝率自動填牌計算，講戰績自動帶入記帳');
        row.hidden = false;
        statusEl.hidden = false;
        statusEl.textContent = example;
        VC.setupMic(btn, statusEl, example, handleResult, {
          url: AI_BASE + '/analyze', blobBody: true, raw: true, maxSec: MAX_SEC
        });
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
