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
      hours: parseFloat($('#fHours').value) || 0,
      bb: parseFloat($('#fBB').value) || 0,
      note: $('#fNote').value.trim()
    };
    sessions.push(rec);
    saveSessions(sessions);
    $('#fVenue').value = ''; $('#fBuyin').value = ''; $('#fCashout').value = '';
    $('#fHours').value = ''; $('#fBB').value = ''; $('#fNote').value = '';
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
        (r.hours ? ' ｜ ' + r.hours + ' 小時' : '') +
        (r.bb ? ' ｜ 大盲 ' + r.bb : '') +
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

  /* --- 進階統計：時薪 / 變異數 / 回撤 / 資金建議 --- */
  function advStats(list) {
    var n = list.length;
    var pls = list.map(function (r) { return r.cashout - r.buyin; });
    var sum = pls.reduce(function (a, b) { return a + b; }, 0);
    var mean = n ? sum / n : 0;
    var variance = 0;
    if (n >= 2) {
      pls.forEach(function (p) { variance += (p - mean) * (p - mean); });
      variance /= (n - 1);
    }
    var sd = Math.sqrt(variance);
    // 最大回撤（依日期順序的累積盈虧）
    var ordered = list.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1);
    });
    var cum = 0, peak = 0, maxDD = 0;
    ordered.forEach(function (r) {
      cum += r.cashout - r.buyin;
      if (cum > peak) peak = cum;
      if (peak - cum > maxDD) maxDD = peak - cum;
    });
    var hours = 0, plHr = 0;
    list.forEach(function (r) { if (r.hours > 0) { hours += r.hours; plHr += r.cashout - r.buyin; } });
    // 現金局 bb 統計：需同時填大盲與時數
    var bbSum = 0, bbHours = 0;
    list.forEach(function (r) {
      if (r.type === 'cash' && r.bb > 0 && r.hours > 0) {
        bbSum += (r.cashout - r.buyin) / r.bb;
        bbHours += r.hours;
      }
    });
    return { n: n, mean: mean, sd: sd, maxDD: maxDD, hours: hours,
             hourly: hours > 0 ? plHr / hours : null,
             bbPerHr: bbHours > 0 ? bbSum / bbHours : null };
  }

  function renderAdvStats() {
    var s = advStats(sessions);
    var tbl = $('#advStatsTable'), hint = $('#advStatsHint');
    if (s.n < 2) {
      tbl.innerHTML = '';
      hint.textContent = '至少 2 筆紀錄後顯示。填時數可算時薪。';
      return;
    }
    function row(k, v, cls) {
      return '<tr><td>' + k + '</td><td class="' + (cls || '') + '">' + v + '</td></tr>';
    }
    var html = '<tr><th>指標</th><th>數值</th></tr>';
    html += row('每場平均盈虧', fmtPL(Math.round(s.mean * 100) / 100),
      s.mean > 0 ? 'pos' : s.mean < 0 ? 'neg' : 'muted');
    html += row('每場標準差 σ', fmtMoney(Math.round(s.sd * 100) / 100));
    html += row('最大回撤', s.maxDD > 0 ? '-' + fmtMoney(Math.round(s.maxDD * 100) / 100) : '0',
      s.maxDD > 0 ? 'neg' : 'muted');
    html += row('時薪（有填時數的場次）',
      s.hourly === null ? '—（未填時數）' : fmtPL(Math.round(s.hourly * 100) / 100) + ' /hr',
      s.hourly === null ? 'muted' : s.hourly > 0 ? 'pos' : 'neg');
    if (s.bbPerHr !== null) {
      var bb100 = s.bbPerHr / 30 * 100; // 現場約 30 手/小時
      html += row('現金局 bb/hr', fmtPL(Math.round(s.bbPerHr * 100) / 100),
        s.bbPerHr > 0 ? 'pos' : 'neg');
      html += row('現金局 bb/100（估）', fmtPL(Math.round(bb100 * 10) / 10),
        bb100 > 0 ? 'pos' : 'neg');
    } else {
      html += row('現金局 bb/hr', '—（現金局需填大盲＋時數）', 'muted');
    }
    if (s.mean > 0 && s.sd > 0) {
      // 破產風險模型：RoR = exp(-2μB/σ²) → B = σ²·ln(1/risk)/(2μ)
      var br5 = s.sd * s.sd * Math.log(20) / (2 * s.mean);
      var br1 = s.sd * s.sd * Math.log(100) / (2 * s.mean);
      html += row('建議資金（破產風險 ≤5%）', fmtMoney(Math.ceil(br5)));
      html += row('建議資金（破產風險 ≤1%）', fmtMoney(Math.ceil(br1)));
      hint.textContent = '資金建議用 Kelly 式破產風險模型 RoR = exp(−2μB/σ²)，' +
        '假設每場盈虧近似常態且 winrate 不變，僅供參考。';
    } else {
      hint.textContent = s.n >= 2 && s.mean <= 0
        ? '平均盈虧 ≤ 0，任何資金長期都會歸零 — 資金建議不適用，先改善 winrate。'
        : '';
    }
    if (s.bbPerHr !== null) {
      hint.textContent += ' bb/100 以現場約 30 手/小時換算，僅供參考。';
    }
    tbl.innerHTML = html;
  }

  /* --- 手牌筆記 --- */
  var NOTES_KEY = 'poker.notes';
  function loadNotes() {
    try {
      var arr = JSON.parse(localStorage.getItem(NOTES_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveNotes(list) { localStorage.setItem(NOTES_KEY, JSON.stringify(list)); }
  var notes = loadNotes();

  function renderNotes() {
    var ul = $('#noteList');
    ul.innerHTML = '';
    if (!notes.length) {
      ul.innerHTML = '<li class="empty-msg">尚無筆記</li>';
      return;
    }
    notes.slice().reverse().forEach(function (nt) {
      var li = document.createElement('li');
      li.className = 'session-item';
      var main = document.createElement('div');
      main.className = 'session-main';
      var title = document.createElement('div');
      title.className = 'session-sub';
      title.textContent = nt.date;
      var body = document.createElement('div');
      body.className = 'session-title note-body';
      body.textContent = nt.text;
      main.appendChild(title); main.appendChild(body);
      var del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.setAttribute('aria-label', '刪除筆記');
      del.addEventListener('click', function () {
        if (!confirm('刪除這則筆記？')) return;
        notes = notes.filter(function (x) { return x.id !== nt.id; });
        saveNotes(notes);
        renderNotes();
      });
      li.appendChild(main); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  $('#btnAddNote').addEventListener('click', function () {
    var txt = $('#noteText').value.trim();
    if (!txt) return;
    notes.push({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: new Date().toISOString().slice(0, 10),
      text: txt
    });
    saveNotes(notes);
    $('#noteText').value = '';
    renderNotes();
  });
  renderNotes();

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
    renderAdvStats();
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
    var rows = [['日期', '類型', '場地', '買入', '兌現', '盈虧', '時數', '大盲', '備註']];
    sessions.forEach(function (r) {
      rows.push([r.date, TYPE_NAMES[r.type] || r.type, r.venue, r.buyin, r.cashout,
        r.cashout - r.buyin, r.hours || '', r.bb || '', r.note]);
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
  var MAX_VILLAINS = 5;
  var villainCount = 1;
  var slotCards = {}; // slotName -> card int
  var activeSlot = 'hero0';
  var lastEquity = null;

  function slotOrder() {
    var order = ['hero0', 'hero1'];
    for (var i = 0; i < villainCount; i++) order.push('v' + i + 'a', 'v' + i + 'b');
    for (var b = 0; b < 5; b++) order.push('board' + b);
    return order;
  }

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
    slotOrder().forEach(function (name) {
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
    var order = slotOrder();
    var start = order.indexOf(from);
    for (var i = 1; i <= order.length; i++) {
      var name = order[(start + i) % order.length];
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

  function bindSlot(b) {
    b.addEventListener('click', function () {
      var name = b.dataset.slot;
      if (activeSlot === name && slotCards[name] !== undefined) {
        delete slotCards[name]; // 再點一次已選中的格子 = 清除該張
      } else {
        activeSlot = name;
      }
      refreshCardUI();
    });
  }
  $$('.card-slot').forEach(bindSlot);

  function renderVillainRows() {
    var box = $('#villainRows');
    box.innerHTML = '';
    for (var i = 0; i < villainCount; i++) {
      var row = document.createElement('div');
      row.className = 'hand-row';
      var label = document.createElement('span');
      label.className = 'hand-label villain';
      label.textContent = villainCount === 1 ? 'Villain' : '對手 ' + (i + 1);
      row.appendChild(label);
      var slots = document.createElement('div');
      slots.className = 'slots';
      ['a', 'b'].forEach(function (suffix) {
        var s = document.createElement('button');
        s.className = 'card-slot';
        s.dataset.slot = 'v' + i + suffix;
        s.textContent = '?';
        bindSlot(s);
        slots.appendChild(s);
      });
      row.appendChild(slots);
      box.appendChild(row);
    }
    $('#btnAddVillain').hidden = villainCount >= MAX_VILLAINS;
    $('#btnDelVillain').hidden = villainCount <= 1;
    refreshCardUI();
  }

  $('#btnAddVillain').addEventListener('click', function () {
    if (villainCount >= MAX_VILLAINS) return;
    villainCount++;
    renderVillainRows();
  });
  $('#btnDelVillain').addEventListener('click', function () {
    if (villainCount <= 1) return;
    villainCount--;
    delete slotCards['v' + villainCount + 'a'];
    delete slotCards['v' + villainCount + 'b'];
    if (slotOrder().indexOf(activeSlot) === -1) activeSlot = 'hero0';
    renderVillainRows();
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
    if (hero.some(function (c) { return c === undefined; })) {
      alert('請先選滿 Hero 2 張手牌');
      return;
    }
    var hands = [hero];
    var names = ['Hero'];
    for (var vi = 0; vi < villainCount; vi++) {
      var a = slotCards['v' + vi + 'a'], b2 = slotCards['v' + vi + 'b'];
      if (a === undefined && b2 === undefined) continue; // 空白對手略過
      if (a === undefined || b2 === undefined) {
        alert('對手 ' + (vi + 1) + ' 只選了 1 張牌，請選滿 2 張或全部清空');
        return;
      }
      hands.push([a, b2]);
      names.push(villainCount === 1 ? 'Villain' : '對手 ' + (vi + 1));
    }
    if (hands.length < 2) {
      alert('至少需要 1 位對手（2 張手牌）');
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
        var res = EquityLib.computeEquityMulti(hands, board, 50000);
        lastEquity = { hero: res.players[0].equity };
        $('#equityResult').hidden = false;
        var rows = $('#eqRows');
        rows.innerHTML = '';
        res.players.forEach(function (p, pi) {
          var div = document.createElement('div');
          div.className = 'eqp-row';
          var pct = (p.equity * 100).toFixed(1);
          div.innerHTML =
            '<div class="eqp-head"><span class="' + (pi === 0 ? 'pos' : 'neg') + '">' + names[pi] + '</span>' +
            '<span><b>' + pct + '%</b>' +
            (p.tie > 0.0005 ? ' <span class="muted">(平手 ' + (p.tie * 100).toFixed(1) + '%)</span>' : '') +
            '</span></div>' +
            '<div class="equity-bar eqp-bar"><div class="' + (pi === 0 ? 'eq-hero' : 'eq-villain') +
            '" style="width:' + pct + '%"></div></div>';
          rows.appendChild(div);
        });
        $('#eqMethodTxt').textContent = (res.method === 'exact'
          ? '窮舉 ' + res.trials.toLocaleString() + ' 種發牌'
          : 'Monte Carlo 模擬 ' + res.trials.toLocaleString() + ' 次（誤差約 ±0.5%）') +
          (hands.length > 2 ? ' · ' + hands.length + ' 人 all-in，平手依人數均分' : '');
        renderEV();
      } catch (err) {
        alert('計算失敗：' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '計算勝率';
      }
    }, 30);
  });

  renderVillainRows();

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

  /* ================= Tab 4: Push/Fold Nash ================= */
  var nashS = 10;
  var nashRole = 'push'; // 'push' | 'call'
  var nashSolved = null;

  function nashSolve() {
    nashSolved = NashHU.solveCached(nashS);
  }

  function renderNashGrid() {
    if (!nashSolved) nashSolve();
    var set = nashRole === 'push' ? nashSolved.pushSet : nashSolved.callSet;
    var mix = nashRole === 'push' ? nashSolved.push : nashSolved.call;
    var pct = nashRole === 'push' ? nashSolved.pushPct : nashSolved.callPct;
    var html = '';
    for (var i = 0; i < 169; i++) {
      var cls = set[i] ? 'in' : 'out';
      if (mix[i] > 0.25 && mix[i] < 0.75) cls = 'mix';
      html += '<div class="nash-cell ' + cls + '">' + PushFold.classLabel(i) + '</div>';
    }
    $('#nashGrid').innerHTML = html;
    $('#nashRangeTxt').textContent =
      (nashRole === 'push' ? 'SB 全下 range：' : 'BB 跟注 range：') +
      pct.toFixed(1) + '% 的手牌（' + nashS + ' bb）';
  }

  $('#nashStack').addEventListener('input', function () {
    nashS = parseInt(this.value, 10);
    $('#nashStackTxt').textContent = nashS;
    nashSolved = null;
    renderNashGrid();
  });
  $('#nashRolePush').addEventListener('click', function () {
    nashRole = 'push';
    $('#nashRolePush').classList.add('active-role');
    $('#nashRoleCall').classList.remove('active-role');
    renderNashGrid();
  });
  $('#nashRoleCall').addEventListener('click', function () {
    nashRole = 'call';
    $('#nashRoleCall').classList.add('active-role');
    $('#nashRolePush').classList.remove('active-role');
    renderNashGrid();
  });
  renderNashGrid();

  /* ---------- 6-max RFI 開牌 range ---------- */
  var RFI_RANGES = {
    utg: { name: 'UTG', notation: '66+ ATs+ KTs+ QTs+ JTs T9s 98s 87s 76s 65s AJo+ KQo' },
    hj:  { name: 'HJ',  notation: '44+ A9s+ A5s A4s KTs+ QTs+ J9s+ T9s 98s 87s 76s 65s ATo+ KJo+ QJo' },
    co:  { name: 'CO',  notation: '22+ A2s+ K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 65s 54s A9o+ KTo+ QTo+ JTo' },
    btn: { name: 'BTN', notation: '22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 96s+ 85s+ 74s+ 64s+ 53s+ 43s A2o+ K9o+ Q9o+ J9o+ T9o 98o' },
    sb:  { name: 'SB',  notation: '22+ A2s+ K4s+ Q6s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A4o+ K9o+ Q9o+ J9o+ T9o' }
  };

  function renderRfi(pos) {
    var def = RFI_RANGES[pos];
    var classes = PushFold.rangeFromNotation(def.notation);
    var inSet = {};
    classes.forEach(function (i) { inSet[i] = true; });
    var html = '';
    for (var i = 0; i < 169; i++) {
      html += '<div class="nash-cell ' + (inSet[i] ? 'in' : 'out') + '">' +
        PushFold.classLabel(i) + '</div>';
    }
    $('#rfiGrid').innerHTML = html;
    var combos = PushFold.rangeComboTotal(classes);
    $('#rfiTxt').textContent = def.name + ' 開牌 range：' +
      (combos / 1326 * 100).toFixed(1) + '% 的手牌（' + combos + ' combo）';
  }
  $('#rfiPosRow').addEventListener('click', function (e) {
    var btn = e.target.closest('.pos-btn');
    if (!btn) return;
    $$('#rfiPosRow .pos-btn').forEach(function (b) {
      b.classList.toggle('active-role', b === btn);
    });
    renderRfi(btn.dataset.pos);
  });
  renderRfi('utg');

  /* ---------- 面對開牌（3-bet / 防守）range ---------- */
  // 每情境快取 { callSet, tbSet, callCombos, tbCombos }
  var defSets = {};
  function defSet(key) {
    if (!defSets[key]) {
      var spot = Ranges.DEF_SPOTS[key];
      var callCls = PushFold.rangeFromNotation(spot.call);
      var tbCls = PushFold.rangeFromNotation(spot.threeBet);
      var callSet = {}, tbSet = {};
      callCls.forEach(function (i) { callSet[i] = true; });
      tbCls.forEach(function (i) { tbSet[i] = true; });
      defSets[key] = {
        callSet: callSet, tbSet: tbSet,
        callCombos: PushFold.rangeComboTotal(callCls),
        tbCombos: PushFold.rangeComboTotal(tbCls)
      };
    }
    return defSets[key];
  }

  function renderDef(key) {
    var spot = Ranges.DEF_SPOTS[key];
    var s = defSet(key);
    var html = '';
    for (var i = 0; i < 169; i++) {
      var cls = s.tbSet[i] ? 'tb' : s.callSet[i] ? 'in' : 'out';
      html += '<div class="nash-cell ' + cls + '">' + PushFold.classLabel(i) + '</div>';
    }
    $('#defGrid').innerHTML = html;
    $('#defTxt').textContent = spot.sizeTxt + '｜3-bet ' +
      (s.tbCombos / 1326 * 100).toFixed(1) + '%（' + s.tbCombos + ' combo）＋跟注 ' +
      (s.callCombos / 1326 * 100).toFixed(1) + '%（' + s.callCombos + ' combo）';
  }
  $('#defSpot').addEventListener('change', function () { renderDef(this.value); });
  renderDef('co_vs_utg');

  /* ---------- Outs / 賠率速查表 ---------- */
  (function () {
    var DRAWS = {
      2: '口袋對 → set', 4: '卡順（gutshot）', 6: '兩張高牌',
      8: '兩頭順（OESD）', 9: '同花聽牌', 12: '同花＋卡順', 15: '同花＋兩頭順'
    };
    var html = '<tr><th>Outs</th><th>常見聽牌</th><th>轉牌</th><th>河牌</th><th>轉+河</th></tr>';
    for (var o = 2; o <= 15; o++) {
      var pTurn = o / 47, pRiver = o / 46;
      var pBoth = 1 - (47 - o) / 47 * (46 - o) / 46;
      html += '<tr><td>' + o + '</td><td>' + (DRAWS[o] || '') + '</td><td>' +
        (pTurn * 100).toFixed(1) + '%</td><td>' + (pRiver * 100).toFixed(1) + '%</td><td>' +
        (pBoth * 100).toFixed(1) + '%</td></tr>';
    }
    $('#oddsTable').innerHTML = html;
  })();

  /* ---------- 訓練測驗（Push/Fold + 開牌 RFI + 面對開牌） ---------- */
  var QUIZ_KEYS = { pf: 'poker.nash_quiz', rfi: 'poker.rfi_quiz', def: 'poker.def_quiz' };
  var quizMode = 'pf'; // 'pf' | 'rfi' | 'def'

  function quizScore(mode) {
    try {
      var s = JSON.parse(localStorage.getItem(QUIZ_KEYS[mode]));
      return (s && typeof s.correct === 'number') ? s : { correct: 0, total: 0 };
    } catch (e) { return { correct: 0, total: 0 }; }
  }
  function quizSave(mode, s) { localStorage.setItem(QUIZ_KEYS[mode], JSON.stringify(s)); }
  function scoreLine(name, s) {
    return s.total
      ? name + '：' + s.correct + ' / ' + s.total + '（' + Math.round(s.correct / s.total * 100) + '%）'
      : '';
  }
  function renderQuizScore() {
    $('#quizScoreTxt').textContent =
      [scoreLine('Push/Fold', quizScore('pf')), scoreLine('RFI', quizScore('rfi')),
       scoreLine('面對開牌', quizScore('def'))]
        .filter(Boolean).join(' ｜ ');
  }

  function randHandIdx() {
    // combo 加權：pair 6、suited 4、offsuit 12
    var r = Math.floor(Math.random() * 1326), acc = 0;
    for (var i = 0; i < 169; i++) {
      acc += NashHU.COMBOS[i];
      if (r < acc) return i;
    }
    return 168;
  }

  // RFI range set 快取（pos -> {classIdx: true}）
  var rfiSets = {};
  function rfiSet(pos) {
    if (!rfiSets[pos]) {
      var set = {};
      PushFold.rangeFromNotation(RFI_RANGES[pos].notation).forEach(function (i) { set[i] = true; });
      rfiSets[pos] = set;
    }
    return rfiSets[pos];
  }

  function setQuizMode(mode) {
    quizMode = mode;
    $('#btnQuizModePf').classList.toggle('active-role', mode === 'pf');
    $('#btnQuizModeRfi').classList.toggle('active-role', mode === 'rfi');
    $('#btnQuizModeDef').classList.toggle('active-role', mode === 'def');
    $('#btnQuizPush').textContent = mode === 'pf' ? '全下' : mode === 'rfi' ? '加注' : '3-bet';
    $('#btnQuizCall').hidden = mode !== 'def';
    if (!$('#quizRun').hidden) quizNext();
  }
  $('#btnQuizModePf').addEventListener('click', function () { setQuizMode('pf'); });
  $('#btnQuizModeRfi').addEventListener('click', function () { setQuizMode('rfi'); });
  $('#btnQuizModeDef').addEventListener('click', function () { setQuizMode('def'); });

  var RFI_POS_KEYS = ['utg', 'hj', 'co', 'btn', 'sb'];
  var quizCur = null;
  function quizNext() {
    if (quizMode === 'pf') {
      var S = 2 + Math.floor(Math.random() * 14); // 2–15 bb
      quizCur = { mode: 'pf', S: S, idx: randHandIdx() };
      $('#quizInfo').textContent = '你在 SB（按鈕位），有效籌碼 ' + S + ' bb。推還是棄？';
    } else if (quizMode === 'rfi') {
      var pos = RFI_POS_KEYS[Math.floor(Math.random() * RFI_POS_KEYS.length)];
      quizCur = { mode: 'rfi', pos: pos, idx: randHandIdx() };
      $('#quizInfo').textContent = '6-max，你在 ' + RFI_RANGES[pos].name +
        '，前面無人入池。開牌加注還是蓋牌？';
    } else {
      var spotKey = Ranges.DEF_SPOT_KEYS[Math.floor(Math.random() * Ranges.DEF_SPOT_KEYS.length)];
      var spot = Ranges.DEF_SPOTS[spotKey];
      quizCur = { mode: 'def', spot: spotKey, idx: randHandIdx() };
      $('#quizInfo').textContent = '6-max 100bb，' + spot.sizeTxt + '，你在 ' + spot.hero +
        '。3-bet、跟注還是蓋牌？';
    }
    $('#quizHand').textContent = PushFold.classLabel(quizCur.idx);
    $('#quizFeedback').hidden = true;
    $('#btnQuizNext').hidden = true;
    $('#btnQuizPush').disabled = false;
    $('#btnQuizCall').disabled = false;
    $('#btnQuizFold').disabled = false;
  }
  // action: 'aggro'（全下/加注/3-bet）| 'call' | 'fold'
  function quizAnswer(action) {
    if (!quizCur) return;
    var ok, detail;
    if (quizCur.mode === 'pf') {
      var sol = NashHU.solveCached(quizCur.S);
      var correct = sol.pushSet[quizCur.idx];
      ok = (action === 'aggro') === !!correct;
      detail = ' Nash 均衡：' + PushFold.classLabel(quizCur.idx) + ' 在 ' + quizCur.S + ' bb ' +
        (correct ? '應該<b>全下</b>' : '應該<b>蓋牌</b>') +
        '（均衡全下頻率 ' + Math.round(sol.push[quizCur.idx] * 100) + '%）。';
    } else if (quizCur.mode === 'rfi') {
      var inRange = !!rfiSet(quizCur.pos)[quizCur.idx];
      ok = (action === 'aggro') === inRange;
      detail = ' 標準 RFI：' + PushFold.classLabel(quizCur.idx) + ' 在 ' +
        RFI_RANGES[quizCur.pos].name +
        (inRange ? ' 屬於開牌 range，應該<b>加注</b>。' : ' 不在開牌 range，應該<b>蓋牌</b>。');
    } else {
      var ds = defSet(quizCur.spot);
      var best = ds.tbSet[quizCur.idx] ? 'aggro' : ds.callSet[quizCur.idx] ? 'call' : 'fold';
      ok = action === best;
      var bestTxt = best === 'aggro' ? '<b>3-bet</b>' : best === 'call' ? '<b>跟注</b>' : '<b>蓋牌</b>';
      detail = ' ' + Ranges.DEF_SPOTS[quizCur.spot].name + '：' +
        PushFold.classLabel(quizCur.idx) + ' 應該' + bestTxt + '。';
    }
    var s = quizScore(quizCur.mode);
    s.total++; if (ok) s.correct++;
    quizSave(quizCur.mode, s);
    var fb = $('#quizFeedback');
    fb.hidden = false;
    fb.innerHTML = (ok ? '<span class="pos">✔ 正確！</span>' : '<span class="neg">✘ 錯誤。</span>') +
      detail + '<br>目前成績 ' + s.correct + ' / ' + s.total;
    $('#btnQuizNext').hidden = false;
    $('#btnQuizPush').disabled = true;
    $('#btnQuizCall').disabled = true;
    $('#btnQuizFold').disabled = true;
  }
  $('#btnQuizStart').addEventListener('click', function () {
    $('#quizIdle').hidden = true;
    $('#quizRun').hidden = false;
    quizNext();
  });
  $('#btnQuizPush').addEventListener('click', function () { quizAnswer('aggro'); });
  $('#btnQuizCall').addEventListener('click', function () { quizAnswer('call'); });
  $('#btnQuizFold').addEventListener('click', function () { quizAnswer('fold'); });
  $('#btnQuizNext').addEventListener('click', quizNext);
  $('#btnQuizQuit').addEventListener('click', function () {
    $('#quizRun').hidden = true;
    $('#quizIdle').hidden = false;
    renderQuizScore();
  });
  renderQuizScore();

  /* ================= Range vs 手牌 ================= */
  $('#btnCalcRvh').addEventListener('click', function () {
    var hero = [slotCards.hero0, slotCards.hero1];
    if (hero.some(function (c) { return c === undefined; })) {
      alert('請先在上方選滿 Hero 2 張手牌');
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
    var notation = $('#rvhNotation').value.trim();
    var classes, rangeName;
    try {
      if (notation) {
        classes = PushFold.rangeFromNotation(notation);
        rangeName = notation;
      } else {
        var pct = parseFloat($('#rvhPct').value);
        if (!(pct > 0 && pct <= 100)) { alert('前 X% 請輸入 0.1–100'); return; }
        classes = PushFold.topPercentRange(pct);
        rangeName = '前 ' + pct + '%';
      }
    } catch (err) { alert(err.message); return; }
    if (!classes.length) { alert('range 是空的'); return; }
    var combos = [];
    classes.forEach(function (ci) {
      PushFold.expandCombos(ci).forEach(function (vc) { combos.push(vc); });
    });
    var btn = $('#btnCalcRvh');
    btn.disabled = true;
    btn.textContent = '計算中…';
    setTimeout(function () {
      try {
        var res = EquityLib.computeEquityVsCombos(hero, combos, board, 30000);
        var eqH = res.hero * 100, eqR = 100 - eqH;
        $('#rvhResult').hidden = false;
        $('#rvhHeroTxt').textContent = 'Hero：' + eqH.toFixed(1) + '%';
        $('#rvhRangeTxt').textContent = 'Range：' + eqR.toFixed(1) + '%';
        $('#rvhBarHero').style.width = eqH + '%';
        $('#rvhBarRange').style.width = eqR + '%';
        $('#rvhDetail').textContent = '對手 range「' + rangeName + '」：' + classes.length +
          ' 類 / ' + res.combos + ' 可用 combo（已扣 blocker）｜' +
          (res.method === 'exact'
            ? '窮舉 ' + res.trials.toLocaleString() + ' 種發牌'
            : 'Monte Carlo ' + res.trials.toLocaleString() + ' 次（誤差約 ±0.6%）') +
          (board.length ? '' : '｜翻前') + '，平手依勝率折半計入';
      } catch (err) {
        alert('計算失敗：' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '計算 vs range 勝率';
      }
    }, 30);
  });

  /* ================= Range vs Range ================= */
  $('#btnCalcRvr').addEventListener('click', function () {
    var pa = parseFloat($('#rvrA').value), pb = parseFloat($('#rvrB').value);
    if (!(pa > 0) || !(pb > 0) || pa > 100 || pb > 100) {
      alert('請輸入 0.1–100 的百分比');
      return;
    }
    var r;
    try { r = PushFold.rangeVsRange(pa, pb); }
    catch (err) { alert(err.message); return; }
    var eqA = r.equityA * 100, eqB = 100 - eqA;
    $('#rvrResult').hidden = false;
    $('#rvrATxt').textContent = 'A 前 ' + pa + '%：' + eqA.toFixed(1) + '%';
    $('#rvrBTxt').textContent = 'B 前 ' + pb + '%：' + eqB.toFixed(1) + '%';
    $('#rvrBarA').style.width = eqA + '%';
    $('#rvrBarB').style.width = eqB + '%';
    $('#rvrDetail').textContent = 'Range A：' + r.classesA + ' 類 / ' + r.combosA +
      ' combo ｜ Range B：' + r.classesB + ' 類 / ' + r.combosB +
      ' combo（平手依勝率折半計入）';
  });

  /* ================= Tab 5b: 關鍵手牌複盤 ================= */
  var HANDS_KEY = 'poker.hands';
  var HANDS_CAP = 100;
  function loadHands() {
    try {
      var arr = JSON.parse(localStorage.getItem(HANDS_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveHands(list) { localStorage.setItem(HANDS_KEY, JSON.stringify(list)); }
  var handRecords = loadHands();

  var HS_BOARD_LABEL = {
    flop: '翻牌公牌（3 張，例：Qh 7d 2s）',
    turn: '轉牌（第 4 張，例：9c）',
    river: '河牌（第 5 張，例：2d）'
  };
  (function buildStreetBlocks() {
    var box = $('#hStreets');
    HANDS.STREETS.forEach(function (st) {
      var div = document.createElement('div');
      div.className = 'street-block';
      div.dataset.street = st;
      var html = '<h3>' + HANDS.STREET_NAMES[st] + '</h3>';
      if (HS_BOARD_LABEL[st]) {
        html += '<label>' + HS_BOARD_LABEL[st] +
          '<input type="text" class="hs-board" autocapitalize="off" autocomplete="off"></label>';
      }
      html += '<div class="grid-3">' +
        '<label>行動前底池(bb)<input type="number" class="hs-pot" inputmode="decimal" step="any" min="0"></label>' +
        '<label>需跟注(bb)<input type="number" class="hs-call" inputmode="decimal" step="any" min="0" placeholder="0"></label>' +
        '<label>我的行動<select class="hs-action"><option value="">（略過）</option>' +
        '<option value="fold">蓋牌</option><option value="call">跟注</option>' +
        '<option value="raise">加注</option><option value="allin">全下</option></select></label>' +
        '</div>' +
        '<label>對手估計 range（例：77+ A9s+ KQo）' +
        '<input type="text" class="hs-range" autocapitalize="off" autocomplete="off"></label>';
      div.innerHTML = html;
      box.appendChild(div);
    });
  })();

  // 讀取各街輸入；board 逐街累積（flop 3 張 + turn 1 張 + river 1 張）
  function readStreetInputs() {
    var out = [], boardSoFar = [];
    HANDS.STREETS.forEach(function (st) {
      var block = document.querySelector('#hStreets .street-block[data-street="' + st + '"]');
      var boardInput = block.querySelector('.hs-board');
      if (boardInput && boardInput.value.trim()) {
        var need = st === 'flop' ? 3 : 1;
        boardSoFar = boardSoFar.concat(HANDS.parseCards(boardInput.value, need));
      }
      var action = block.querySelector('.hs-action').value;
      if (!action) return; // 該街略過
      if (boardSoFar.length !== HANDS.BOARD_LEN[st]) {
        throw new Error(HANDS.STREET_NAMES[st] + ' 決策需要 ' + HANDS.BOARD_LEN[st] +
          ' 張公牌（目前 ' + boardSoFar.length + ' 張，前面街的公牌也要填）');
      }
      var pot = parseFloat(block.querySelector('.hs-pot').value);
      var toCall = parseFloat(block.querySelector('.hs-call').value) || 0;
      var range = block.querySelector('.hs-range').value.trim();
      if (!(pot >= 0)) throw new Error(HANDS.STREET_NAMES[st] + '：請輸入行動前底池（bb）');
      if (!range) throw new Error(HANDS.STREET_NAMES[st] + '：請輸入對手估計 range');
      out.push({ street: st, board: boardSoFar.slice(), pot: pot, toCall: toCall,
                 action: action, range: range });
    });
    return out;
  }

  $('#btnSaveHand').addEventListener('click', function () {
    var heroCards;
    try { heroCards = HANDS.parseCards($('#hHero').value, 2); }
    catch (err) { alert('手牌錯誤：' + err.message); return; }
    var streets;
    try { streets = readStreetInputs(); }
    catch (err) { alert(err.message); return; }
    if (!streets.length) { alert('至少記錄一街的決策（選一個行動）'); return; }
    var btn = $('#btnSaveHand');
    btn.disabled = true;
    btn.textContent = '分析中…';
    setTimeout(function () {
      try {
        streets.forEach(function (s) {
          s.analysis = HANDS.analyzeStreet({
            street: s.street, heroCards: heroCards, board: s.board,
            range: s.range, pot: s.pot, toCall: s.toCall,
            action: s.action, mcIters: 20000
          });
          s.boardTxt = s.board.map(Evaluator.cardToString).join(' ');
          delete s.board;
        });
        var rec = {
          id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          date: new Date().toISOString().slice(0, 10),
          blinds: $('#hBlinds').value.trim(),
          ante: parseFloat($('#hAnte').value) || 0,
          stack: parseFloat($('#hStack').value) || 0,
          pos: $('#hPos').value,
          hero: heroCards.map(Evaluator.cardToString).join(' '),
          result: $('#hResult').value === '' ? null : parseFloat($('#hResult').value),
          note: $('#hNote').value.trim(),
          streets: streets
        };
        handRecords.unshift(rec);
        if (handRecords.length > HANDS_CAP) handRecords = handRecords.slice(0, HANDS_CAP);
        saveHands(handRecords);
        // 清空手牌相關輸入（保留盲注 / 籌碼 / 位置方便連續記錄）
        $('#hHero').value = ''; $('#hResult').value = ''; $('#hNote').value = '';
        $$('#hStreets .hs-board').forEach(function (el) { el.value = ''; });
        $$('#hStreets .hs-pot').forEach(function (el) { el.value = ''; });
        $$('#hStreets .hs-call').forEach(function (el) { el.value = ''; });
        $$('#hStreets .hs-range').forEach(function (el) { el.value = ''; });
        $$('#hStreets .hs-action').forEach(function (el) { el.value = ''; });
        renderHands(rec.id);
      } catch (err) {
        alert('分析失敗：' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '儲存並分析';
      }
    }, 30);
  });

  function streetDetailHtml(st) {
    var a = st.analysis;
    var eqPct = (a.equity * 100).toFixed(1), needPct = (a.needed * 100).toFixed(1);
    var evRounded = Math.round(a.evBB * 100) / 100;
    var vCls = a.leak ? 'neg'
      : (a.verdict === 'good_call' || a.verdict === 'good_fold' || a.verdict === 'raise_ahead')
        ? 'pos' : 'muted';
    var html = '<b>' + HANDS.STREET_NAMES[st.street] + '</b>' +
      (st.boardTxt ? ' ｜ 公牌 ' + escapeHtml(st.boardTxt) : '') +
      ' ｜ 底池 ' + st.pot + ' bb，需跟注 ' + st.toCall + ' bb，行動：' +
      HANDS.ACTION_NAMES[st.action] + '<br>' +
      '對手 range「' + escapeHtml(st.range) + '」：' + a.rangeClasses + ' 類 / ' +
      a.combos + ' combo（' + (a.method === 'exact' ? '窮舉' : 'Monte Carlo') + '）<br>' +
      '需要勝率 ' + needPct + '% vs 實際勝率 <b>' + eqPct + '%</b><br>';
    if (st.action === 'call') {
      html += '跟注 EV = ' + eqPct + '% × (' + st.pot + ' + ' + st.toCall + ') − ' + st.toCall +
        ' = <b class="' + (a.evBB >= 0 ? 'pos' : 'neg') + '">' + fmtPL(evRounded) + ' bb</b><br>';
    } else if (st.action === 'fold') {
      html += '蓋牌 EV = 0 bb' +
        (a.verdict === 'missed_call'
          ? '（跟注本可 ' + fmtPL(Math.round(HANDS.callEVbb(a.equity, st.pot, st.toCall) * 100) / 100) + ' bb）'
          : '') + '<br>';
    } else {
      html += '視同跟注 EV = ' + fmtPL(evRounded) + ' bb（簡化模型，未計 fold equity）<br>';
    }
    html += '<span class="' + vCls + '">' + HANDS.verdictText(a.verdict) + '</span>';
    return html;
  }

  function renderLeaks() {
    var s = HANDS.leakSummary(handRecords);
    var tbl = $('#leakTable'), hint = $('#leakHint');
    if (!s.decisions) {
      tbl.innerHTML = '';
      hint.textContent = '儲存手牌後，統計各街的 −EV 跟注與錯過的 +EV 跟注。';
      return;
    }
    var html = '<tr><th>街</th><th>決策數</th><th>−EV 跟注</th><th>錯過 +EV</th></tr>';
    HANDS.STREETS.forEach(function (st) {
      var b = s.byStreet[st];
      if (!b.decisions) return;
      html += '<tr><td>' + HANDS.STREET_NAMES[st] + '</td><td>' + b.decisions +
        '</td><td class="' + (b.badCalls ? 'neg' : 'muted') + '">' + b.badCalls +
        '</td><td class="' + (b.missedCalls ? 'neg' : 'muted') + '">' + b.missedCalls + '</td></tr>';
    });
    html += '<tr><td><b>合計</b></td><td>' + s.decisions +
      '</td><td class="' + (s.badCalls ? 'neg' : 'muted') + '">' + s.badCalls +
      '</td><td class="' + (s.missedCalls ? 'neg' : 'muted') + '">' + s.missedCalls + '</td></tr>';
    tbl.innerHTML = html;
    var leaks = s.badCalls + s.missedCalls;
    hint.textContent = leaks
      ? '共 ' + leaks + ' 個 leak（跟注決策）— 點下方手牌看完整分析。加注 / 全下未計 fold equity，不列入 leak。'
      : '目前跟注決策沒有 leak，繼續保持。';
  }

  function renderHandList(expandId) {
    var ul = $('#handList');
    ul.innerHTML = '';
    if (!handRecords.length) {
      ul.innerHTML = '<li class="empty-msg">尚無複盤紀錄</li>';
      return;
    }
    handRecords.forEach(function (h) {
      var li = document.createElement('li');
      li.className = 'hand-item';
      var head = document.createElement('div');
      head.className = 'session-item';
      var main = document.createElement('div');
      main.className = 'session-main';
      var title = document.createElement('div');
      title.className = 'session-title';
      var badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = h.pos;
      title.appendChild(badge);
      title.appendChild(document.createTextNode(
        h.date + ' · ' + h.hero + (h.blinds ? ' · ' + h.blinds : '')));
      var sub = document.createElement('div');
      sub.className = 'session-sub';
      sub.textContent = (h.streets || []).map(function (st) {
        return HANDS.STREET_NAMES[st.street] + HANDS.ACTION_NAMES[st.action] + '：' +
          HANDS.verdictText(st.analysis.verdict);
      }).join(' ｜ ');
      main.appendChild(title);
      main.appendChild(sub);
      var pl = document.createElement('span');
      pl.className = 'session-pl ' +
        (h.result > 0 ? 'pos' : h.result < 0 ? 'neg' : 'muted');
      pl.textContent = (h.result === null || h.result === undefined)
        ? '—' : fmtPL(h.result) + ' bb';
      var del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.setAttribute('aria-label', '刪除手牌');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('刪除這手複盤紀錄？')) return;
        handRecords = handRecords.filter(function (x) { return x.id !== h.id; });
        saveHands(handRecords);
        renderHands();
      });
      head.appendChild(main);
      head.appendChild(pl);
      head.appendChild(del);
      var detail = document.createElement('div');
      detail.className = 'hand-detail';
      detail.hidden = h.id !== expandId;
      var dHtml = '';
      if (h.stack || h.ante) {
        dHtml += '<p class="hint">有效籌碼 ' + h.stack + ' bb' +
          (h.ante ? '，前注/人 ' + h.ante : '') + '</p>';
      }
      (h.streets || []).forEach(function (st) {
        dHtml += '<div class="ev-result">' + streetDetailHtml(st) + '</div>';
      });
      if (h.note) dHtml += '<p class="hint">' + escapeHtml(h.note) + '</p>';
      detail.innerHTML = dHtml;
      main.style.cursor = 'pointer';
      main.addEventListener('click', function () { detail.hidden = !detail.hidden; });
      li.appendChild(head);
      li.appendChild(detail);
      ul.appendChild(li);
    });
  }

  function renderHands(expandId) {
    renderLeaks();
    renderHandList(expandId);
  }
  renderHands();

  /* ================= Tab 5: 世界賽事 ================= */
  var evData = null;

  function evFmtDate(s, e) {
    if (!s) return '日期未定';
    var txt = s.slice(5).replace('-', '/');
    if (e) txt += ' – ' + e.slice(5).replace('-', '/');
    return txt + '（' + s.slice(0, 4) + '）';
  }

  function renderEvents() {
    if (!evData) return;
    var region = $('#evRegion').value, country = $('#evCountry').value;
    var list = evData.events.filter(function (ev) {
      return (region === 'all' || ev.region === region) &&
             (country === 'all' || ev.country === country);
    });
    // 依開始日排序，無日期排最後
    list.sort(function (a, b) {
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start < b.start ? -1 : 1;
    });
    var box = $('#evList');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<p class="empty-msg">此篩選條件下沒有賽事</p>';
      return;
    }
    var byRegion = {};
    list.forEach(function (ev) {
      (byRegion[ev.region] = byRegion[ev.region] || []).push(ev);
    });
    Object.keys(byRegion).forEach(function (rg) {
      var h = document.createElement('div');
      h.className = 'ev-region';
      h.textContent = rg;
      box.appendChild(h);
      byRegion[rg].forEach(function (ev) {
        var item = document.createElement('div');
        item.className = 'ev-item';
        var top = document.createElement('div');
        top.className = 'ev-top';
        var name;
        if (ev.url) {
          name = document.createElement('a');
          name.href = ev.url;
          name.target = '_blank';
          name.rel = 'noopener noreferrer';
        } else {
          name = document.createElement('span');
        }
        name.className = 'ev-name';
        name.textContent = ev.series;
        var date = document.createElement('span');
        date.className = 'ev-date';
        date.textContent = evFmtDate(ev.start, ev.end);
        top.appendChild(name); top.appendChild(date);
        var sub = document.createElement('div');
        sub.className = 'ev-sub';
        sub.textContent = ev.country + ' · ' + ev.city +
          (ev.venue ? ' · ' + ev.venue : '') +
          (ev.note ? ' ｜ ' + ev.note : '');
        item.appendChild(top); item.appendChild(sub);
        box.appendChild(item);
      });
    });
  }

  function evFillFilters() {
    var regions = {}, countries = {};
    evData.events.forEach(function (ev) {
      regions[ev.region] = true;
      countries[ev.country] = true;
    });
    function fill(sel, keys) {
      var cur = sel.value;
      sel.innerHTML = '<option value="all">全部</option>';
      Object.keys(keys).sort().forEach(function (k) {
        var o = document.createElement('option');
        o.value = k; o.textContent = k;
        sel.appendChild(o);
      });
      sel.value = cur && (cur === 'all' || keys[cur]) ? cur : 'all';
    }
    fill($('#evRegion'), regions);
    fill($('#evCountry'), countries);
  }

  function loadEvents() {
    fetch('data/tournaments.json?d=' + new Date().toISOString().slice(0, 10))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        evData = data;
        $('#evUpdated').textContent = '更新於 ' + (data.updated || '—');
        evFillFilters();
        renderEvents();
      })
      .catch(function () {
        $('#evList').innerHTML = '<p class="empty-msg">賽事資料載入失敗</p>';
      });
  }
  $('#evRegion').addEventListener('change', renderEvents);
  $('#evCountry').addEventListener('change', renderEvents);
  loadEvents();

  /* ================= PWA ================= */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
