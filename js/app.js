/* 撲克工具箱 UI：tabs + 記帳 + Equity UI + ICM UI */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var TYPE_NAMES = { cash: '現金局', mtt: 'MTT', sng: 'SNG' };

  /* ================= Tabs ================= */
  $('#tabNav').addEventListener('click', function (e) {
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    $$('.tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab);
    });
    if (btn.dataset.tab === 'tracker') drawChart(); // canvas 需在可見時重繪
  });

  /* ================= Tab 1: 記帳 ================= */
  var STORAGE_KEY = 'poker.sessions';

  function loadSessions() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveSessions(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  var sessions = loadSessions();

  function fmtMoney(n) {
    var s = Math.abs(n).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
    return (n < 0 ? '-' : '') + s;
  }
  function fmtPL(n) {
    return (n > 0 ? '+' : '') + fmtMoney(n);
  }

  // 新增
  $('#fDate').value = new Date().toISOString().slice(0, 10);
  $('#sessionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: $('#fDate').value,
      type: $('#fType').value,
      venue: $('#fVenue').value.trim(),
      buyin: parseFloat($('#fBuyin').value) || 0,
      cashout: parseFloat($('#fCashout').value) || 0,
      note: $('#fNote').value.trim()
    };
    sessions.push(rec);
    saveSessions(sessions);
    $('#fVenue').value = ''; $('#fBuyin').value = ''; $('#fCashout').value = ''; $('#fNote').value = '';
    renderTracker();
  });

  // 篩選
  $('#filterType').addEventListener('change', renderList);

  function renderList() {
    var filter = $('#filterType').value;
    var ul = $('#sessionList');
    ul.innerHTML = '';
    var shown = sessions
      .filter(function (r) { return filter === 'all' || r.type === filter; })
      .slice()
      .sort(function (a, b) {
        return b.date < a.date ? -1 : b.date > a.date ? 1 : (b.id < a.id ? -1 : 1);
      });
    if (!shown.length) {
      ul.innerHTML = '<li class="empty-msg">尚無紀錄</li>';
      return;
    }
    shown.forEach(function (r) {
      var pl = r.cashout - r.buyin;
      var li = document.createElement('li');
      li.className = 'session-item';
      var main = document.createElement('div');
      main.className = 'session-main';
      var title = document.createElement('div');
      title.className = 'session-title';
      var badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = TYPE_NAMES[r.type] || r.type;
      title.appendChild(badge);
      title.appendChild(document.createTextNode(r.date + (r.venue ? ' · ' + r.venue : '')));
      var sub = document.createElement('div');
      sub.className = 'session-sub';
      sub.textContent = '買入 ' + fmtMoney(r.buyin) + ' → 兌現 ' + fmtMoney(r.cashout) +
        (r.note ? ' ｜ ' + r.note : '');
      main.appendChild(title);
      main.appendChild(sub);
      var plEl = document.createElement('span');
      plEl.className = 'session-pl ' + (pl > 0 ? 'pos' : pl < 0 ? 'neg' : 'muted');
      plEl.textContent = fmtPL(pl);
      var del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.setAttribute('aria-label', '刪除');
      del.addEventListener('click', function () {
        if (!confirm('刪除這筆紀錄？')) return;
        sessions = sessions.filter(function (x) { return x.id !== r.id; });
        saveSessions(sessions);
        renderTracker();
      });
      li.appendChild(main); li.appendChild(plEl); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function statsFor(list, isTourney) {
    var n = list.length, buyin = 0, pl = 0, itm = 0;
    list.forEach(function (r) {
      buyin += r.buyin;
      pl += r.cashout - r.buyin;
      if (r.cashout > 0) itm++;
    });
    return {
      n: n, buyin: buyin, pl: pl,
      roi: buyin > 0 ? pl / buyin * 100 : null,
      itm: (isTourney && n > 0) ? itm / n * 100 : null
    };
  }

  function renderStats() {
    var cats = [
      ['現金局', sessions.filter(function (r) { return r.type === 'cash'; }), false],
      ['MTT', sessions.filter(function (r) { return r.type === 'mtt'; }), true],
      ['SNG', sessions.filter(function (r) { return r.type === 'sng'; }), true],
      ['總計', sessions, false]
    ];
    var html = '<tr><th>類別</th><th>場次</th><th>總買入</th><th>總盈虧</th><th>ROI%</th><th>ITM%</th></tr>';
    cats.forEach(function (c) {
      var s = statsFor(c[1], c[2]);
      var plCls = s.pl > 0 ? 'pos' : s.pl < 0 ? 'neg' : 'muted';
      html += '<tr><td>' + c[0] + '</td><td>' + s.n + '</td><td>' + fmtMoney(s.buyin) +
        '</td><td class="' + plCls + '">' + fmtPL(s.pl) + '</td><td>' +
        (s.roi === null ? '—' : s.roi.toFixed(1)) + '</td><td>' +
        (s.itm === null ? '—' : s.itm.toFixed(1)) + '</td></tr>';
    });
    $('#statsTable').innerHTML = html;
  }

  /* --- 累積盈虧折線圖（手刻 canvas） --- */
  function drawChart() {
    var canvas = $('#plChart');
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
    var cssH = 220;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    var ordered = sessions.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1);
    });
    var pts = [0], cum = 0;
    ordered.forEach(function (r) { cum += r.cashout - r.buyin; pts.push(cum); });

    var padL = 46, padR = 10, padT = 12, padB = 22;
    var w = cssW - padL - padR, h = cssH - padT - padB;
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    min -= span * 0.08; max += span * 0.08;

    function x(i) { return padL + (pts.length === 1 ? 0 : i / (pts.length - 1) * w); }
    function y(v) { return padT + (max - v) / (max - min) * h; }

    // 格線 + Y 軸標籤
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#8b91a3';
    ctx.strokeStyle = '#333848';
    ctx.lineWidth = 1;
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var v = min + (max - min) * t / ticks;
      var yy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(cssW - padR, yy); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(v).toLocaleString(), padL - 6, yy + 3);
    }
    // 零線
    if (min < 0 && max > 0) {
      ctx.strokeStyle = '#8b91a3';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y(0)); ctx.lineTo(cssW - padR, y(0)); ctx.stroke();
      ctx.setLineDash([]);
    }
    // X 軸標籤（場次）
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b91a3';
    ctx.fillText('0', x(0), cssH - 6);
    if (pts.length > 1) ctx.fillText(String(pts.length - 1) + ' 場', x(pts.length - 1), cssH - 6);

    if (pts.length < 2) {
      ctx.textAlign = 'center';
      ctx.fillText('新增紀錄後顯示走勢', cssW / 2, cssH / 2);
      return;
    }
    // 折線
    ctx.strokeStyle = cum >= 0 ? '#3ecf7a' : '#ff5c6c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(function (v, i) {
      if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
    // 終點
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(x(pts.length - 1), y(cum), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  window.addEventListener('resize', drawChart);

  function renderTracker() {
    renderList();
    renderStats();
    drawChart();
  }

  /* --- 匯出 / 匯入 --- */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function csvEscape(s) {
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  $('#btnExportCsv').addEventListener('click', function () {
    var rows = [['日期', '類型', '場地', '買入', '兌現', '盈虧', '備註']];
    sessions.forEach(function (r) {
      rows.push([r.date, TYPE_NAMES[r.type] || r.type, r.venue, r.buyin, r.cashout,
        r.cashout - r.buyin, r.note]);
    });
    var csv = '\uFEFF' + rows.map(function (row) { return row.map(csvEscape).join(','); }).join('\r\n');
    download('poker-sessions.csv', csv, 'text/csv;charset=utf-8');
  });
  $('#btnExportJson').addEventListener('click', function () {
    download('poker-sessions.json', JSON.stringify(sessions, null, 2), 'application/json');
  });
  $('#btnImportJson').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('not array');
        var valid = arr.filter(function (r) {
          return r && r.date && r.type && typeof r.buyin === 'number' && typeof r.cashout === 'number';
        });
        valid.forEach(function (r) {
          if (!r.id) r.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        });
        if (!confirm('匯入 ' + valid.length + ' 筆紀錄？（將加到現有紀錄後）')) return;
        sessions = sessions.concat(valid);
        saveSessions(sessions);
        renderTracker();
      } catch (e) {
        alert('匯入失敗：JSON 格式錯誤');
      }
    };
    reader.readAsText(f);
    this.value = '';
  });

  renderTracker();

  /* ================= Tab 2: 現金局 EV ================= */
  var SLOT_ORDER = ['hero0', 'hero1', 'villain0', 'villain1',
    'board0', 'board1', 'board2', 'board3', 'board4'];
  var slotCards = {}; // slotName -> card int
  var activeSlot = 'hero0';
  var lastEquity = null;

  // 牌桌 grid：4 花色 × 13 rank
  (function buildDeckGrid() {
    var grid = $('#deckGrid');
    var suits = ['s', 'h', 'd', 'c'];
    suits.forEach(function (su) {
      for (var ri = 12; ri >= 0; ri--) {
        var rank = Evaluator.RANKS[ri];
        var code = rank + su;
        var btn = document.createElement('button');
        btn.className = 'deck-card suit-' + su;
        btn.dataset.card = code;
        btn.innerHTML = rank + '<small>' + Evaluator.SUIT_SYMBOLS[su] + '</small>';
        btn.addEventListener('click', onDeckCardClick);
        grid.appendChild(btn);
      }
    });
  })();

  function cardLabel(cardInt) {
    var s = Evaluator.cardToString(cardInt);
    var su = s[1];
    var red = (su === 'h' || su === 'd');
    return '<span class="' + (red ? 'red' : '') + '">' + s[0] + Evaluator.SUIT_SYMBOLS[su] + '</span>';
  }

  function refreshCardUI() {
    var usedSet = {};
    SLOT_ORDER.forEach(function (name) {
      if (slotCards[name] !== undefined) usedSet[Evaluator.cardToString(slotCards[name])] = true;
    });
    $$('.deck-card').forEach(function (b) {
      b.classList.toggle('used', !!usedSet[b.dataset.card]);
    });
    $$('.card-slot').forEach(function (b) {
      var name = b.dataset.slot;
      if (slotCards[name] !== undefined) {
        b.classList.add('filled');
        b.innerHTML = cardLabel(slotCards[name]);
      } else {
        b.classList.remove('filled');
        b.textContent = '?';
      }
      b.classList.toggle('active', name === activeSlot);
    });
  }

  function nextEmptySlot(from) {
    var start = SLOT_ORDER.indexOf(from);
    for (var i = 1; i <= SLOT_ORDER.length; i++) {
      var name = SLOT_ORDER[(start + i) % SLOT_ORDER.length];
      if (slotCards[name] === undefined) return name;
    }
    return from;
  }

  function onDeckCardClick(e) {
    var code = e.currentTarget.dataset.card;
    slotCards[activeSlot] = Evaluator.cardFromString(code);
    activeSlot = nextEmptySlot(activeSlot);
    refreshCardUI();
  }

  $$('.card-slot').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.dataset.slot;
      if (activeSlot === name && slotCards[name] !== undefined) {
        delete slotCards[name]; // 再點一次已選中的格子 = 清除該張
      } else {
        activeSlot = name;
      }
      refreshCardUI();
    });
  });

  $('#btnClearCards').addEventListener('click', function () {
    slotCards = {};
    activeSlot = 'hero0';
    lastEquity = null;
    $('#equityResult').hidden = true;
    refreshCardUI();
    renderEV();
  });

  $('#btnCalcEquity').addEventListener('click', function () {
    var hero = [slotCards.hero0, slotCards.hero1];
    var villain = [slotCards.villain0, slotCards.villain1];
    if (hero.some(function (c) { return c === undefined; }) ||
        villain.some(function (c) { return c === undefined; })) {
      alert('請先選滿 Hero 與 Villain 各 2 張手牌');
      return;
    }
    var board = [];
    for (var i = 0; i < 5; i++) {
      var c = slotCards['board' + i];
      if (c !== undefined) board.push(c);
    }
    if (board.length === 1 || board.length === 2) {
      alert('公牌需為 0（翻前）、3、4 或 5 張');
      return;
    }
    var btn = $('#btnCalcEquity');
    btn.disabled = true;
    btn.textContent = '計算中…';
    setTimeout(function () {
      try {
        var res = EquityLib.computeEquity(hero, villain, board, 50000);
        lastEquity = res;
        $('#equityResult').hidden = false;
        $('#eqHeroBar').style.width = (res.hero * 100) + '%';
        $('#eqTieBar').style.width = (res.tie * 100) + '%';
        $('#eqVillainBar').style.width = (res.villain * 100) + '%';
        $('#eqHeroTxt').textContent = 'Hero ' + (res.hero * 100).toFixed(1) + '%';
        $('#eqTieTxt').textContent = '平手 ' + (res.tie * 100).toFixed(1) + '%';
        $('#eqVillainTxt').textContent = 'Villain ' + (res.villain * 100).toFixed(1) + '%';
        $('#eqMethodTxt').textContent = res.method === 'exact'
          ? '窮舉 ' + res.trials.toLocaleString() + ' 種發牌'
          : 'Monte Carlo 模擬 ' + res.trials.toLocaleString() + ' 次（誤差約 ±0.5%）';
        renderEV();
      } catch (err) {
        alert('計算失敗：' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '計算勝率';
      }
    }, 30);
  });

  function renderEV() {
    var box = $('#evResult');
    var pot = parseFloat($('#fPot').value);
    var call = parseFloat($('#fCall').value);
    if (!lastEquity) {
      box.textContent = '先計算勝率，再輸入底池與跟注金額。';
      return;
    }
    if (!(pot >= 0) || !(call > 0)) {
      box.textContent = 'Hero 勝率 ' + (lastEquity.hero * 100).toFixed(1) +
        '%。輸入底池與需跟注金額即可算 EV。';
      return;
    }
    var ev = EquityLib.callEV(lastEquity.hero, pot, call);
    var needed = call / (pot + call) * 100;
    var verdict = ev >= 0
      ? '<span class="pos">✔ +EV 跟注</span>'
      : '<span class="neg">✘ −EV 蓋牌</span>';
    box.innerHTML =
      '跟注 EV = ' + (lastEquity.hero * 100).toFixed(1) + '% × (' + pot + ' + ' + call +
      ') − ' + call + ' = <b class="' + (ev >= 0 ? 'pos' : 'neg') + '">' + fmtPL(Math.round(ev * 100) / 100) + '</b><br>' +
      '所需勝率（底池賠率）：' + needed.toFixed(1) + '%<br>' + verdict;
  }
  $('#fPot').addEventListener('input', renderEV);
  $('#fCall').addEventListener('input', renderEV);

  refreshCardUI();

  /* ================= Tab 3: ICM ================= */
  function makeRow(container, opts) {
    var row = document.createElement('div');
    row.className = 'dyn-row';
    if (opts.label !== undefined) {
      var lab = document.createElement('span');
      lab.className = 'row-label';
      lab.textContent = opts.label;
      row.appendChild(lab);
    }
    opts.inputs.forEach(function (inp) {
      var el = document.createElement('input');
      el.type = inp.type || 'number';
      el.placeholder = inp.placeholder || '';
      el.className = inp.cls || '';
      if (inp.type !== 'text') { el.inputMode = 'decimal'; el.min = '0'; el.step = 'any'; }
      if (inp.value !== undefined) el.value = inp.value;
      row.appendChild(el);
    });
    var del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.addEventListener('click', function () {
      row.remove();
      if (opts.onRemove) opts.onRemove();
    });
    row.appendChild(del);
    container.appendChild(row);
    return row;
  }

  function relabelPayouts() {
    $$('#payoutRows .dyn-row').forEach(function (row, i) {
      row.querySelector('.row-label').textContent = '第 ' + (i + 1) + ' 名';
    });
  }
  function addPayoutRow(value) {
    if ($$('#payoutRows .dyn-row').length >= ICM.MAX_PLACES) {
      alert('最多計算前 ' + ICM.MAX_PLACES + ' 名獎金');
      return;
    }
    makeRow($('#payoutRows'), {
      label: '',
      inputs: [{ placeholder: '獎金', cls: 'payout-input', value: value }],
      onRemove: relabelPayouts
    });
    relabelPayouts();
  }
  function addPlayerRow(name, stack) {
    if ($$('#playerRows .dyn-row').length >= ICM.MAX_PLAYERS) {
      alert('最多 ' + ICM.MAX_PLAYERS + ' 位玩家');
      return;
    }
    makeRow($('#playerRows'), {
      inputs: [
        { type: 'text', placeholder: '名字（選填）', cls: 'name-input', value: name },
        { placeholder: '籌碼', cls: 'stack-input', value: stack }
      ]
    });
  }
  $('#btnAddPayout').addEventListener('click', function () { addPayoutRow(); });
  $('#btnAddPlayer').addEventListener('click', function () { addPlayerRow(); });

  // 預設範例
  addPayoutRow(50); addPayoutRow(30); addPayoutRow(20);
  addPlayerRow('', 5000); addPlayerRow('', 3000); addPlayerRow('', 2000);

  function readPayouts() {
    return $$('#payoutRows .payout-input')
      .map(function (el) { return parseFloat(el.value); })
      .filter(function (v) { return v > 0; });
  }
  function readIcmPlayers() {
    var players = [];
    $$('#playerRows .dyn-row').forEach(function (row, i) {
      var stack = parseFloat(row.querySelector('.stack-input').value);
      if (stack > 0) {
        players.push({
          name: row.querySelector('.name-input').value.trim() || ('玩家 ' + (i + 1)),
          stack: stack
        });
      }
    });
    return players;
  }

  $('#btnCalcIcm').addEventListener('click', function () {
    var payouts = readPayouts();
    var players = readIcmPlayers();
    if (!payouts.length) { alert('請至少輸入一個獎金'); return; }
    if (players.length < 2) { alert('請至少輸入 2 位玩家籌碼'); return; }
    var evs;
    try {
      evs = ICM.icmEV(players.map(function (p) { return p.stack; }), payouts);
    } catch (err) {
      alert(err.message);
      return;
    }
    var totalChips = players.reduce(function (a, p) { return a + p.stack; }, 0);
    var pool = payouts.reduce(function (a, b) { return a + b; }, 0);
    var html = '<tr><th>玩家</th><th>籌碼</th><th>籌碼%</th><th>ICM $EV</th><th>占獎池%</th></tr>';
    players
      .map(function (p, i) { return { p: p, ev: evs[i] }; })
      .sort(function (a, b) { return b.p.stack - a.p.stack; })
      .forEach(function (x) {
        html += '<tr><td>' + escapeHtml(x.p.name) + '</td><td>' +
          x.p.stack.toLocaleString() + '</td><td>' +
          (x.p.stack / totalChips * 100).toFixed(1) + '</td><td>' +
          x.ev.toFixed(2) + '</td><td>' +
          (x.ev / pool * 100).toFixed(1) + '</td></tr>';
      });
    html += '<tr><td><b>合計</b></td><td>' + totalChips.toLocaleString() +
      '</td><td>100.0</td><td>' + pool.toFixed(2) + '</td><td>100.0</td></tr>';
    $('#icmTable').innerHTML = html;
    $('#icmResultCard').hidden = false;
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ================= Tab 3b: Push/Fold 決策 ================= */
  function refreshPfSelects() {
    var players = readIcmPlayers();
    [['#pfHero', 0], ['#pfCaller', 1]].forEach(function (pair) {
      var sel = $(pair[0]);
      var prev = sel.value;
      sel.innerHTML = '';
      players.forEach(function (p, i) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = p.name + '（' + p.stack.toLocaleString() + '）';
        sel.appendChild(opt);
      });
      // 盡量保留原選擇，否則預設 hero=第1位、caller=第2位
      if (prev !== '' && +prev < players.length) sel.value = prev;
      else if (players.length > pair[1]) sel.value = String(pair[1]);
    });
  }
  $('#pfHero').addEventListener('focus', refreshPfSelects);
  $('#pfCaller').addEventListener('focus', refreshPfSelects);
  refreshPfSelects();

  $('#btnCalcPf').addEventListener('click', function () {
    var payouts = readPayouts();
    var players = readIcmPlayers();
    if (!payouts.length) { alert('請先在上方輸入獎金結構'); return; }
    if (players.length < 2 || players.length > 9) {
      alert('Push/Fold 需要 2–9 位玩家（請確認上方玩家籌碼）');
      return;
    }
    var heroIdx = parseInt($('#pfHero').value, 10);
    var callerIdx = parseInt($('#pfCaller').value, 10);
    if (isNaN(heroIdx) || isNaN(callerIdx) ||
        heroIdx >= players.length || callerIdx >= players.length) {
      refreshPfSelects();
      alert('玩家清單已變動，請重新選擇 Hero 與跟注者');
      return;
    }
    if (heroIdx === callerIdx) { alert('Hero 與跟注者不能是同一人'); return; }
    var callPct = parseFloat($('#pfRange').value);
    if (!(callPct > 0 && callPct <= 100)) { alert('跟注 range 請輸入 0–100 的百分比'); return; }

    var res;
    try {
      res = PushFold.computeShoveEV({
        stacks: players.map(function (p) { return p.stack; }),
        payouts: payouts,
        heroIdx: heroIdx,
        callerIdx: callerIdx,
        hand: $('#pfHand').value,
        callPct: callPct,
        sb: parseFloat($('#pfSb').value) || 0,
        bb: parseFloat($('#pfBb').value) || 0,
        ante: parseFloat($('#pfAnte').value) || 0,
        heroPos: $('#pfHeroPos').value,
        callerPos: $('#pfCallerPos').value
      });
    } catch (err) {
      alert(err.message);
      return;
    }

    var d = Math.round(res.diff * 100) / 100;
    var verdictHtml = res.verdict === 'SHOVE'
      ? '<span class="pos">✔ 推薦 SHOVE（多 ' + fmtPL(d) + '）</span>'
      : '<span class="neg">✘ 推薦 FOLD（全下少 ' + fmtPL(d) + '）</span>';
    var box = $('#pfResult');
    box.hidden = false;
    box.innerHTML =
      '手牌 <b>' + escapeHtml(res.hand) + '</b> ｜ 跟注 range 前 ' + callPct + '%（' +
      res.rangeClasses.length + ' 類 / ' + res.rangeCombos + ' combo）<br>' +
      'P(被跟注) = ' + (res.pCall * 100).toFixed(1) + '%，被跟注時勝率 = ' +
      (res.equity * 100).toFixed(1) + '%<br>' +
      '蓋牌 $EV = <b>' + res.foldEV.toFixed(2) + '</b><br>' +
      '全下 $EV = <b class="' + (res.diff >= 0 ? 'pos' : 'neg') + '">' + res.shoveEV.toFixed(2) +
      '</b>（全蓋 ' + res.evAllFold.toFixed(2) +
      ' ／ 被跟注且贏 ' + res.evWin.toFixed(2) +
      ' ／ 被跟注且輸 ' + res.evLose.toFixed(2) + '）<br>' +
      '差異 ' + fmtPL(d) + ' → ' + verdictHtml;
  });
})();
