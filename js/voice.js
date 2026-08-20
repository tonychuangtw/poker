/* 語音選牌 — 講一句話把牌灌進勝率計算
 *
 * 兩部分：
 * 1. 純解析器 parse(text, opts)：把語音辨識文字解析成 {slot, card} 清單。
 *    slot 沿用 app.js 的命名（hero0/hero1、v0a…v4b、board0…board4）。
 *    支援中文（繁/簡）與英文的完整說法（含「我／對手／公牌／翻牌／轉牌／河牌」
 *    路由詞），其他 UI 語系支援花色與人頭牌詞彙（數字用阿拉伯數字）。
 *    沒講路由詞時採連續模式：照 hero → 對手 → 公牌 順序依序填入。
 *    純函式、無 DOM，Node 可 require 供測試。
 * 2. 瀏覽器端：錄音（MediaRecorder）→ 上傳 STT → 把結果交給
 *    window.VoiceCardsApply（由 app.js 提供）。STT endpoint 預設 /sttapi
 *    （可用 window.VOICE_STT_BASE 覆蓋）；開站時 GET /sttapi/health 通了
 *    才顯示 🎤 —— GitHub Pages／離線／App 內拿不到服務就整組隱藏，
 *    完全不影響原本的點選操作。
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Evaluator = isNode ? require('./evaluator.js') : global.Evaluator;

  /* ================= 詞彙表（比對用大寫；latin／西里爾詞另做邊界檢查） ================= */

  function byLenDesc(a, b) { return b[0].length - a[0].length; }

  var SUIT_WORDS = [
    ['黑桃', 's'], ['黑陶', 's'], ['スペード', 's'], ['스페이드', 's'],
    ['ESPADAS', 's'], ['ESPADA', 's'], ['SPADES', 's'], ['SPADE', 's'],
    ['PIQUES', 's'], ['PIQUE', 's'], ['PICAS', 's'], ['PICA', 's'], ['PIK', 's'],
    ['ПИКИ', 's'], ['ПИКА', 's'], ['ПИК', 's'], ['BÍCH', 's'], ['โพดำ', 's'],
    ['♠', 's'], ['♤', 's'],
    ['紅心', 'h'], ['红心', 'h'], ['紅桃', 'h'], ['红桃', 'h'], ['ハート', 'h'], ['하트', 'h'],
    ['CORAZONES', 'h'], ['CORAZÓN', 'h'], ['CORAZON', 'h'], ['COPAS', 'h'],
    ['CŒURS', 'h'], ['CŒUR', 'h'], ['COEURS', 'h'], ['COEUR', 'h'],
    ['HEARTS', 'h'], ['HEART', 'h'], ['HERZ', 'h'],
    ['ЧЕРВЕЙ', 'h'], ['ЧЕРВИ', 'h'], ['ЧЕРВЫ', 'h'], ['CƠ', 'h'], ['โพแดง', 'h'],
    ['♥', 'h'], ['♡', 'h'],
    ['方塊', 'd'], ['方块', 'd'], ['方片', 'd'], ['方磚', 'd'], ['方砖', 'd'],
    ['ダイヤモンド', 'd'], ['ダイヤ', 'd'], ['다이아몬드', 'd'], ['다이아', 'd'],
    ['DIAMONDS', 'd'], ['DIAMOND', 'd'], ['DIAMANTES', 'd'], ['DIAMANTE', 'd'],
    ['OUROS', 'd'], ['OURO', 'd'], ['CARREAUX', 'd'], ['CARREAU', 'd'], ['KARO', 'd'],
    ['БУБНЫ', 'd'], ['БУБНА', 'd'], ['БУБЕН', 'd'], ['RÔ', 'd'], ['ข้าวหลามตัด', 'd'],
    ['♦', 'd'], ['♢', 'd'],
    ['梅花', 'c'], ['草花', 'c'], ['クローバー', 'c'], ['クラブ', 'c'], ['클로버', 'c'], ['클럽', 'c'],
    ['CLUBS', 'c'], ['CLUB', 'c'], ['TRÉBOLES', 'c'], ['TRÉBOL', 'c'], ['TREBOLES', 'c'], ['TREBOL', 'c'],
    ['PAUS', 'c'], ['TRÈFLES', 'c'], ['TRÈFLE', 'c'], ['TREFLES', 'c'], ['TREFLE', 'c'], ['KREUZ', 'c'],
    ['ТРЕФЫ', 'c'], ['ТРЕФА', 'c'], ['ТРЕФ', 'c'], ['КРЕСТИ', 'c'], ['CHUỒN', 'c'], ['TÉP', 'c'], ['ดอกจิก', 'c'],
    ['♣', 'c'], ['♧', 'c']
  ].sort(byLenDesc);

  var RANK_WORDS = [
    ['10', 'T'], ['十', 'T'], ['拾', 'T'], ['石', 'T'], // 石＝whisper 常把「十」聽成的同音字
    ['TEN', 'T'], ['DIEZ', 'T'], ['DEZ', 'T'], ['DIX', 'T'], ['ZEHN', 'T'],
    ['ДЕСЯТКА', 'T'], ['ДЕСЯТЬ', 'T'], ['MƯỜI', 'T'], ['สิบ', 'T'],
    ['ACE', 'A'], ['么', 'A'], ['幺', 'A'], ['エース', 'A'], ['에이스', 'A'],
    ['ÁS', 'A'], ['AS', 'A'], ['ASS', 'A'], ['ТУЗ', 'A'], ['ÁT', 'A'], ['XÌ', 'A'], ['เอซ', 'A'],
    ['老K', 'K'], ['KING', 'K'], ['キング', 'K'], ['킹', 'K'],
    ['REY', 'K'], ['REI', 'K'], ['ROI', 'K'], ['KÖNIG', 'K'], ['KOENIG', 'K'],
    ['КОРОЛЬ', 'K'], ['GIÀ', 'K'], ['คิง', 'K'],
    ['QUEEN', 'Q'], ['クイーン', 'Q'], ['퀸', 'Q'],
    ['REINA', 'Q'], ['DAMA', 'Q'], ['DAME', 'Q'], ['ДАМА', 'Q'], ['ĐẦM', 'Q'], ['ควีน', 'Q'],
    ['傑克', 'J'], ['杰克', 'J'], ['勾', 'J'], ['JACK', 'J'], ['ジャック', 'J'], ['잭', 'J'],
    ['JOTA', 'J'], ['VALETE', 'J'], ['VALET', 'J'], ['BUBE', 'J'], ['ВАЛЕТ', 'J'], ['BỒI', 'J'], ['แจ็ค', 'J'],
    ['NINE', '9'], ['九', '9'], ['EIGHT', '8'], ['八', '8'], ['SEVEN', '7'], ['七', '7'],
    ['SIX', '6'], ['六', '6'], ['FIVE', '5'], ['五', '5'], ['FOUR', '4'], ['四', '4'],
    ['THREE', '3'], ['三', '3'], ['DEUCE', '2'], ['TWO', '2'], ['二', '2'], ['兩', '2'], ['两', '2'],
    ['A', 'A'], ['K', 'K'], ['Q', 'Q'], ['J', 'J'], ['T', 'T'],
    ['9', '9'], ['8', '8'], ['7', '7'], ['6', '6'], ['5', '5'], ['4', '4'], ['3', '3'], ['2', '2']
  ].sort(byLenDesc);

  var TARGET_WORDS = [
    ['我的手牌', 'hero'], ['我的牌', 'hero'], ['我的', 'hero'], ['我', 'hero'], ['HERO', 'hero'],
    ['對手', 'villain'], ['对手', 'villain'], ['對家', 'villain'], ['对家', 'villain'],
    ['VILLAINS', 'villain'], ['VILLAIN', 'villain'], ['OPPONENTS', 'villain'], ['OPPONENT', 'villain'],
    ['公共牌', 'board'], ['公牌', 'board'], ['牌面', 'board'], ['台面', 'board'], ['BOARD', 'board'],
    ['翻牌', 'flop'], ['FLOP', 'flop'],
    ['轉牌', 'turn'], ['转牌', 'turn'], ['TURN', 'turn'],
    ['河牌', 'river'], ['RIVER', 'river'],
    ['全部清除', 'clear'], ['清除', 'clear'], ['清空', 'clear'], ['重來', 'clear'], ['重来', 'clear'],
    ['CLEAR', 'clear'], ['RESET', 'clear'], ['全清', 'clear']
  ].sort(byLenDesc);

  var VILLAIN_IDX = {
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
    '一': 0, '二': 1, '兩': 1, '两': 1, '三': 2, '四': 3, '五': 4
  };

  /* ================= 正規化 ================= */

  function normalize(text) {
    var s = String(text || '');
    // 全形英數 → 半形
    s = s.replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    // 中文請託語（含「我」的先整組拿掉，避免誤觸 hero 路由）
    s = s.replace(/(給我|给我|幫我|帮我|我們|我们|請|请)/g, ' ');
    // 標點與語助字 → 空白
    s = s.replace(/[的是和跟與与然後后還有还接著着就個个張张位のと、，。．；：！？…·,.;:!?'"“”„«»‹›「」『』()（）[\]\-—–~]/g, ' ');
    // 各語系連接詞（of / de / и / và …）→ 空白，讓「rank of suit」黏得起來
    s = s.replace(/(^|\s)(of|de|du|da|do|des|the|and|et|und|y|e|или|и|va|và|với|กับ|or)(?=\s|$)/gi, ' ');
    return s.replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  // 逐字大寫（跳過 ß→SS 這類會變長度的字，維持與原字串對齊）
  function upperAligned(s) {
    var out = '', i, u;
    for (i = 0; i < s.length; i++) {
      u = s.charAt(i).toUpperCase();
      out += (u.length === 1 ? u : s.charAt(i));
    }
    return out;
  }

  // 「字詞字元」：ASCII 英數 + 帶符號拉丁 + 西里爾（CJK／假名／韓文／泰文不算，
  // 所以「黑桃A」「คิงโพดำ」這種無空白相鄰可以成立，latin 詞則有邊界保護）
  function isWordChar(ch) {
    return !!ch && /[A-Za-z0-9À-ɏЀ-ӿḀ-ỿ]/.test(ch);
  }

  /* ================= 掃描 ================= */

  function matchIn(table, U, i) {
    for (var k = 0; k < table.length; k++) {
      var w = table[k][0];
      if (U.substr(i, w.length) !== w) continue;
      // latin／西里爾詞的邊界：詞緣與鄰字都是字詞字元 → 視為包在別的字裡，不算
      if (i > 0 && isWordChar(U.charAt(i - 1)) && isWordChar(w.charAt(0))) continue;
      var after = U.charAt(i + w.length);
      if (after && isWordChar(after) && isWordChar(w.charAt(w.length - 1))) continue;
      return { len: w.length, val: table[k][1] };
    }
    return null;
  }

  // 縮寫形（As、Kd、9h、10c）：原文要有大寫或數字，濾掉英文裡的 as / ah 這類誤判
  function matchCompact(U, raw, i) {
    var m = /^(10|[AKQJT2-9])([SHDC])/.exec(U.substr(i, 3));
    if (!m) return null;
    var len = m[0].length;
    if (i > 0 && isWordChar(U.charAt(i - 1))) return null;
    var after = U.charAt(i + len);
    if (after && isWordChar(after)) return null;
    if (!/[A-Z0-9]/.test(raw.substr(i, len))) return null;
    return { len: len, rank: m[1] === '10' ? 'T' : m[1], suit: m[2].toLowerCase() };
  }

  function skipSpaces(U, i) {
    while (i < U.length && U.charAt(i) === ' ') i++;
    return i;
  }

  /* ================= 解析 ================= */

  /* parse(text, {villains}) →
   *   { clear, entries: [{slot, card}], errors: [{code, card?}], maxVillain }
   * errors code：dup（同句重複牌）/ overflow（牌多過牌位）/ villains（對手超過 5 位）
   * villains 參數 = 目前 UI 上的對手數，決定連續模式時對手段的長度。 */
  function parse(text, opts) {
    opts = opts || {};
    var nV = Math.max(1, Math.min(5, opts.villains || 1));
    var raw = normalize(text);
    var U = upperAligned(raw);

    var entries = [];   // 同一 slot 重講 = 蓋掉舊值
    var slotIdx = {};
    var errors = [];
    var clear = false;
    var autoV = -1;     // 未編號的「對手」自動遞增
    var cursor = 0;

    function slotList() {
      var l = ['hero0', 'hero1'], k;
      for (k = 0; k < nV; k++) l.push('v' + k + 'a', 'v' + k + 'b');
      for (k = 0; k < 5; k++) l.push('board' + k);
      return l;
    }
    var list = slotList();

    function seek(name) {
      var k = list.indexOf(name);
      if (k >= 0) cursor = k;
    }

    function addCard(rank, suit) {
      var card;
      try { card = Evaluator.cardFromString(rank + suit); } catch (e) { return; }
      if (cursor >= list.length) { errors.push({ code: 'overflow' }); return; }
      var slot = list[cursor++];
      if (slotIdx[slot] !== undefined) entries[slotIdx[slot]].card = card;
      else { slotIdx[slot] = entries.length; entries.push({ slot: slot, card: card }); }
    }

    var i = 0, hit, su, r, j;
    while (i < U.length) {
      if (U.charAt(i) === ' ') { i++; continue; }

      hit = matchIn(TARGET_WORDS, U, i);
      if (hit) {
        if (hit.val === 'hero') { seek('hero0'); i += hit.len; continue; }
        if (hit.val === 'villain') {
          j = skipSpaces(U, i + hit.len);
          var idx = VILLAIN_IDX[U.charAt(j)];
          // 「對手2 …」是編號；「對手 2S」的 2 是牌，靠下一個字元區分
          if (idx !== undefined && !/[A-Z0-9]/.test(U.charAt(j + 1) || '')) {
            i = j + 1;
          } else {
            idx = autoV + 1;
            i += hit.len;
          }
          if (idx > 4) { errors.push({ code: 'villains' }); idx = 4; }
          autoV = idx;
          if (idx + 1 > nV) { nV = idx + 1; list = slotList(); }
          seek('v' + idx + 'a');
          continue;
        }
        if (hit.val === 'board') { seek('board0'); i += hit.len; continue; }
        if (hit.val === 'flop') { seek('board0'); i += hit.len; continue; }
        if (hit.val === 'turn') { seek('board3'); i += hit.len; continue; }
        if (hit.val === 'river') { seek('board4'); i += hit.len; continue; }
        if (hit.val === 'clear') { clear = true; i += hit.len; continue; }
      }

      hit = matchCompact(U, raw, i);
      if (hit) { addCard(hit.rank, hit.suit); i += hit.len; continue; }

      su = matchIn(SUIT_WORDS, U, i);
      if (su) {
        j = skipSpaces(U, i + su.len);
        r = matchIn(RANK_WORDS, U, j);
        if (r) { addCard(r.val, su.val); i = j + r.len; continue; }
        i += su.len;
        continue;
      }

      r = matchIn(RANK_WORDS, U, i);
      if (r) {
        j = skipSpaces(U, i + r.len);
        su = matchIn(SUIT_WORDS, U, j);
        if (su) { addCard(r.val, su.val); i = j + su.len; continue; }
        i += r.len;
        continue;
      }

      i++;
    }

    var seen = {}, k2;
    for (k2 = 0; k2 < entries.length; k2++) {
      if (seen[entries[k2].card] !== undefined) errors.push({ code: 'dup', card: entries[k2].card });
      seen[entries[k2].card] = 1;
    }
    var maxV = -1;
    entries.forEach(function (e2) {
      var m = /^v(\d)/.exec(e2.slot);
      if (m && +m[1] > maxV) maxV = +m[1];
    });

    return { clear: clear, entries: entries, errors: errors, maxVillain: maxV };
  }

  var VoiceCards = { parse: parse, normalize: normalize };
  if (isNode) { module.exports = VoiceCards; return; }
  global.VoiceCards = VoiceCards;

  /* ================= 瀏覽器：錄音 + STT + 套用 ================= */

  var BASE = global.VOICE_STT_BASE || '/sttapi';
  var LANG_MAP = { 'zh-TW': 'zh', 'zh-CN': 'zh', 'pt-BR': 'pt' };
  var MAX_SEC = 30;

  function sttLang() {
    var l = global.I18N_LANG || 'zh-TW';
    return LANG_MAP[l] || l.slice(0, 2);
  }

  function hotwords() {
    return sttLang() === 'zh'
      ? '黑桃、紅心、方塊、梅花、黑桃10、紅心9、老K、對手、公牌、翻牌、轉牌、河牌、清除'
      : 'spades, hearts, diamonds, clubs, ace, king, queen, jack, ten, hero, villain, board, flop, turn, river';
  }

  function pickMime() {
    var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'], k;
    for (k = 0; k < cands.length; k++) {
      if (global.MediaRecorder && MediaRecorder.isTypeSupported(cands[k])) return cands[k];
    }
    return '';
  }

  function setupMic(btn, statusEl, example, onText) {
    var rec = null, chunks = [], stream = null, timer = null, busy = false;
    var idleLabel = btn.textContent;

    function status(msg) { statusEl.textContent = msg || ''; }
    function reset() {
      btn.classList.remove('voice-rec', 'voice-busy');
      btn.textContent = idleLabel;
      busy = false;
    }
    function stopTracks() {
      if (stream) { stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; }
      if (timer) { clearTimeout(timer); timer = null; }
    }

    function start() {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
        stream = st;
        chunks = [];
        var mime = pickMime();
        rec = new MediaRecorder(st, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onstop = upload;
        rec.start();
        btn.classList.add('voice-rec');
        btn.textContent = '⏹';
        status(t('錄音中…再按一下完成'));
        timer = setTimeout(stop, MAX_SEC * 1000);
      }, function () {
        status(t('麥克風權限被拒絕'));
      });
    }

    function stop() {
      if (rec && rec.state !== 'inactive') rec.stop(); // onstop → upload
      stopTracks();
      btn.classList.remove('voice-rec');
      btn.classList.add('voice-busy');
      btn.textContent = '…';
      busy = true;
      status(t('辨識中…'));
    }

    function upload() {
      var type = (rec && rec.mimeType) || 'audio/webm';
      var ext = type.indexOf('mp4') > -1 ? 'm4a' : 'webm';
      var blob = new Blob(chunks, { type: type });
      rec = null;
      if (blob.size < 1000) { reset(); status(example); return; } // 太短，當誤觸
      var fd = new FormData();
      fd.append('file', blob, 'voice.' + ext);
      fd.append('language', sttLang());
      fd.append('hotwords', hotwords());
      fetch(BASE + '/stt', { method: 'POST', body: fd })
        .then(function (resp) {
          return resp.json().then(function (d) { return { http: resp.status, d: d }; });
        })
        .then(function (res) {
          reset();
          var d = res.d;
          if (!d || !d.ok || !d.text) throw new Error((d && d.error) || ('HTTP ' + res.http));
          onText(d.text, status);
        })
        .catch(function (err) {
          reset();
          status(t('語音辨識失敗：') + (err && err.message ? err.message : err));
        });
    }

    btn.addEventListener('click', function () {
      if (busy) return;
      if (rec && rec.state === 'recording') { stop(); return; }
      if (!global.isSecureContext) { status(t('需要 HTTPS 才能使用麥克風')); return; }
      if (!navigator.mediaDevices || !global.MediaRecorder) { status(t('此瀏覽器不支援錄音')); return; }
      start();
    });
  }

  function currentVillains() {
    var slots = document.querySelectorAll('#villainRows .card-slot').length;
    return Math.max(1, Math.round(slots / 2));
  }

  function handleEquityText(text, status) {
    var parsed = parse(text, { villains: currentVillains() });
    var out = global.VoiceCardsApply
      ? global.VoiceCardsApply(parsed)
      : { ok: false, msg: 'voice hook missing' };
    var msg = t('聽到：') + text;
    if (out.ok && out.n) msg += ' → ' + t('已填入 ') + out.n + t(' 張牌');
    else if (out.msg) msg += ' → ' + out.msg;
    status(msg);
  }

  function init() {
    var btn = document.getElementById('btnVoiceEquity');
    var row = document.getElementById('voiceEquityRow');
    var statusEl = document.getElementById('voiceEquityStatus');
    if (!btn || !row || !statusEl) return;
    // 健康檢查通過才亮 🎤（拿不到 STT 服務的部署整組隱藏，不影響點選操作）
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    fetch(BASE + '/health', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var example = t('語音範例：「我 紅心A 黑桃K，對手 方塊Q 方塊J，公牌 黑桃10 紅心9 梅花2」');
        row.hidden = false;
        statusEl.hidden = false;
        statusEl.textContent = example;
        setupMic(btn, statusEl, example, handleEquityText);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
