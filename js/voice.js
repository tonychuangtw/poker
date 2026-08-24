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
    ['NINE', '9'], ['九', '9'], ['酒', '9'], // 酒＝whisper 常把「九」聽成的同音字
    ['EIGHT', '8'], ['八', '8'], ['SEVEN', '7'], ['七', '7'],
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

  /* ================= 複盤精靈用：位置與逐街解析 ================= */

  // 輕量正規化：只把全形轉半形、標點轉空白（保留「跟」「的」這些字，
  // 因為「跟注 30」「需跟 30」的金額詞會用到）
  function liteNormalize(text) {
    var s = String(text || '');
    s = s.replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    // 小數點先保護（「lost 12.5」的 . 不是標點），其他標點轉空白
    s = s.replace(/(\d)\.(\d)/g, '$1\u0001$2');
    s = s.replace(/[、，。．；：！？…·,.;:!?'"“”„«»‹›「」『』()（）[\]—–~]/g, ' ');
    s = s.replace(/\u0001/g, '.');
    return s.replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  var POSITION_WORDS = [
    ['UTG+1', 'UTG+1'], ['UTG加一', 'UTG+1'], ['槍口加一', 'UTG+1'], ['枪口加一', 'UTG+1'],
    ['UNDER THE GUN', 'UTG'], ['UTG', 'UTG'], ['槍口', 'UTG'], ['枪口', 'UTG'],
    ['MIDDLE', 'MP'], ['中位', 'MP'], ['MP', 'MP'],
    ['LOJACK', 'LJ'], ['LJ', 'LJ'],
    ['HIJACK', 'HJ'], ['HJ', 'HJ'],
    ['CUTOFF', 'CO'], ['CEO', 'CO'], ['CO', 'CO'], // CEO＝whisper 常聽成的版本
    ['BUTTON', 'BTN'], ['按鈕', 'BTN'], ['按钮', 'BTN'], ['BTN', 'BTN'],
    ['SMALL BLIND', 'SB'], ['小盲', 'SB'], ['SB', 'SB'],
    ['BIG BLIND', 'BB'], ['大盲', 'BB'], ['BB', 'BB']
  ].sort(byLenDesc);

  // 「我在CO」「button」→ hPos 的選項值；沒講就回 null。
  // 「對手BTN」這種前面帶對手詞的，是對手的位置不是我的 → 跳過。
  var VILLAIN_NEAR = /(?:對手|对手|對家|对家|VILLAIN|OPPONENT)\s*$/;
  function parsePosition(text) {
    var raw = liteNormalize(text);
    var U = upperAligned(raw);
    for (var i = 0; i < U.length; i++) {
      var hit = matchIn(POSITION_WORDS, U, i);
      if (!hit) continue;
      if (VILLAIN_NEAR.test(U.slice(Math.max(0, i - 12), i))) { i += hit.len - 1; continue; }
      return hit.val;
    }
    return null;
  }

  /* ================= 一句話錄整手：桌況／結果／對手列 ================= */

  var TABLE_BLINDS = /(?:盲注|大小盲|BLINDS?)\s*(\d+(?:\.\d+)?)[/的比對对\s\-]+(\d+(?:\.\d+)?)/i;
  var TABLE_ANTE = /(?:前注|ANTE)\s*(\d+(?:\.\d+)?)/i;
  var TABLE_STACK = /(?:有效籌碼|有效筹码|籌碼|筹码|STACKS?|EFFECTIVE)\s*(\d+(?:\.\d+)?)/i;
  var TABLE_PLAYERS = /(\d+)\s*(?:人|명|PLAYERS?|HANDED)/i;
  var TABLE_MTT = /錦標賽|锦标赛|比賽|比赛|MTT|TOURNAMENT/i;
  var TABLE_CASH = /現金|现金|CASH/i;

  // 桌況：「盲注5/10 前注1 有效籌碼100 8人 錦標賽」→ {blinds, ante, stack, players, gtype}
  // 各欄位取第一個出現的（桌況通常講在最前面，後面的數字是別的東西）
  function parseTable(text) {
    var s = liteNormalize(text);
    var out = {}, m;
    m = TABLE_BLINDS.exec(s);
    if (m) out.blinds = m[1] + '/' + m[2];
    m = TABLE_ANTE.exec(s);
    if (m) out.ante = parseFloat(m[1]);
    m = TABLE_STACK.exec(s);
    if (m) out.stack = parseFloat(m[1]);
    m = TABLE_PLAYERS.exec(s);
    if (m && +m[1] >= 2 && +m[1] <= 10) out.players = +m[1];
    if (TABLE_MTT.test(s)) out.gtype = 'mtt';
    else if (TABLE_CASH.test(s)) out.gtype = 'cash';
    return out;
  }

  var RESULT_WIN = /(?:贏|赢|WON|WIN)\s*(\d+(?:\.\d+)?)/i;
  var RESULT_LOSE = /(?:輸|输|LOST|LOSE)\s*(\d+(?:\.\d+)?)/i;
  var RESULT_NUM = /(?:結果|结果|RESULT)\s*([+-]?\d+(?:\.\d+)?)/i;

  // 「贏75」→ +75、「輸35」→ -35、「結果 -35」→ -35；沒講回 null
  function parseResult(text) {
    var s = liteNormalize(text), m;
    m = RESULT_WIN.exec(s);
    if (m) return parseFloat(m[1]);
    m = RESULT_LOSE.exec(s);
    if (m) return -parseFloat(m[1]);
    m = RESULT_NUM.exec(s);
    if (m) return parseFloat(m[1]);
    return null;
  }

  // 「BTN 80，SB 45」（也吃「對手BTN 80」）→ [{pos, stack}]
  function parseOppStacks(text) {
    var raw = liteNormalize(text);
    var U = upperAligned(raw);
    var out = [];
    for (var i = 0; i < U.length; i++) {
      var hit = matchIn(POSITION_WORDS, U, i);
      if (!hit) { continue; }
      var j = skipSpaces(U, i + hit.len);
      var m = /^(\d+(?:\.\d+)?)/.exec(U.slice(j, j + 12));
      if (m) { out.push({ pos: hit.val, stack: parseFloat(m[1]) }); i = j + m[1].length - 1; }
      else i += hit.len - 1;
    }
    return out;
  }

  // 攤牌：「BTN 方塊9 方塊8，SB 紅心A 紅心K」→ [{pos, cards: [int,int]}]
  // 以位置詞切段，每段抓前兩張牌；不足兩張的段落略過
  function parseShowdown(text) {
    var raw = liteNormalize(text);
    var U = upperAligned(raw);
    var marks = [], i, hit;
    for (i = 0; i < U.length; i++) {
      hit = matchIn(POSITION_WORDS, U, i);
      if (hit) { marks.push({ at: i, len: hit.len, pos: hit.val }); i += hit.len - 1; }
    }
    var out = [];
    for (i = 0; i < marks.length; i++) {
      var from = marks[i].at + marks[i].len;
      var to = i + 1 < marks.length ? marks[i + 1].at : raw.length;
      var p = parse(raw.slice(from, to), { villains: 1 });
      var cards = [];
      p.entries.forEach(function (en) { if (cards.length < 2) cards.push(en.card); });
      if (cards.length === 2) out.push({ pos: marks[i].pos, cards: cards });
    }
    return out;
  }

  var STREET_SEG = [
    ['翻前', 'preflop'], ['PREFLOP', 'preflop'],
    ['翻牌', 'flop'], ['FLOP', 'flop'],
    ['轉牌', 'turn'], ['转牌', 'turn'], ['TURN', 'turn'],
    ['河牌', 'river'], ['RIVER', 'river']
  ].sort(byLenDesc);

  // 底持/須跟/家住＝whisper 對「底池/需跟/加注」的常見同音輸出
  var AMOUNT_POT = /(?:底池|底持|POT)\s*(\d+(?:\.\d+)?)/gi;
  var AMOUNT_CALL = /(?:需跟注|須跟注|需跟|須跟|跟注|TO CALL|CALL)\s*(\d+(?:\.\d+)?)/gi;
  var ACTION_WORDS = [
    [/全下|ALL ?IN|SHOVE|推入/i, 'allin'],
    [/加注|家住|下注|RAISE|BET/i, 'raise'],
    [/蓋牌|盖牌|棄牌|弃牌|FOLD/i, 'fold'],
    [/過牌|过牌|CHECK/i, 'call'],   // 模型無 check，視為跟 0
    [/跟注|CALL|我跟/i, 'call']
  ];

  /* --- 口語 range → pushfold 記號（「口袋七以上」→ 77+、「AK」→ AKs AKo） --- */
  var RANGE_RANK = {
    '10': 'T', '十': 'T', '拾': 'T', '石': 'T', '么': 'A', '幺': 'A',
    '二': '2', '两': '2', '兩': '2', '三': '3', '四': '4', '五': '5',
    '六': '6', '七': '7', '八': '8', '九': '9', '酒': '9',
    'ACE': 'A', 'KING': 'K', 'QUEEN': 'Q', 'JACK': 'J', 'TEN': 'T', 'NINE': '9',
    'EIGHT': '8', 'SEVEN': '7', 'SIX': '6', 'FIVE': '5', 'FOUR': '4', 'THREE': '3', 'TWO': '2'
  };
  function rangeRank(txt) {
    var u = txt.toUpperCase();
    return RANGE_RANK[u] || u;
  }
  var RANK_ORDER = '23456789TJQKA';
  var POCKET_RE = /(?:口袋|對子|对子|POCKET)\s*(10|[AKQJT2-9]|[十拾石酒么幺二两兩三四五六七八九]|ACE|KING|QUEEN|JACK|TEN|NINE|EIGHT|SEVEN|SIX|FIVE|FOUR|THREE|TWO)S?\s*(以上|\+|PLUS)?/gi;
  var PAIR_RE = /(10|[AKQJT2-9]) ?(10|[AKQJT2-9])\s*(同花|雜色|杂色|不同花|SUITED|OFFSUIT)?\s*(以上|\+|PLUS)?/gi;

  function rangeTokens(body) {
    var toks = [], m;
    POCKET_RE.lastIndex = 0;
    var rest = body.replace(POCKET_RE, function (all, rk, plus) {
      var r = rangeRank(rk);
      toks.push(r + r + (plus ? '+' : ''));
      return ' ';
    });
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(rest))) {
      // latin 邊界：像 TAKE/STACK 這種字裡的 TA 不能當 range。
      // 後邊界看「兩個 rank 之後」那個字元（不含 \s* 吃掉的空白，
      // 否則「AK lost」會被後面的 L 誤擋）；有講同花/以上等後綴的一定是有意的，免檢。
      var coreLen = m[1].length +
        (m[0].length > m[1].length && m[0].charAt(m[1].length) === ' ' ? 1 : 0) + m[2].length;
      var hasSuf = !!(m[3] || m[4]);
      if (/[A-Za-z0-9]/.test(rest.charAt(m.index - 1))) continue;
      if (!hasSuf && /[A-Za-z0-9]/.test(rest.charAt(m.index + coreLen))) continue;
      var a = rangeRank(m[1]), b = rangeRank(m[2]);
      var suf = m[3] || '';
      var plus = m[4] ? '+' : '';
      var suited = /同花|SUITED/i.test(suf) ? 's' : suf ? 'o' : '';
      if (a === b) {
        if (!suited) toks.push(a + a + plus); // 「JJ」「JJ以上」
        continue;
      }
      // 沒講同花/雜色也沒講以上的裸對，只收字母牌（AK/AQ…）；
      // 純數字（如 95）太容易跟一般數字撞，略過
      if (!suited && !plus && !(/[AKQJT]/.test(m[1].toUpperCase()) && /[AKQJT]/.test(m[2].toUpperCase()))) continue;
      if (RANK_ORDER.indexOf(a) < RANK_ORDER.indexOf(b)) { var sw = a; a = b; b = sw; }
      if (suited) toks.push(a + b + suited + plus);
      else { toks.push(a + b + 's' + plus); toks.push(a + b + 'o' + plus); }
    }
    return toks;
  }

  /* parseStreets(text) → { cleaned, segs }
   * segs = { flop: {pot?, call?, action?}, … } 只含有講到的街。
   * cleaned = 把「底池 N／跟注 N」金額整段拿掉後的字串（拿去給 parse() 抓牌，
   * 避免「底池10 梅花2」被誤讀成 rank10+梅花）。 */
  function parseStreets(text) {
    var s = liteNormalize(text);
    var U = upperAligned(s);

    // 找出各街關鍵字位置，切成路段
    var marks = [], i, hit;
    for (i = 0; i < U.length;) {
      hit = matchIn(STREET_SEG, U, i);
      if (hit) { marks.push({ at: i, len: hit.len, street: hit.val }); i += hit.len; }
      else i++;
    }
    var segs = {};
    for (i = 0; i < marks.length; i++) {
      var from = marks[i].at + marks[i].len;
      var to = i + 1 < marks.length ? marks[i + 1].at : s.length;
      var body = s.slice(from, to);
      var seg = segs[marks[i].street] || (segs[marks[i].street] = {});
      var m;
      AMOUNT_POT.lastIndex = 0;
      while ((m = AMOUNT_POT.exec(body))) seg.pot = parseFloat(m[1]);
      AMOUNT_CALL.lastIndex = 0;
      while ((m = AMOUNT_CALL.exec(body))) seg.call = parseFloat(m[1]);
      var noAmt = body.replace(AMOUNT_POT, ' ').replace(AMOUNT_CALL, ' ');
      for (var a = 0; a < ACTION_WORDS.length; a++) {
        if (ACTION_WORDS[a][0].test(noAmt)) { seg.action = ACTION_WORDS[a][1]; break; }
      }
      var rng = rangeTokens(noAmt);
      if (rng.length) seg.range = rng.join(' ');
    }
    return { cleaned: s.replace(AMOUNT_POT, ' ').replace(AMOUNT_CALL, ' '), segs: segs };
  }

  /* 勝率分頁用：抓整句的底池/需跟金額（不分街）。
     回傳 { pot, call, cleaned }；cleaned 已把金額整段拿掉，
     避免「底池45」的 4、5 被 parse() 當成牌。 */
  function parseAmounts(text) {
    var s = liteNormalize(text);
    var pot, call, m;
    AMOUNT_POT.lastIndex = 0;
    while ((m = AMOUNT_POT.exec(s))) pot = parseFloat(m[1]);
    AMOUNT_CALL.lastIndex = 0;
    while ((m = AMOUNT_CALL.exec(s))) call = parseFloat(m[1]);
    return { pot: pot, call: call, cleaned: s.replace(AMOUNT_POT, ' ').replace(AMOUNT_CALL, ' ') };
  }

  var VoiceCards = {
    parse: parse, normalize: normalize,
    parsePosition: parsePosition, parseStreets: parseStreets, parseAmounts: parseAmounts,
    parseTable: parseTable, parseResult: parseResult,
    parseOppStacks: parseOppStacks, parseShowdown: parseShowdown
  };
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
      ? '黑桃、紅心、方塊、梅花、黑桃10、紅心9、紅心A、老K、對手、公牌、翻牌、轉牌、河牌、底池、需跟、加注、跟注、全下、蓋牌、口袋、以上、同花、盲注、有效籌碼、錦標賽、結果、贏、輸、CO、BTN、清除'
      : 'spades, hearts, diamonds, clubs, ace, king, queen, jack, ten, hero, villain, board, flop, turn, river, pot, call, raise, fold, pocket, suited, blinds, stack, tournament, won, lost';
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

  function setInput(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handleEquityText(text, status) {
    var amt = parseAmounts(text);
    var parsed = parse(amt.cleaned, { villains: currentVillains() });
    var out = global.VoiceCardsApply
      ? global.VoiceCardsApply(parsed, amt)
      : { ok: false, msg: 'voice hook missing' };
    var msg = t('聽到：') + text;
    if (out.ok && out.n) {
      msg += ' → ' + t('已填入 ') + out.n + t(' 張牌');
      if (out.analyzed) msg += t('，分析見下方');
    } else if (out.msg) msg += ' → ' + out.msg;
    status(msg);
  }

  /* 複盤精靈步驟 2：「我在CO 紅心A 黑桃K」→ 位置 + 手牌 */
  function handleHeroText(text, status) {
    var parsed = parse(text, { villains: 1 });
    for (var i = 0; i < parsed.errors.length; i++) {
      if (parsed.errors[i].code === 'dup') { status(t('聽到：') + text + ' → ' + t('沒聽到可用的牌，再試一次')); return; }
    }
    var cards = [];
    parsed.entries.forEach(function (en) {
      if (en.slot === 'hero0' || en.slot === 'hero1') cards.push(en.card);
    });
    var pos = parsePosition(text);
    if (pos) setInput(document.getElementById('hPos'), pos);
    if (cards.length < 2) {
      status(t('聽到：') + text + ' → ' + (pos ? pos : t('沒聽到可用的牌，再試一次')));
      return;
    }
    var txt = cards.slice(0, 2).map(function (c) { return Evaluator.cardToString(c); }).join(' ');
    setInput(document.getElementById('hHero'), txt);
    status(t('聽到：') + text + ' → ' + (pos ? pos + ' · ' : '') + txt);
  }

  /* 複盤精靈步驟 4：「翻牌 黑桃10 紅心9 梅花2 底池45 需跟30 我加注，轉牌…」
     → 各街公牌（翻牌 3 張、轉牌 1 張、河牌 1 張）＋底池／需跟／行動 */
  function collectBoards(parsed) {
    var boards = { flop: [], turn: [], river: [] };
    parsed.entries.forEach(function (en) {
      var m = /^board(\d)$/.exec(en.slot);
      if (!m) return;
      var b = +m[1];
      boards[b < 3 ? 'flop' : b === 3 ? 'turn' : 'river'].push({ b: b, card: en.card });
    });
    return boards;
  }

  /* 把 parseStreets 的結果灌進逐街欄位；回傳 {updated: [street…], err} */
  function applyStreets(st, parsed) {
    var boards = collectBoards(parsed);
    if ((boards.flop.length && boards.flop.length !== 3) || boards.turn.length > 1 || boards.river.length > 1) {
      return { updated: [], err: t('公牌張數不對（翻牌 3 張、轉牌 1 張、河牌 1 張）') };
    }
    var updated = [];
    ['flop', 'turn', 'river'].forEach(function (street) {
      if (!boards[street].length) return;
      boards[street].sort(function (a, b2) { return a.b - b2.b; });
      var el = document.querySelector('#hStreets .street-block[data-street="' + street + '"] .hs-board');
      if (!el) return;
      setInput(el, boards[street].map(function (en) { return Evaluator.cardToString(en.card); }).join(' '));
      if (updated.indexOf(street) === -1) updated.push(street);
    });
    ['preflop', 'flop', 'turn', 'river'].forEach(function (street) {
      var seg = st.segs[street];
      if (!seg) return;
      var block = document.querySelector('#hStreets .street-block[data-street="' + street + '"]');
      if (!block) return;
      if (seg.pot !== undefined) setInput(block.querySelector('.hs-pot'), seg.pot);
      if (seg.call !== undefined) setInput(block.querySelector('.hs-call'), seg.call);
      if (seg.action) setInput(block.querySelector('.hs-action'), seg.action);
      if (seg.range) setInput(block.querySelector('.hs-range'), seg.range);
      if (updated.indexOf(street) === -1) updated.push(street);
    });
    return { updated: updated, err: null };
  }

  function streetNames(list) {
    var names = global.HANDS && global.HANDS.STREET_NAMES;
    return list.map(function (street) {
      return names && names[street] ? names[street] : street;
    });
  }

  function handleStreetsText(text, status) {
    var st = parseStreets(text);
    var parsed = parse(st.cleaned, { villains: 1 });
    for (var i = 0; i < parsed.errors.length; i++) {
      if (parsed.errors[i].code === 'dup') { status(t('聽到：') + text + ' → ' + t('沒聽到可用的牌，再試一次')); return; }
    }
    var boards = collectBoards(parsed);
    var anySeg = false, k;
    for (k in st.segs) { anySeg = true; break; }
    if (!boards.flop.length && !boards.turn.length && !boards.river.length && !anySeg) {
      status(t('聽到：') + text + ' → ' + t('先說「翻牌／轉牌／河牌」再接牌'));
      return;
    }
    var res = applyStreets(st, parsed);
    if (res.err) {
      status(t('聽到：') + text + ' → ' + res.err);
      return;
    }
    status(t('聽到：') + text + ' → ' + t('已更新：') + streetNames(res.updated).join('、'));
  }

  /* 步驟 1：一句話錄整手（桌況＋位置＋手牌＋逐街＋結果，講到哪填到哪） */
  function handleHandAll(text, status) {
    var st = parseStreets(text);
    var parsed = parse(st.cleaned, { villains: 1 });
    for (var i = 0; i < parsed.errors.length; i++) {
      if (parsed.errors[i].code === 'dup') { status(t('聽到：') + text + ' → ' + t('沒聽到可用的牌，再試一次')); return; }
    }
    var updated = [];
    var tbl = parseTable(text);
    var anyTable = false;
    if (tbl.blinds !== undefined) { setInput(document.getElementById('hBlinds'), tbl.blinds); anyTable = true; }
    if (tbl.ante !== undefined) { setInput(document.getElementById('hAnte'), tbl.ante); anyTable = true; }
    if (tbl.stack !== undefined) { setInput(document.getElementById('hStack'), tbl.stack); anyTable = true; }
    if (tbl.players !== undefined) { setInput(document.getElementById('hwPlayers'), tbl.players); anyTable = true; }
    if (tbl.gtype) { setInput(document.getElementById('hwType'), tbl.gtype); anyTable = true; }
    if (anyTable) updated.push(t('桌況'));
    var pos = parsePosition(text);
    var cards = [];
    parsed.entries.forEach(function (en) {
      if (en.slot === 'hero0' || en.slot === 'hero1') cards.push(en.card);
    });
    if (pos) setInput(document.getElementById('hPos'), pos);
    if (cards.length >= 2) {
      setInput(document.getElementById('hHero'),
        cards.slice(0, 2).map(function (c) { return Evaluator.cardToString(c); }).join(' '));
    }
    if (pos || cards.length >= 2) updated.push(t('位置與手牌'));
    var stRes = applyStreets(st, parsed);
    updated = updated.concat(streetNames(stRes.updated));
    var result = parseResult(text);
    if (result !== null) { setInput(document.getElementById('hResult'), result); updated.push(t('結果')); }
    var msg = t('聽到：') + text;
    if (updated.length) msg += ' → ' + t('已更新：') + updated.join('、');
    else if (!stRes.err) msg += ' → ' + t('沒聽到可以填的內容，再試一次');
    if (stRes.err) msg += '（' + stRes.err + '）';
    status(msg);
  }

  /* 步驟 3：對手位置＋籌碼 → 逐列新增 */
  function fillPosRow(boxId, addBtnId, pos, val) {
    var btn = document.getElementById(addBtnId);
    var box = document.getElementById(boxId);
    if (!btn || !box) return;
    btn.click();
    var rows = box.querySelectorAll('.evt-row');
    var row = rows[rows.length - 1];
    if (!row) return;
    setInput(row.querySelector('select'), pos);
    setInput(row.querySelector('input'), val);
  }

  function handleOppsText(text, status) {
    var opps = parseOppStacks(text);
    if (!opps.length) {
      status(t('聽到：') + text + ' → ' + t('沒聽到可以填的內容，再試一次'));
      return;
    }
    opps.forEach(function (o) { fillPosRow('hwOpps', 'btnAddOpp', o.pos, o.stack); });
    status(t('聽到：') + text + ' → ' + t('已更新：') + opps.map(function (o) {
      return o.pos + ' ' + o.stack;
    }).join('、'));
  }

  /* 步驟 5：攤牌（位置＋兩張牌）→ 逐列新增 */
  function handleShowsText(text, status) {
    var shows = parseShowdown(text);
    if (!shows.length) {
      status(t('聽到：') + text + ' → ' + t('沒聽到可以填的內容，再試一次'));
      return;
    }
    shows.forEach(function (o) {
      fillPosRow('hwShows', 'btnAddShow', o.pos,
        o.cards.map(function (c) { return Evaluator.cardToString(c); }).join(' '));
    });
    status(t('聽到：') + text + ' → ' + t('已更新：') + shows.map(function (o) {
      return o.pos + ' ' + o.cards.map(function (c) { return Evaluator.cardToString(c); }).join(' ');
    }).join('、'));
  }

  function init() {
    var MICS = [
      { btn: 'btnVoiceEquity', row: 'voiceEquityRow', status: 'voiceEquityStatus',
        example: '語音範例：「我 紅心A 黑桃K，對手 方塊Q 方塊J，公牌 黑桃10 紅心9 梅花2，底池100 需跟30」',
        handler: handleEquityText },
      { btn: 'btnVoiceHandAll', row: 'voiceHandAllRow', status: 'voiceHandAllStatus',
        example: '語音範例：「盲注5/10 有效籌碼100 8人 錦標賽，我在CO 紅心A 黑桃K，翻牌 黑桃10 紅心9 梅花2 底池45 需跟30 我加注 對手 口袋七以上 AK，結果輸35」',
        handler: handleHandAll },
      { btn: 'btnVoiceOpps', row: 'voiceOppsRow', status: 'voiceOppsStatus',
        example: '語音範例：「BTN 80，SB 45」',
        handler: handleOppsText },
      { btn: 'btnVoiceShows', row: 'voiceShowsRow', status: 'voiceShowsStatus',
        example: '語音範例：「BTN 方塊9 方塊8」',
        handler: handleShowsText },
      { btn: 'btnVoiceHandHero', row: 'voiceHandHeroRow', status: 'voiceHandHeroStatus',
        example: '語音範例：「我在CO 紅心A 黑桃K」',
        handler: handleHeroText },
      { btn: 'btnVoiceStreets', row: 'voiceStreetsRow', status: 'voiceStreetsStatus',
        example: '語音範例：「翻牌 黑桃10 紅心9 梅花2 底池45 需跟30 我加注 對手 口袋七以上 AK，轉牌 黑桃2 底池105 我跟注」',
        handler: handleStreetsText }
    ];
    var targets = [];
    MICS.forEach(function (m) {
      var btn = document.getElementById(m.btn);
      var row = document.getElementById(m.row);
      var statusEl = document.getElementById(m.status);
      if (btn && row && statusEl) targets.push({ btn: btn, row: row, statusEl: statusEl, cfg: m });
    });
    if (!targets.length) return;
    // 健康檢查通過才亮 🎤（拿不到 STT 服務的部署整組隱藏，不影響原本操作）
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    fetch(BASE + '/health', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        targets.forEach(function (tg) {
          var example = t(tg.cfg.example);
          tg.row.hidden = false;
          tg.statusEl.hidden = false;
          tg.statusEl.textContent = example;
          setupMic(tg.btn, tg.statusEl, example, tg.cfg.handler);
        });
      })
      .catch(function () {});
  }

  // 供 console 除錯／測試直接餵文字（跳過錄音）
  VoiceCards.handleEquityText = handleEquityText;
  VoiceCards.handleHeroText = handleHeroText;
  VoiceCards.handleStreetsText = handleStreetsText;
  VoiceCards.handleHandAll = handleHandAll;
  VoiceCards.handleOppsText = handleOppsText;
  VoiceCards.handleShowsText = handleShowsText;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
