/* 關鍵手牌複盤：底池賠率 / EV / 決策評估（純邏輯，UI 在 app.js）
 *
 * 模型（簡化）：
 * - 跟注 EV(bb) = equity × (pot + toCall) − toCall；蓋牌 EV = 0。
 * - 加注 / 全下只顯示 vs range 的 equity 與「視同跟注」的 EV，
 *   未計 fold equity（對手蓋牌的價值），僅供參考。
 * - equity 用 equity.js computeEquityVsCombos（含 blocker），
 *   range 用 pushfold.js rangeFromNotation 記號展開。
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Evaluator = isNode ? require('./evaluator.js') : global.Evaluator;
  var EquityLib = isNode ? require('./equity.js') : global.EquityLib;
  var PushFold = isNode ? require('./pushfold.js') : global.PushFold;

  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var STREET_NAMES = { preflop: t('翻前'), flop: t('翻牌'), turn: t('轉牌'), river: t('河牌') };
  var BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 };
  var ACTION_NAMES = { fold: t('蓋牌'), call: t('跟注'), raise: t('加注'), allin: t('全下') };

  /* 解析牌組字串："As Kd"、"AsKd"、"Qh 7d 2s" → card int 陣列
   * expected 給定時強制張數；一律檢查重複。 */
  function parseCards(str, expected) {
    var s = String(str == null ? '' : str).trim();
    var toks = s ? s.split(/[\s,]+/) : [];
    // 連寫形式 "AsKd" → 兩兩拆開
    var flat = [];
    toks.forEach(function (t) {
      if (t.length > 2 && t.length % 2 === 0) {
        for (var i = 0; i < t.length; i += 2) flat.push(t.slice(i, i + 2));
      } else {
        flat.push(t);
      }
    });
    var out = flat.map(function (t) { return Evaluator.cardFromString(t); });
    if (expected !== undefined && out.length !== expected) {
      throw new Error(t('需要 ') + expected + t(' 張牌，收到 ') + out.length + t(' 張：') + s);
    }
    var seen = {};
    out.forEach(function (c) {
      if (seen[c]) throw new Error(t('牌重複：') + Evaluator.cardToString(c));
      seen[c] = true;
    });
    return out;
  }

  /* 底池賠率 = 需跟注 / (底池 + 需跟注)，即跟注所需最低勝率 */
  function potOdds(pot, toCall) {
    if (!(pot >= 0) || !(toCall >= 0)) throw new Error(t('底池 / 跟注需為非負數'));
    if (toCall === 0) return 0;
    return toCall / (pot + toCall);
  }

  /* 跟注 EV（bb）= equity × (pot + toCall) − toCall */
  function callEVbb(equity, pot, toCall) {
    return equity * (pot + toCall) - toCall;
  }

  /* 決策評估。
   * @param {string} action fold|call|raise|allin
   * @param {number} equity 對 range 的實際勝率 (0-1)
   * @param {number} pot    行動前底池 (bb)
   * @param {number} toCall 需跟注 (bb)
   * @returns {{action,equity,needed,evBB,verdict,leak,simplified}}
   * verdict: good_call / bad_call / good_fold / missed_call / raise_ahead / raise_behind */
  function classifyDecision(action, equity, pot, toCall) {
    if (['fold', 'call', 'raise', 'allin'].indexOf(action) === -1) {
      throw new Error(t('未知行動：') + action);
    }
    if (!(equity >= 0 && equity <= 1)) throw new Error(t('equity 需在 0–1'));
    var needed = potOdds(pot, toCall);
    var res = { action: action, equity: equity, needed: needed,
                evBB: 0, verdict: '', leak: false, simplified: false };
    if (action === 'fold') {
      res.evBB = 0;
      if (toCall > 0 && equity > needed) { res.verdict = 'missed_call'; res.leak = true; }
      else res.verdict = 'good_fold';
    } else if (action === 'call') {
      res.evBB = callEVbb(equity, pot, toCall);
      if (res.evBB >= 0) res.verdict = 'good_call';
      else { res.verdict = 'bad_call'; res.leak = true; }
    } else { // raise / allin：簡化模型，未計 fold equity
      res.evBB = callEVbb(equity, pot, toCall);
      res.simplified = true;
      res.verdict = equity >= 0.5 ? 'raise_ahead' : 'raise_behind';
    }
    return res;
  }

  function verdictText(verdict) {
    return {
      good_call: t('✔ +EV 跟注'),
      bad_call: t('✘ −EV 跟注（leak）'),
      good_fold: t('✔ 合理蓋牌'),
      missed_call: t('✘ 錯過 +EV 跟注（leak）'),
      raise_ahead: t('加注時 vs range 領先（未計 fold equity）'),
      raise_behind: t('加注時 vs range 落後 — 需靠 fold equity（未計）')
    }[verdict] || verdict;
  }

  /* 單一街的完整分析：equity vs range → 決策評估。
   * @param {object} o {heroCards:[int,int], board:int[], range:string,
   *                    pot:number, toCall:number, action:string, mcIters?:number} */
  function analyzeStreet(o) {
    if (BOARD_LEN[o.street] !== undefined && o.board.length !== BOARD_LEN[o.street]) {
      throw new Error(STREET_NAMES[o.street] + t(' 公牌需 ') + BOARD_LEN[o.street] + t(' 張'));
    }
    var classes = PushFold.rangeFromNotation(o.range);
    if (!classes.length) throw new Error(t('range 是空的'));
    var combos = [];
    classes.forEach(function (ci) {
      PushFold.expandCombos(ci).forEach(function (vc) { combos.push(vc); });
    });
    var eq = EquityLib.computeEquityVsCombos(o.heroCards, combos, o.board, o.mcIters || 20000);
    var res = classifyDecision(o.action, eq.hero, o.pot, o.toCall);
    res.tie = eq.tie;
    res.combos = eq.combos;
    res.method = eq.method;
    res.rangeClasses = classes.length;
    return res;
  }

  /* Leak 摘要：統計已存手牌各街的 −EV 跟注 / 錯過 +EV 跟注次數 */
  function leakSummary(hands) {
    var out = { decisions: 0, badCalls: 0, missedCalls: 0, byStreet: {} };
    STREETS.forEach(function (s) {
      out.byStreet[s] = { decisions: 0, badCalls: 0, missedCalls: 0 };
    });
    (hands || []).forEach(function (h) {
      (h.streets || []).forEach(function (st) {
        var a = st.analysis;
        if (!a || !out.byStreet[st.street]) return;
        out.decisions++;
        out.byStreet[st.street].decisions++;
        if (a.verdict === 'bad_call') { out.badCalls++; out.byStreet[st.street].badCalls++; }
        if (a.verdict === 'missed_call') { out.missedCalls++; out.byStreet[st.street].missedCalls++; }
      });
    });
    return out;
  }

  /* ---- 匯出與列表工具（2026-08-15，手牌記錄精靈）---- */
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };

  /* "As Kd" / "AsKd" → "A♠ K♦"；解析不了的 token 原樣保留 */
  function prettyCards(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return '';
    var toks = s.split(/[\s,]+/), flat = [];
    toks.forEach(function (tk) {
      if (tk.length > 2 && tk.length % 2 === 0) {
        for (var i = 0; i < tk.length; i += 2) flat.push(tk.slice(i, i + 2));
      } else flat.push(tk);
    });
    return flat.map(function (tk) {
      var m = /^([2-9tjqka10]{1,2})([shdc])$/i.exec(tk);
      if (!m) return tk;
      return m[1].toUpperCase().replace('10', 'T') + SUIT_SYM[m[2].toLowerCase()];
    }).join(' ');
  }

  /* 手牌純文字匯出（PokerAlpha 式）。rec 欄位缺的行自動略過；
     street.analysis 沒有時只列動作不列評估。 */
  function handToText(rec) {
    var L = [];
    L.push(rec.date || '');
    var head = (rec.gtype === 'mtt' ? t('錦標賽') : t('現金局')) +
      (rec.name ? ' ' + rec.name : '');
    L.push(head);
    if (rec.players) L.push(t('桌上人數：') + rec.players + t(' 人'));
    if (rec.blinds) L.push(t('盲注：') + rec.blinds + (rec.ante ? t('（前注 ') + rec.ante + t('）') : ''));
    if (rec.stack) L.push(t('有效籌碼：') + rec.stack + ' bb');
    L.push(t('我：') + rec.pos + ' ' + prettyCards(rec.hero));
    if (rec.opps && rec.opps.length) {
      L.push('');
      L.push(t('對手'));
      rec.opps.forEach(function (o) {
        L.push(o.pos + (o.stack ? t('：籌碼 ') + o.stack + ' bb' : ''));
      });
    }
    (rec.streets || []).forEach(function (st) {
      L.push('');
      L.push(STREET_NAMES[st.street] +
        (st.boardTxt ? '  ' + prettyCards(st.boardTxt) : '') +
        t('｜底池 ') + st.pot + ' bb' +
        (st.toCall ? t('｜需跟注 ') + st.toCall + ' bb' : ''));
      L.push(t('行動：') + ACTION_NAMES[st.action] + t('｜對手 range：') + st.range);
      if (st.analysis) {
        L.push(t('需要勝率 ') + (st.analysis.needed * 100).toFixed(1) +
          t('% vs 實際 ') + (st.analysis.equity * 100).toFixed(1) + '% → ' +
          verdictText(st.analysis.verdict));
      }
    });
    if (rec.showdown && rec.showdown.length) {
      L.push('');
      L.push(t('攤牌'));
      rec.showdown.forEach(function (sd) {
        L.push(sd.pos + t('：') + prettyCards(sd.cards));
      });
    }
    if (rec.result !== null && rec.result !== undefined) {
      L.push('');
      L.push(t('結果：') + (rec.result > 0 ? '+' : '') + rec.result + ' bb');
    }
    if (rec.note) L.push(t('備註：') + rec.note);
    return L.join('\n');
  }

  /* 列表時間分組：回傳分組代碼（顯示文字由 UI 層翻譯）。
     today / yesterday / thisweek / lastweek / thismonth / 'YYYY-MM'。週一起算。 */
  function dateBucket(dateStr, todayStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return 'unknown';
    var d = new Date(dateStr + 'T00:00:00Z');
    var now = new Date(todayStr + 'T00:00:00Z');
    var diff = Math.round((now - d) / 864e5);
    if (diff <= 0 && diff > -1) return 'today';
    if (diff === 1) return 'yesterday';
    /* 本週起點（週一） */
    var dow = (now.getUTCDay() + 6) % 7; // 週一=0
    if (diff > 1 && diff <= dow) return 'thisweek';
    if (diff > dow && diff <= dow + 7) return 'lastweek';
    if (dateStr.slice(0, 7) === todayStr.slice(0, 7)) return 'thismonth';
    return dateStr.slice(0, 7);
  }

  var HANDS = {
    STREETS: STREETS,
    STREET_NAMES: STREET_NAMES,
    BOARD_LEN: BOARD_LEN,
    ACTION_NAMES: ACTION_NAMES,
    parseCards: parseCards,
    potOdds: potOdds,
    callEVbb: callEVbb,
    classifyDecision: classifyDecision,
    verdictText: verdictText,
    analyzeStreet: analyzeStreet,
    leakSummary: leakSummary,
    prettyCards: prettyCards,
    handToText: handToText,
    dateBucket: dateBucket
  };
  if (isNode) module.exports = HANDS;
  else global.HANDS = HANDS;
})(typeof window !== 'undefined' ? window : this);
