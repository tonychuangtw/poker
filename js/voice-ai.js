/* 首頁 AI 語音分析 —「🎤 AI 語音分析」：整段錄音直接給 LLM 聽，講完直接給結果
 *
 * 與其他 🎤 的差別：不經 STT 文字，整段音檔 POST /aiapi/analyze（站方 serve.js
 * 轉 wav 後餵 Gemini 聽原音——中英夾雜的撲克術語 whisper 會聽歪，LLM 聽原音
 * 實測全對）。AI 判斷意圖後直接出結果（2026-08-30 Kurt：「唸完全部直接記好帳
 * ／直接和你說答案」）：
 * - equity：首頁答案卡直接秀大字勝率＋牌面摘要（引擎在本機 js/equity.js 算，
 *   對手沒講就對上隨機手牌）；牌同時靜靜填進 EV 分頁，「查看詳情」才跳過去
 * - session：直接入帳（app.js window.SessionApi.add，含 Pro 上限），答案卡秀
 *   盈虧摘要＋「編輯」「復原」按鈕防聽錯；金額都沒講到才退回表單預填確認
 * - other：顯示轉錄與 AI 的簡短回覆
 *
 * cardsToEntries / fmtCard / vsRandom 是純函式（吃 Evaluator），Node 可測。
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

  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  // card int → 'A♠'（T 顯示成 10）
  function fmtCard(card) {
    var s = Evaluator.cardToString(card);
    return (s.charAt(0) === 'T' ? '10' : s.charAt(0)) + (SUIT_SYM[s.charAt(1)] || '');
  }
  function fmtCards(cards) { return cards.map(fmtCard).join(' '); }

  /* hero vs 隨機手牌的勝率（對手沒講時用）：Monte Carlo，含平手折半 */
  function vsRandom(hero, board, iters) {
    iters = iters || 20000;
    var used = {}, deck = [];
    hero.concat(board).forEach(function (c) { used[c] = 1; });
    'shdc'.split('').forEach(function (su) {
      'AKQJT98765432'.split('').forEach(function (rk) {
        var c = Evaluator.cardFromString(rk + su);
        if (!used[c]) deck.push(c);
      });
    });
    var need = 5 - board.length;
    var wins = 0, ties = 0, n = deck.length, it, i, k, tmp, cmp, full;
    for (it = 0; it < iters; it++) {
      for (i = 0; i < need + 2; i++) {
        k = i + Math.floor(Math.random() * (n - i));
        tmp = deck[i]; deck[i] = deck[k]; deck[k] = tmp;
      }
      full = board.concat(deck.slice(2, 2 + need));
      cmp = Evaluator.compareScore(
        Evaluator.evaluate7(hero.concat(full)),
        Evaluator.evaluate7(deck.slice(0, 2).concat(full))
      );
      if (cmp > 0) wins++; else if (cmp === 0) ties++;
    }
    return (wins + ties / 2) / iters;
  }

  var VoiceAi = { cardsToEntries: cardsToEntries, fmtCard: fmtCard, vsRandom: vsRandom };
  if (isNode) { module.exports = VoiceAi; return; }
  global.VoiceAi = VoiceAi;

  /* ================= 瀏覽器 ================= */

  var AI_BASE = global.VOICE_AI_BASE || '/aiapi';
  var MAX_SEC = 90; // 「整段講完」比單句長，放寬到 90 秒

  function $(id) { return document.getElementById(id); }

  /* ---- 首頁答案卡 ---- */
  var savedId = null; // 剛入帳那筆的 id（給編輯/復原）
  function showAnswer(big, sub, show) {
    show = show || {};
    $('voiceAiAnswer').textContent = big;
    $('voiceAiAnswerSub').textContent = sub;
    $('btnVoiceAiDetail').hidden = !show.detail;
    $('btnVoiceAiEdit').hidden = !show.edit;
    $('btnVoiceAiUndo').hidden = !show.undo;
    $('voiceAiResult').hidden = false;
  }
  function hideAnswer() { $('voiceAiResult').hidden = true; savedId = null; }

  function slotCardsOf(parsed) {
    var out = { hero: [], vill: [], board: [] };
    parsed.entries.forEach(function (e) {
      (e.slot.charAt(0) === 'h' ? out.hero : e.slot.charAt(0) === 'v' ? out.vill : out.board).push(e.card);
    });
    return out;
  }

  function handleEquity(d, msg, status) {
    var parsed = cardsToEntries(d);
    if (!parsed.entries.length) {
      status(msg + ' → ' + t('沒聽到可用的牌，再試一次'));
      return;
    }
    // 牌靜靜填進 EV 分頁（不切換），答案直接在首頁出
    var amt = {
      pot: (typeof d.pot === 'number') ? d.pot : undefined,
      call: (typeof d.call === 'number') ? d.call : undefined
    };
    var out = global.VoiceCardsApply
      ? global.VoiceCardsApply(parsed, amt)
      : { ok: false, msg: 'voice hook missing' };
    var c = slotCardsOf(parsed);
    var eq = null, note = '';
    try {
      if (c.hero.length === 2 && c.vill.length === 2 && global.EquityLib) {
        eq = global.EquityLib.computeEquity(c.hero, c.vill, c.board, 30000).hero;
      } else if (c.hero.length === 2) {
        eq = vsRandom(c.hero, c.board, 20000);
        note = t('（對手未指定，對上隨機手牌）');
      }
    } catch (e) { /* 重複牌等 → 沒有大字答案，退回填牌訊息 */ }
    if (eq !== null) {
      var sub = fmtCards(c.hero) +
        ' vs ' + (c.vill.length === 2 ? fmtCards(c.vill) : '?') +
        (c.board.length ? ' ｜ ' + fmtCards(c.board) : '') + note;
      showAnswer(Math.round(eq * 1000) / 10 + '%', t('勝率') + '：' + sub, { detail: true });
      if (d.answer) sub += '（' + d.answer + '）';
      status(msg + ' → ' + t('勝率') + ' ' + Math.round(eq * 1000) / 10 + '%');
      return;
    }
    if (out.ok && out.n) {
      msg += ' → ' + t('已填入 ') + out.n + t(' 張牌');
      if (out.analyzed) msg += t('，分析見下方');
      showAnswer('♠', msg, { detail: true });
    } else if (out.msg) msg += ' → ' + out.msg;
    status(msg);
  }

  function handleSession(d, msg, status) {
    var rec = global.VoiceTracker ? global.VoiceTracker.sanitize(d.session) : {};
    var hasMoney = rec.buyin !== undefined || rec.cashout !== undefined;
    if (hasMoney && global.SessionApi) {
      var res = global.SessionApi.add(rec);
      if (res.ok) {
        savedId = res.id;
        var r = res.rec;
        var pl = r.cashout - r.buyin;
        var sub = t('已記一筆：') + r.date + (r.venue ? ' · ' + r.venue : '') +
          ' · ' + t('買入 ') + r.buyin + t(' → 兌現 ') + r.cashout +
          (r.mood && r.mood.length ? ' · ' + r.mood.map(function (m) { return t(m); }).join('·') : '');
        showAnswer((pl > 0 ? '+' : '') + pl.toLocaleString() + ' ' + r.cur, sub, { edit: true, undo: true });
        status(msg + ' → ' + sub);
        return;
      }
      status(msg); // Pro 上限：hitLimit 已跳升級視窗
      return;
    }
    // 金額都沒聽到 → 退回表單預填讓人補
    var fab = $('fabAddSession');
    if (fab) fab.click();
    var n = global.VoiceTracker && global.VoiceTracker.apply ? global.VoiceTracker.apply(rec) : 0;
    if (!n) {
      status(msg + ' → ' + t('沒聽到可以填的內容，再試一次'));
      return;
    }
    var doneMsg = msg + ' → ' + t('已填入 ') + n + t(' 個欄位，請確認後儲存');
    var trkSt = $('voiceTrkStatus');
    if (trkSt) { trkSt.hidden = false; trkSt.textContent = doneMsg; }
    status(doneMsg);
  }

  function handleResult(d, status) {
    hideAnswer();
    var msg = t('聽到：') + (d.transcript || '');
    if (d.kind === 'equity') return handleEquity(d, msg, status);
    if (d.kind === 'session' && d.session) return handleSession(d, msg, status);
    status(msg + (d.answer ? ' → ' + d.answer : ' → ' + t('沒聽到可以填的內容，再試一次')));
  }
  VoiceAi.handleResult = handleResult; // console 除錯／測試直接餵結果（跳過錄音）

  function init() {
    var btn = $('btnVoiceAi'), row = $('voiceAiRow'), statusEl = $('voiceAiStatus');
    if (!btn || !row || !statusEl) return;
    var VC = global.VoiceCards;
    if (!VC || !VC.setupMic) return;
    $('btnVoiceAiDetail').addEventListener('click', function () {
      var tab = document.querySelector('.tab-btn[data-tab="equity"]');
      if (tab) tab.click();
    });
    $('btnVoiceAiEdit').addEventListener('click', function () {
      if (savedId !== null && global.SessionApi) global.SessionApi.edit(savedId);
    });
    $('btnVoiceAiUndo').addEventListener('click', function () {
      if (savedId !== null && global.SessionApi) global.SessionApi.remove(savedId);
      hideAnswer();
      statusEl.textContent = t('已復原');
    });
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    fetch(AI_BASE + '/health', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var example = t('按一下錄音再按一下結束：講牌局直接報勝率，講戰績直接入帳');
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
