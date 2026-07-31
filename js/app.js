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
      tag: $('#fTag').value.trim(),
      buyin: parseFloat($('#fBuyin').value) || 0,
      cashout: parseFloat($('#fCashout').value) || 0,
      hours: parseFloat($('#fHours').value) || 0,
      bb: parseFloat($('#fBB').value) || 0,
      note: $('#fNote').value.trim()
    };
    sessions.push(rec);
    saveSessions(sessions);
    $('#fVenue').value = ''; $('#fTag').value = '';
    $('#fBuyin').value = ''; $('#fCashout').value = '';
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
      title.appendChild(document.createTextNode(r.date + (r.venue ? ' · ' + r.venue : '') +
        (r.tag ? ' · ＃' + r.tag : '')));
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

  /* --- 標籤分析 --- */
  function renderTagStats() {
    var tbl = $('#tagStatsTable'), hint = $('#tagStatsHint');
    if (!sessions.length) {
      tbl.innerHTML = '';
      hint.textContent = '新增紀錄後顯示。無標籤的紀錄以場地分組。';
      return;
    }
    hint.textContent = '無標籤的舊紀錄以場地分組；依總盈虧排序。';
    var groups = TrackerStats.tagStats(sessions);
    var html = '<tr><th>標籤</th><th>場次</th><th>總盈虧</th><th>時薪</th></tr>';
    groups.forEach(function (g) {
      var plCls = g.pl > 0 ? 'pos' : g.pl < 0 ? 'neg' : 'muted';
      html += '<tr><td>' + escapeHtml(g.tag) + '</td><td>' + g.n +
        '</td><td class="' + plCls + '">' + fmtPL(g.pl) + '</td><td>' +
        (g.hourly === null ? '—' : fmtPL(Math.round(g.hourly * 100) / 100) + ' /hr') +
        '</td></tr>';
    });
    tbl.innerHTML = html;
  }

  /* --- 月報 --- */
  function renderMonthly() {
    var tbl = $('#monthlyTable'), chart = $('#monthlyChart'), hint = $('#monthlyHint');
    chart.innerHTML = '';
    if (!sessions.length) {
      tbl.innerHTML = '';
      hint.textContent = '新增紀錄後顯示每月盈虧。';
      return;
    }
    hint.textContent = '';
    var months = TrackerStats.monthlyStats(sessions);
    var html = '<tr><th>月份</th><th>場次</th><th>盈虧</th><th>時數</th></tr>';
    months.forEach(function (m) {
      var plCls = m.pl > 0 ? 'pos' : m.pl < 0 ? 'neg' : 'muted';
      html += '<tr><td>' + escapeHtml(m.month) + '</td><td>' + m.n +
        '</td><td class="' + plCls + '">' + fmtPL(m.pl) + '</td><td>' +
        (m.hours ? m.hours : '—') + '</td></tr>';
    });
    tbl.innerHTML = html;
    // 純 DOM 長條圖
    var maxAbs = months.reduce(function (a, m) { return Math.max(a, Math.abs(m.pl)); }, 0);
    if (!(maxAbs > 0)) return;
    months.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'bar-row';
      var lab = document.createElement('span');
      lab.className = 'bar-label';
      lab.textContent = m.month;
      var track = document.createElement('div');
      track.className = 'bar-track';
      var fill = document.createElement('div');
      fill.className = 'bar-fill ' + (m.pl >= 0 ? 'bar-pos' : 'bar-neg');
      fill.style.width = (Math.abs(m.pl) / maxAbs * 100).toFixed(1) + '%';
      track.appendChild(fill);
      var val = document.createElement('span');
      val.className = 'bar-value ' + (m.pl > 0 ? 'pos' : m.pl < 0 ? 'neg' : 'muted');
      val.textContent = fmtPL(m.pl);
      row.appendChild(lab); row.appendChild(track); row.appendChild(val);
      chart.appendChild(row);
    });
  }

  /* --- 傾斜偵測 --- */
  function renderTilt() {
    var box = $('#tiltInsight');
    var t = TrackerStats.tiltStats(sessions);
    if (t.afterLossCount < 5) {
      box.textContent = '樣本不足（連輸後的場次需 ≥ 5，目前 ' + t.afterLossCount +
        '），累積更多紀錄後顯示分析。';
      return;
    }
    var after = Math.round(t.afterLossAvg * 100) / 100;
    var overall = Math.round(t.overallAvg * 100) / 100;
    var msg = '輸錢場次後的平均盈虧 ' + fmtPL(after) + ' vs 整體平均 ' + fmtPL(overall) +
      '（樣本 ' + t.afterLossCount + ' 場）';
    if (t.afterLossAvg < t.overallAvg) {
      msg += ' —— 連輸後表現明顯變差，注意傾斜（tilt）。';
    } else {
      msg += ' —— 未見明顯傾斜跡象。';
    }
    msg += ' 最長連敗：' + t.longestLossStreak + ' 場。';
    box.textContent = msg;
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
    renderTagStats();
    renderMonthly();
    renderTilt();
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
    var rows = [['日期', '類型', '場地', '標籤', '買入', '兌現', '盈虧', '時數', '大盲', '備註']];
    sessions.forEach(function (r) {
      rows.push([r.date, TYPE_NAMES[r.type] || r.type, r.venue, r.tag || '', r.buyin, r.cashout,
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

  /* ================= Tab 3c: Final Table 分錢 ================= */
  var DEAL_MAX_PLAYERS = 9;
  function addDealPlayerRow(name, stack, locked) {
    if ($$('#dealPlayerRows .dyn-row').length >= DEAL_MAX_PLAYERS) {
      alert('最多 ' + DEAL_MAX_PLAYERS + ' 位玩家');
      return;
    }
    makeRow($('#dealPlayerRows'), {
      inputs: [
        { type: 'text', placeholder: '名字（選填）', cls: 'name-input', value: name },
        { placeholder: '籌碼', cls: 'deal-stack', value: stack },
        { placeholder: '已鎖定獎金', cls: 'deal-locked', value: locked }
      ]
    });
  }
  $('#btnAddDealPlayer').addEventListener('click', function () { addDealPlayerRow(); });
  addDealPlayerRow('', 5000); addDealPlayerRow('', 3000); addDealPlayerRow('', 2000);

  $('#btnCalcDeal').addEventListener('click', function () {
    var pool = parseFloat($('#dealPool').value);
    if (!(pool > 0)) { alert('請輸入剩餘獎池'); return; }
    var payouts = readPayouts();
    if (!payouts.length) { alert('請先在上方輸入獎金結構（ICM 分法需要比例）'); return; }
    var players = [];
    $$('#dealPlayerRows .dyn-row').forEach(function (row, i) {
      var stack = parseFloat(row.querySelector('.deal-stack').value);
      if (stack > 0) {
        players.push({
          name: row.querySelector('.name-input').value.trim() || ('玩家 ' + (i + 1)),
          stack: stack,
          locked: parseFloat(row.querySelector('.deal-locked').value) || 0
        });
      }
    });
    if (players.length < 2 || players.length > DEAL_MAX_PLAYERS) {
      alert('請輸入 2–' + DEAL_MAX_PLAYERS + ' 位玩家籌碼');
      return;
    }
    var stacks = players.map(function (p) { return p.stack; });
    var locked = players.map(function (p) { return p.locked; });
    var icmAmts, chopAmts;
    try {
      icmAmts = ICM.icmDeal(stacks, payouts, pool, locked);
      chopAmts = ICM.chipChopDeal(stacks, pool, locked);
    } catch (err) {
      alert(err.message);
      return;
    }
    var totalChips = stacks.reduce(function (a, b) { return a + b; }, 0);
    var lockedSum = locked.reduce(function (a, b) { return a + b; }, 0);
    var html = '<tr><th>玩家</th><th>籌碼%</th><th>ICM 分法</th><th>Chip-chop</th><th>差異</th></tr>';
    players
      .map(function (p, i) { return { p: p, icm: icmAmts[i], chop: chopAmts[i] }; })
      .sort(function (a, b) { return b.p.stack - a.p.stack; })
      .forEach(function (x) {
        var diff = x.icm - x.chop;
        var dCls = diff > 0.005 ? 'pos' : diff < -0.005 ? 'neg' : 'muted';
        html += '<tr><td>' + escapeHtml(x.p.name) + '</td><td>' +
          (x.p.stack / totalChips * 100).toFixed(1) + '</td><td>' +
          fmtMoney(Math.round(x.icm * 100) / 100) + '</td><td>' +
          fmtMoney(Math.round(x.chop * 100) / 100) + '</td><td class="' + dCls + '">' +
          fmtPL(Math.round(diff * 100) / 100) + '</td></tr>';
      });
    html += '<tr><td><b>合計</b></td><td>100.0</td><td>' +
      fmtMoney(Math.round((pool + lockedSum) * 100) / 100) + '</td><td>' +
      fmtMoney(Math.round((pool + lockedSum) * 100) / 100) + '</td><td>—</td></tr>';
    $('#dealTable').innerHTML = html;
    $('#dealResultWrap').hidden = false;
  });

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

  /* ---------- 混合頻率格子（四張圖共用） ----------
   * 一格橫向分成三段：左 = 加注（紅）、中 = 跟注（綠）、右 = 棄牌（底色），
   * 段長就是該動作的頻率。混合手牌（沒有動作 ≥90%）在底下多印一行加注%。 */
  var FREQ_AGGRO = '#bc4038', FREQ_CALL = '#279c58', FREQ_FOLD = 'rgba(255,255,255,.05)';
  function freqCellHtml(i, fr, hasCall) {
    var a = fr.aggro * 100;
    var c = a + (hasCall ? fr.call * 100 : 0);
    var bg = 'linear-gradient(to right,' +
      FREQ_AGGRO + ' 0 ' + a.toFixed(1) + '%,' +
      FREQ_CALL + ' ' + a.toFixed(1) + '% ' + c.toFixed(1) + '%,' +
      FREQ_FOLD + ' ' + c.toFixed(1) + '% 100%)';
    var sub = Ranges.isMixed(fr)
      ? '<i>' + Math.round(fr.aggro * 100) + (hasCall ? '/' + Math.round(fr.call * 100) : '') + '</i>'
      : '';
    return '<div class="nash-cell freq" data-i="' + i + '" style="background:' + bg + '">' +
      PushFold.classLabel(i) + sub + '</div>';
  }
  /** 頻率圖的統計文字：combo 加權的平均頻率 + 混合手牌數 */
  function freqSummary(map, hasCall) {
    var aggro = 0, call = 0, mixed = 0, total = 0;
    for (var i = 0; i < 169; i++) {
      var fr = map[PushFold.classLabel(i)];
      if (!fr) continue;
      var n = PushFold.comboCount(i);
      total += n;
      aggro += fr.aggro * n;
      call += (hasCall ? fr.call : 0) * n;
      if (Ranges.isMixed(fr)) mixed++;
    }
    return '混合頻率檢視（模型推估）：加權加注 ' + (aggro / total * 100).toFixed(1) + '%' +
      (hasCall ? '、跟注 ' + (call / total * 100).toFixed(1) + '%' : '') +
      '，其中 ' + mixed + ' 手是混合手牌（沒有任何動作 ≥90%）。' +
      '門檻附近本來就沒有明確的分界，測驗也依此放寬評分。';
  }
  /** 切換鈕的共用行為 */
  function bindFreqToggle(sel, get, set, render) {
    $(sel).addEventListener('click', function () {
      set(!get());
      this.classList.toggle('active-role', get());
      render();
    });
  }

  var nashS = 10;
  var nashRole = 'push'; // 'push' | 'call'
  var nashSolved = null;
  var nashFreq = false;

  function nashSolve() {
    nashSolved = NashHU.solveCached(nashS);
  }

  function renderNashGrid() {
    if (!nashSolved) nashSolve();
    var set = nashRole === 'push' ? nashSolved.pushSet : nashSolved.callSet;
    var mix = nashRole === 'push' ? nashSolved.push : nashSolved.call;
    var pct = nashRole === 'push' ? nashSolved.pushPct : nashSolved.callPct;
    var html = '', i;
    if (nashFreq) {
      // Nash 解本身就是混合策略，直接用 fictitious play 收斂後的頻率，不是推估
      var fmap = {};
      for (i = 0; i < 169; i++) {
        fmap[PushFold.classLabel(i)] = { aggro: mix[i], call: 0, fold: 1 - mix[i] };
        html += freqCellHtml(i, fmap[PushFold.classLabel(i)], false);
      }
      $('#nashGrid').innerHTML = html;
      $('#nashRangeTxt').textContent =
        (nashRole === 'push' ? 'SB 全下 range：' : 'BB 跟注 range：') +
        pct.toFixed(1) + '%（' + nashS + ' bb）｜' +
        freqSummary(fmap, false).replace('（模型推估）', '（Nash 均衡實際頻率）');
      return;
    }
    for (i = 0; i < 169; i++) {
      var cls = set[i] ? 'in' : 'out';
      if (mix[i] > 0.25 && mix[i] < 0.75) cls = 'mix';
      html += '<div class="nash-cell ' + cls + '">' + PushFold.classLabel(i) + '</div>';
    }
    $('#nashGrid').innerHTML = html;
    $('#nashRangeTxt').textContent =
      (nashRole === 'push' ? 'SB 全下 range：' : 'BB 跟注 range：') +
      pct.toFixed(1) + '% 的手牌（' + nashS + ' bb）';
  }
  bindFreqToggle('#btnNashFreq',
    function () { return nashFreq; },
    function (v) { nashFreq = v; }, renderNashGrid);

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

  /* ---------- 自訂 range 覆寫存取（localStorage 稀疏差異） ---------- */
  var CUSTOM_RANGES_KEY = 'poker.custom_ranges';
  function loadCustomRanges() {
    try {
      var o = JSON.parse(localStorage.getItem(CUSTOM_RANGES_KEY));
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function getRangeOverride(key) {
    var ov = loadCustomRanges()[key];
    return (ov && Object.keys(ov).length) ? ov : null;
  }
  function setRangeOverride(key, diff) {
    var all = loadCustomRanges();
    if (diff && Object.keys(diff).length) all[key] = diff;
    else delete all[key];
    localStorage.setItem(CUSTOM_RANGES_KEY, JSON.stringify(all));
  }

  /* ---------- 開牌 RFI range（6-max / 9-max，可手動編輯） ---------- */
  var RFI_TABLES = { '6': Ranges.RFI_RANGES_6, '9': Ranges.RFI_RANGES_9 };
  var rfiTable = '6', rfiPosCur = 'utg', rfiEdit = false, rfiSliding = false, rfiFreq = false;
  // 有效籌碼滑桿：100bb = 建議表（可編輯），其餘深度只換組成、寬度不變（唯讀）
  var rfiStackCur = Ranges.VS3B_BASE_BB, rfiStackSliding = false;
  function rfiDepthActive() { return rfiStackCur !== Ranges.VS3B_BASE_BB; }

  function rfiChartKey() { return 'rfi' + rfiTable + ':' + rfiPosCur; }
  function rfiDefaultMap() {
    var map = {};
    PushFold.rangeFromNotation(RFI_TABLES[rfiTable][rfiPosCur].notation)
      .forEach(function (i) { map[PushFold.classLabel(i)] = 'in'; });
    return map;
  }
  function renderRfi() {
    var def = RFI_TABLES[rfiTable][rfiPosCur];
    var depth = rfiDepthActive();
    var ov = getRangeOverride(rfiChartKey());
    var baseMap = Ranges.mergeOverride(rfiDefaultMap(), ov);
    var map = baseMap;
    if (depth) {
      // 寬度沿用目前這張圖（含自訂 %），只依深度重排組成
      var target = 0;
      for (var b = 0; b < 169; b++) {
        if (baseMap[PushFold.classLabel(b)] === 'in') target += PushFold.comboCount(b);
      }
      map = Ranges.rfiAtDepth(target, rfiStackCur);
    }
    var html = '', combos = 0, i, lbl;
    for (i = 0; i < 169; i++) {
      lbl = PushFold.classLabel(i);
      if (map[lbl] === 'in') combos += PushFold.comboCount(i);
    }
    var rfiFmap = null;
    if (rfiFreq) {
      rfiFmap = Ranges.rfiFreqMap(combos, rfiStackCur);
      for (i = 0; i < 169; i++) html += freqCellHtml(i, rfiFmap[PushFold.classLabel(i)], false);
    } else {
      for (i = 0; i < 169; i++) {
        lbl = PushFold.classLabel(i);
        html += '<div class="nash-cell ' + (map[lbl] === 'in' ? 'in' : 'out') +
          '" data-i="' + i + '">' + lbl + '</div>';
      }
    }
    $('#rfiGrid').innerHTML = html;
    $('#rfiGrid').classList.toggle('editing', rfiEdit && !depth && !rfiFreq);
    var pct = combos / 1326 * 100;
    var info = Ranges.rfiStackInfo(rfiStackCur);
    if (rfiFreq) {
      $('#rfiTxt').textContent = rfiTable + '-max ' + def.name + ' 開牌（' + info.effBb +
        'bb，寬度 ' + pct.toFixed(1) + '%）｜' + freqSummary(rfiFmap, false);
      $('#rfiCustomRow').hidden = !ov;
      $('#btnRfiEdit').disabled = true;
      if (!rfiSliding) $('#rfiPct').value = pct;
      $('#rfiPctVal').textContent = pct.toFixed(1) + '%';
      if (!rfiStackSliding) $('#rfiStack').value = rfiStackCur;
      $('#rfiStackVal').textContent = rfiStackCur + 'bb';
      return;
    }
    $('#rfiTxt').textContent = rfiTable + '-max ' + def.name +
      (info.mode === 'jam' ? ' 開牌（≤' + Ranges.RFI_JAM_BB + 'bb，等於全下）' : ' 開牌') +
      ' range：' + pct.toFixed(1) + '% 的手牌（' + combos + ' combo）' +
      (depth
        ? '｜有效籌碼 ' + info.effBb + 'bb：寬度不變，組成依深度重排（' +
          (info.effBb < Ranges.VS3B_BASE_BB
            ? '淺 → 高張／雜色大牌擠進來，同花小連張掉出去'
            : '深 → 同花連張與小對子擠進來，雜色邊緣牌掉出去') + '，唯讀）'
        : '');
    // 深度模式只鎖「點格子微調」；寬度（% 滑桿）仍可調，深度圖會照新寬度重排
    $('#rfiCustomRow').hidden = !ov;
    $('#btnRfiEdit').disabled = depth;
    if (!rfiSliding) $('#rfiPct').value = pct;
    $('#rfiPctVal').textContent = pct.toFixed(1) + '%';
    if (!rfiStackSliding) $('#rfiStack').value = rfiStackCur;
    $('#rfiStackVal').textContent = rfiStackCur + 'bb';
  }
  $('#rfiStack').addEventListener('input', function () {
    rfiStackSliding = true;
    rfiStackCur = +this.value;
    renderRfi();
  });
  $('#rfiStack').addEventListener('change', function () {
    rfiStackSliding = false;
    renderRfi();
  });
  function buildRfiPosRow() {
    var keys = rfiTable === '9' ? Ranges.RFI_POS_9 : Ranges.RFI_POS_6;
    if (keys.indexOf(rfiPosCur) < 0) rfiPosCur = keys[0];
    $('#rfiPosRow').innerHTML = keys.map(function (k) {
      return '<button class="btn pos-btn' + (k === rfiPosCur ? ' active-role' : '') +
        '" data-pos="' + k + '">' + RFI_TABLES[rfiTable][k].name + '</button>';
    }).join('');
  }
  $('#rfiPosRow').addEventListener('click', function (e) {
    var btn = e.target.closest('.pos-btn');
    if (!btn) return;
    rfiPosCur = btn.dataset.pos;
    $$('#rfiPosRow .pos-btn').forEach(function (b) {
      b.classList.toggle('active-role', b === btn);
    });
    renderRfi();
  });
  $('#rfiTableRow').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-table]');
    if (!btn || btn.dataset.table === rfiTable) return;
    rfiTable = btn.dataset.table;
    $$('#rfiTableRow [data-table]').forEach(function (b) {
      b.classList.toggle('active-role', b === btn);
    });
    buildRfiPosRow();
    renderRfi();
  });
  $('#btnRfiEdit').addEventListener('click', function () {
    rfiEdit = !rfiEdit;
    this.classList.toggle('active-role', rfiEdit);
    this.textContent = rfiEdit ? '✔ 完成編輯' : '✏️ 編輯';
    renderRfi();
  });
  bindFreqToggle('#btnRfiFreq',
    function () { return rfiFreq; },
    function (v) { rfiFreq = v; }, renderRfi);
  $('#rfiGrid').addEventListener('click', function (e) {
    if (!rfiEdit || rfiDepthActive() || rfiFreq) return; // 深度試算 / 頻率檢視為唯讀
    var cell = e.target.closest('.nash-cell');
    if (!cell) return;
    var lbl = PushFold.classLabel(+cell.dataset.i);
    var defMap = rfiDefaultMap();
    var full = Ranges.mergeOverride(defMap, getRangeOverride(rfiChartKey()));
    full[lbl] = Ranges.cycleState('rfi', full[lbl] || 'out');
    setRangeOverride(rfiChartKey(), Ranges.diffOverride(defMap, full));
    renderRfi();
  });
  $('#rfiPct').addEventListener('input', function () {
    rfiSliding = true;
    var full = {};
    PushFold.topPercentRange(+this.value).forEach(function (i) {
      full[PushFold.classLabel(i)] = 'in';
    });
    setRangeOverride(rfiChartKey(), Ranges.diffOverride(rfiDefaultMap(), full));
    renderRfi();
  });
  $('#rfiPct').addEventListener('change', function () {
    rfiSliding = false;
    renderRfi();
  });
  $('#btnRfiReset').addEventListener('click', function () {
    if (!confirm('確定捨棄這張圖的自訂內容，還原為建議 range？')) return;
    setRangeOverride(rfiChartKey(), null);
    renderRfi();
  });
  buildRfiPosRow();
  renderRfi();

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

  // 情境下拉：依 6-max / 9-max 分組（情境數多，分組才找得到）
  (function buildDefSpotOptions() {
    var six = '', nine = '';
    Ranges.DEF_SPOT_KEYS.forEach(function (k) {
      var spot = Ranges.DEF_SPOTS[k];
      var opt = '<option value="' + k + '">' + spot.name + '</option>';
      if (spot.table === 9) nine += opt; else six += opt;
    });
    $('#defSpot').innerHTML =
      '<optgroup label="6-max">' + six + '</optgroup>' +
      '<optgroup label="9-max Full Ring">' + nine + '</optgroup>';
  })();

  var defKeyCur = 'co_vs_utg', defEdit = false, defFreq = false;
  // 兩支滑桿：「對手開牌 %」與「有效籌碼」。每情境快取 { pct: 預設開牌%, thr: 校準門檻 }
  var defDyn = {}, defPctCur = null, defSliding = false;
  var defStackCur = Ranges.VS3B_BASE_BB, defStackSliding = false;
  function defDynInfo(key) {
    if (!defDyn[key]) {
      var set = defSet(key);
      var pct = Ranges.openerOpenPct(key);
      var thr = Ranges.defenseCalibrate(key, PushFold.topPercentRange(pct),
        set.tbCombos, set.tbCombos + set.callCombos);
      defDyn[key] = { pct: pct, thr: thr };
    }
    return defDyn[key];
  }
  function defPctChanged() {
    return defPctCur !== null && Math.abs(defPctCur - defDynInfo(defKeyCur).pct) > 0.25;
  }
  function defDynamicActive() {
    return defPctChanged() || defStackCur !== Ranges.VS3B_BASE_BB;
  }
  function defChartKey() { return 'def:' + defKeyCur; }
  function defDefaultMap() {
    var spot = Ranges.DEF_SPOTS[defKeyCur], map = {};
    PushFold.rangeFromNotation(spot.call)
      .forEach(function (i) { map[PushFold.classLabel(i)] = 'in'; });
    PushFold.rangeFromNotation(spot.threeBet)
      .forEach(function (i) { map[PushFold.classLabel(i)] = 'tb'; });
    return map;
  }
  function renderDef() {
    var spot = Ranges.DEF_SPOTS[defKeyCur];
    var info = defDynInfo(defKeyCur);
    if (defPctCur === null) defPctCur = info.pct;
    var dynamic = defDynamicActive();
    var stackInfo = Ranges.defStackInfo(defKeyCur, defStackCur);
    var ov = dynamic ? null : getRangeOverride(defChartKey());
    var map = dynamic
      ? Ranges.defenseAtDepth(defKeyCur, PushFold.topPercentRange(defPctCur),
          info.thr, defStackCur)
      : Ranges.mergeOverride(defDefaultMap(), ov);
    var html = '', tbCombos = 0, callCombos = 0, i, lbl, st;
    for (i = 0; i < 169; i++) {
      st = map[PushFold.classLabel(i)] || 'out';
      if (st === 'tb') tbCombos += PushFold.comboCount(i);
      else if (st === 'in') callCombos += PushFold.comboCount(i);
    }
    if (defFreq) {
      var fmap = Ranges.defFreqMap(defKeyCur, PushFold.topPercentRange(defPctCur),
        info.thr, defStackCur);
      for (i = 0; i < 169; i++) html += freqCellHtml(i, fmap[PushFold.classLabel(i)], true);
      $('#defGrid').innerHTML = html;
      $('#defGrid').classList.remove('editing');
      $('#defTxt').textContent = spot.name + '（對手開 ' + defPctCur.toFixed(1) + '%，' +
        stackInfo.effBb + 'bb）｜' + freqSummary(fmap, true);
      $('#defSpot').value = defKeyCur;
      $('#defCustomRow').hidden = true;
      $('#btnDefEdit').disabled = true;
      if (!defSliding) $('#defOpenPct').value = defPctCur;
      $('#defOpenPctVal').textContent = defPctCur.toFixed(1) + '%';
      if (!defStackSliding) $('#defStack').value = defStackCur;
      $('#defStackVal').textContent = defStackCur + 'bb';
      return;
    }
    for (i = 0; i < 169; i++) {
      lbl = PushFold.classLabel(i);
      st = map[lbl] || 'out';
      html += '<div class="nash-cell ' + (st === 'in' || st === 'tb' ? st : 'out') +
        '" data-i="' + i + '">' + lbl + '</div>';
    }
    $('#defGrid').innerHTML = html;
    $('#defGrid').classList.toggle('editing', defEdit && !dynamic);
    if (dynamic) {
      $('#defTxt').textContent = '動態試算：對手開 ' + defPctCur.toFixed(1) + '%，有效籌碼 ' +
        stackInfo.effBb + 'bb（3-bet 到 ' + stackInfo.threeBetBb + 'bb' +
        (stackInfo.threeBetAllIn ? '＝全下' : '') + '，跟注賠率 ' +
        (stackInfo.needEq * 100).toFixed(0) + '%，跟注後 SPR ' + stackInfo.spr.toFixed(1) +
        '）→ 3-bet ' + (tbCombos / 1326 * 100).toFixed(1) + '%（' + tbCombos + ' combo）／跟注 ' +
        (callCombos / 1326 * 100).toFixed(1) + '%（' + callCombos + ' combo）。' +
        (stackInfo.mode === 'jamOrFold'
          ? 'SPR 太低 → 沒有平跟，只剩 3-bet 全下或棄牌。'
          : stackInfo.effBb < Ranges.VS3B_BASE_BB
            ? '籌碼淺 → 隱含賠率縮水，小對子與同花連張先掉出跟注；3-bet 因為接近全下而放寬。'
            : stackInfo.effBb > Ranges.VS3B_BASE_BB
              ? '籌碼深 → 隱含賠率變大，跟注變寬、3-bet 價值範圍收緊。' : '') +
        '門檻以 100bb 建議表校準；簡化 equity 近似，阻斷牌 bluff（如 A5s 3-bet）不在模型內。';
    } else {
      $('#defTxt').textContent = spot.sizeTxt + '｜3-bet ' +
        (tbCombos / 1326 * 100).toFixed(1) + '%（' + tbCombos + ' combo）＋跟注 ' +
        (callCombos / 1326 * 100).toFixed(1) + '%（' + callCombos + ' combo）';
    }
    $('#defSpot').value = defKeyCur;
    $('#defCustomRow').hidden = dynamic || !ov;
    $('#btnDefEdit').disabled = dynamic;
    if (!defSliding) $('#defOpenPct').value = defPctCur;
    $('#defOpenPctVal').textContent = defPctCur.toFixed(1) + '%';
    if (!defStackSliding) $('#defStack').value = defStackCur;
    $('#defStackVal').textContent = defStackCur + 'bb';
  }
  $('#defStack').addEventListener('input', function () {
    defStackSliding = true;
    defStackCur = +this.value;
    renderDef();
  });
  $('#defStack').addEventListener('change', function () {
    defStackSliding = false;
    renderDef();
  });
  $('#defSpot').addEventListener('change', function () {
    defKeyCur = this.value;
    defPctCur = defDynInfo(defKeyCur).pct; // 換情境 → 滑桿回到該情境預設開牌寬度
    renderDef();
  });
  $('#defOpenPct').addEventListener('input', function () {
    defSliding = true;
    defPctCur = +this.value;
    renderDef();
  });
  $('#defOpenPct').addEventListener('change', function () {
    defSliding = false;
    renderDef();
  });
  $('#btnDefEdit').addEventListener('click', function () {
    defEdit = !defEdit;
    this.classList.toggle('active-role', defEdit);
    this.textContent = defEdit ? '✔ 完成編輯' : '✏️ 編輯';
    renderDef();
  });
  bindFreqToggle('#btnDefFreq',
    function () { return defFreq; },
    function (v) { defFreq = v; }, renderDef);
  $('#defGrid').addEventListener('click', function (e) {
    if (!defEdit || defDynamicActive() || defFreq) return; // 動態試算 / 頻率檢視為唯讀

    var cell = e.target.closest('.nash-cell');
    if (!cell) return;
    var lbl = PushFold.classLabel(+cell.dataset.i);
    var defMap = defDefaultMap();
    var full = Ranges.mergeOverride(defMap, getRangeOverride(defChartKey()));
    full[lbl] = Ranges.cycleState('def', full[lbl] || 'out');
    setRangeOverride(defChartKey(), Ranges.diffOverride(defMap, full));
    renderDef();
  });
  $('#btnDefReset').addEventListener('click', function () {
    if (!confirm('確定捨棄這張圖的自訂內容，還原為建議 range？')) return;
    setRangeOverride(defChartKey(), null);
    renderDef();
  });
  renderDef();

  /* ---------- 被 3-bet（4-bet / 跟注）range ---------- */
  var v3bKeyCur = Ranges.VS3B_SPOT_KEYS[0], v3bEdit = false, v3bFreq = false;
  // 有效籌碼滑桿：100bb = 建議表，其餘深度依 equity + 隱含賠率門檻動態試算
  var v3bStackCur = Ranges.VS3B_BASE_BB, v3bSliding = false, v3bCalibs = {};
  function v3bCalib(key) {
    if (!v3bCalibs[key]) v3bCalibs[key] = Ranges.vs3bCalibrate(key);
    return v3bCalibs[key];
  }
  function v3bDynamicActive() { return v3bStackCur !== Ranges.VS3B_BASE_BB; }

  (function buildV3bSpotOptions() {
    var six = '', nine = '';
    Ranges.VS3B_SPOT_KEYS.forEach(function (k) {
      var spot = Ranges.VS3B_SPOTS[k];
      var opt = '<option value="' + k + '">' + spot.name + '</option>';
      if (spot.table === 9) nine += opt; else six += opt;
    });
    $('#v3bSpot').innerHTML =
      '<optgroup label="6-max">' + six + '</optgroup>' +
      '<optgroup label="9-max Full Ring（現場取向）">' + nine + '</optgroup>';
  })();

  function v3bChartKey() { return 'vs3b:' + v3bKeyCur; }
  function v3bDefaultMap() {
    var spot = Ranges.VS3B_SPOTS[v3bKeyCur], map = {};
    PushFold.rangeFromNotation(spot.call)
      .forEach(function (i) { map[PushFold.classLabel(i)] = 'in'; });
    PushFold.rangeFromNotation(spot.fourBet)
      .forEach(function (i) { map[PushFold.classLabel(i)] = 'tb'; });
    return map;
  }
  function renderV3b() {
    var spot = Ranges.VS3B_SPOTS[v3bKeyCur];
    var dynamic = v3bDynamicActive();
    var info = Ranges.vs3bStackInfo(v3bKeyCur, v3bStackCur);
    var ov = dynamic ? null : getRangeOverride(v3bChartKey());
    var map = dynamic
      ? Ranges.vs3bDefense(v3bKeyCur, v3bStackCur, v3bCalib(v3bKeyCur))
      : Ranges.mergeOverride(v3bDefaultMap(), ov);
    var html = '', fbCombos = 0, callCombos = 0, i, lbl, st;
    for (i = 0; i < 169; i++) {
      st = map[PushFold.classLabel(i)] || 'out';
      if (st === 'tb') fbCombos += PushFold.comboCount(i);
      else if (st === 'in') callCombos += PushFold.comboCount(i);
    }
    if (v3bFreq) {
      var fmap = Ranges.vs3bFreqMap(v3bKeyCur, v3bStackCur, v3bCalib(v3bKeyCur));
      for (i = 0; i < 169; i++) html += freqCellHtml(i, fmap[PushFold.classLabel(i)], true);
      $('#v3bGrid').innerHTML = html;
      $('#v3bGrid').classList.remove('editing');
      $('#v3bTxt').textContent = spot.name + '（有效籌碼 ' + info.effBb + 'bb）｜' +
        freqSummary(fmap, info.mode === 'normal');
      $('#v3bNote').textContent = '跟注要再投 ' + info.toCall + 'bb 進 ' + info.pot +
        'bb 底池 → 底池賠率約 ' + (info.needEq * 100).toFixed(0) + '%。頻率檢視為唯讀。';
      $('#v3bCustomRow').hidden = true;
      $('#btnV3bEdit').disabled = true;
      $('#v3bSpot').value = v3bKeyCur;
      if (!v3bSliding) $('#v3bStack').value = v3bStackCur;
      $('#v3bStackVal').textContent = v3bStackCur + 'bb';
      return;
    }
    for (i = 0; i < 169; i++) {
      lbl = PushFold.classLabel(i);
      st = map[lbl] || 'out';
      html += '<div class="nash-cell ' + (st === 'in' || st === 'tb' ? st : 'out') +
        '" data-i="' + i + '">' + lbl + '</div>';
    }
    $('#v3bGrid').innerHTML = html;
    $('#v3bGrid').classList.toggle('editing', v3bEdit && !dynamic);
    var aggroTxt = info.mode === 'callAllin' ? '跟全下'
      : info.mode === 'jamOrFold' ? '4-bet 全下' : '4-bet';
    $('#v3bTxt').textContent = spot.hero + ' 開 ' + info.openBb + 'bb → ' + spot.villain +
      ' 3-bet 到 ' + info.tbBb + 'bb（有效籌碼 ' + info.effBb + 'bb）｜' +
      aggroTxt + ' ' + (fbCombos / 1326 * 100).toFixed(1) + '%（' + fbCombos + ' combo）' +
      (info.mode === 'normal'
        ? '＋跟注 ' + (callCombos / 1326 * 100).toFixed(1) + '%（' + callCombos + ' combo）'
        : '，其餘蓋牌');
    var modeTxt = info.mode === 'callAllin'
      ? '籌碼不夠蓋住這個 3-bet → 對手等於直接全下你，只能跟全下或棄。'
      : info.mode === 'jamOrFold'
        ? '跟注後 SPR 只剩 ' + info.spr.toFixed(2) + ' → 沒有平跟的空間，只剩 4-bet 全下或棄牌。'
        : '跟注後 SPR ' + info.spr.toFixed(1) +
          (info.effBb > Ranges.VS3B_BASE_BB
            ? '，籌碼深 → 小對子與同花連張的隱含賠率變大，跟注變寬、4-bet 價值範圍收緊。'
            : info.effBb < Ranges.VS3B_BASE_BB
              ? '，籌碼淺 → 隱含賠率縮水，小對子與同花連張先掉出跟注範圍。'
              : '。');
    $('#v3bNote').textContent = '跟注要再投 ' + info.toCall + 'bb 進 ' + info.pot +
      'bb 底池 → 直接的底池賠率約 ' + (info.needEq * 100).toFixed(0) + '%。' + modeTxt +
      (dynamic ? '（動態試算，唯讀）' : spot.note + '。');
    $('#v3bCustomRow').hidden = dynamic || !ov;
    $('#btnV3bEdit').disabled = dynamic;
    $('#v3bSpot').value = v3bKeyCur;
    if (!v3bSliding) $('#v3bStack').value = v3bStackCur;
    $('#v3bStackVal').textContent = v3bStackCur + 'bb';
  }
  $('#v3bStack').addEventListener('input', function () {
    v3bSliding = true;
    v3bStackCur = +this.value;
    renderV3b();
  });
  $('#v3bStack').addEventListener('change', function () {
    v3bSliding = false;
    renderV3b();
  });
  $('#v3bSpot').addEventListener('change', function () {
    v3bKeyCur = this.value;
    renderV3b();
  });
  $('#btnV3bEdit').addEventListener('click', function () {
    v3bEdit = !v3bEdit;
    this.classList.toggle('active-role', v3bEdit);
    this.textContent = v3bEdit ? '✔ 完成編輯' : '✏️ 編輯';
    renderV3b();
  });
  bindFreqToggle('#btnV3bFreq',
    function () { return v3bFreq; },
    function (v) { v3bFreq = v; }, renderV3b);
  $('#v3bGrid').addEventListener('click', function (e) {
    if (!v3bEdit || v3bDynamicActive() || v3bFreq) return; // 動態試算 / 頻率檢視為唯讀
    var cell = e.target.closest('.nash-cell');
    if (!cell) return;
    var lbl = PushFold.classLabel(+cell.dataset.i);
    var defMap = v3bDefaultMap();
    var full = Ranges.mergeOverride(defMap, getRangeOverride(v3bChartKey()));
    full[lbl] = Ranges.cycleState('vs3b', full[lbl] || 'out');
    setRangeOverride(v3bChartKey(), Ranges.diffOverride(defMap, full));
    renderV3b();
  });
  $('#btnV3bReset').addEventListener('click', function () {
    if (!confirm('確定捨棄這張圖的自訂內容，還原為建議 range？')) return;
    setRangeOverride(v3bChartKey(), null);
    renderV3b();
  });
  renderV3b();

  /* ---------- 翻後 c-bet 速查 ---------- */
  function cardsHtml(cards) {
    return cards.map(cardLabel).join(' ');
  }

  $('#btnCbCalc').addEventListener('click', function () {
    var board, hero = null;
    try {
      board = HANDS.parseCards($('#cbBoard').value, 3);
      var heroTxt = $('#cbHero').value.trim();
      if (heroTxt) {
        hero = HANDS.parseCards(heroTxt, 2);
        HANDS.parseCards(board.concat(hero).map(Evaluator.cardToString).join(' '));
      }
    } catch (err) { alert(err.message); return; }

    var opts = { role: $('#cbRole').value, potType: $('#cbPot').value };
    var tex = Postflop.classifyBoard(board);
    var rp = Postflop.cbetRangePolicy(tex, opts);
    var summary = '<b>' + cardsHtml(board) + '</b>　' + tex.label +
      '（濕度 ' + tex.wetness.toFixed(2) + '）<br>' +
      '整體建議：<b>' + Math.round(rp.freq * 100) + '% 的頻率持續下注</b>，主要尺度 <b>' +
      rp.sizeTxt + '</b>。<br><span class="hint">' + rp.why + '</span>';
    if (hero) {
      var hp = Postflop.cbetHandPolicy(hero, board, opts);
      summary += '<hr>你的 ' + cardsHtml(hero) + '：' + hp.hand.label +
        '（' + hp.hand.bucketTxt + '）→ <b class="' +
        (hp.action === 'check' ? 'neg' : 'pos') + '">' + hp.actionTxt + '</b><br>' +
        '<span class="hint">' + hp.why + '</span>';
    }
    $('#cbSummary').innerHTML = summary;

    var rows = '<tr><th>項目</th><th>值</th></tr>';
    function row(k, v) { rows += '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; }
    row('最大張', Evaluator.RANKS[tex.highCard - 2]);
    row('花色', tex.monotone ? '單色（3 張以上同花色）' : tex.twoTone ? '兩色' : '彩虹');
    row('配對', tex.paired ? (tex.trips ? '三條面' : '配對面') : '無');
    row('順子連結度', tex.straightSpan + ' / 5（同一順子窗內的張數）');
    row('濕度', tex.wetness.toFixed(2) + '（' + tex.wetTxt + '）');
    row('建議 c-bet 頻率', Math.round(rp.freq * 100) + '%');
    row('建議尺度', rp.sizeTxt);
    row('對手面對 33% 的 MDF', (Postflop.mdf(0.33, 1) * 100).toFixed(0) + '%');
    row('對手面對 75% 的 MDF', (Postflop.mdf(0.75, 1) * 100).toFixed(0) + '%');
    $('#cbTable').innerHTML = rows;
    $('#cbResult').hidden = false;
  });

  /* ---------- MDF / 詐唬比速查表 ---------- */
  (function () {
    var SIZES = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5, 2];
    var html = '<tr><th>下注（底池比）</th><th>MDF</th><th>對手棄牌超過</th>' +
      '<th>跟注賠率</th><th>value : bluff</th></tr>';
    SIZES.forEach(function (f) {
      var m = Postflop.mdf(f, 1);
      var need = Postflop.callPotOdds(f, 1);
      // 平衡時 bluff = value × bet/(pot+bet) → value : bluff = (pot+bet) : bet
      var ratio = (1 + f) / f;
      html += '<tr><td>' + Math.round(f * 100) + '%</td><td>' + (m * 100).toFixed(0) +
        '%</td><td>' + ((1 - m) * 100).toFixed(0) + '% 就該詐唬</td><td>' +
        (need * 100).toFixed(0) + '%</td><td>' + ratio.toFixed(1) + ' : 1</td></tr>';
    });
    $('#mdfTable').innerHTML = html;
  })();

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

  /* ---------- 訓練測驗（Push/Fold + 開牌 RFI + 面對開牌 + 被 3-bet） ---------- */
  var QUIZ_KEYS = { pf: 'poker.nash_quiz', rfi: 'poker.rfi_quiz', def: 'poker.def_quiz',
                    v3b: 'poker.v3b_quiz', cb: 'poker.cb_quiz', bc: 'poker.bc_quiz' };
  var quizMode = 'pf'; // 'pf' | 'rfi' | 'def' | 'v3b' | 'cb' | 'bc'

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
       scoreLine('面對開牌', quizScore('def')), scoreLine('被 3-bet', quizScore('v3b')),
       scoreLine('翻後 c-bet', quizScore('cb')), scoreLine('河牌接 bluff', quizScore('bc'))]
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

  // RFI range set 快取（table:pos -> {classIdx: true}）
  var rfiSets = {};
  function rfiNotation(table, pos) { return RFI_TABLES[table][pos].notation; }
  function rfiSet(table, pos) {
    var ck = table + ':' + pos;
    if (!rfiSets[ck]) {
      var set = {};
      PushFold.rangeFromNotation(rfiNotation(table, pos)).forEach(function (i) { set[i] = true; });
      rfiSets[ck] = set;
    }
    return rfiSets[ck];
  }

  // 被 3-bet 情境的 range set 快取（同 defSet，但用 fourBet / call）
  var v3bSets = {};
  function v3bSet(key) {
    if (!v3bSets[key]) {
      var spot = Ranges.VS3B_SPOTS[key];
      var fbSet = {}, callSet = {};
      PushFold.rangeFromNotation(spot.fourBet).forEach(function (i) { fbSet[i] = true; });
      PushFold.rangeFromNotation(spot.call).forEach(function (i) { callSet[i] = true; });
      v3bSets[key] = { fbSet: fbSet, callSet: callSet };
    }
    return v3bSets[key];
  }

  // 測驗抽的籌碼深度：涵蓋跟全下 / 全下-棄 / 一般三種局面，100bb 多放一份當基準
  var QUIZ_DEPTHS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 100, 125, 150, 200, 250, 300];

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  /* 情境要先抽桌型再抽情境。9-max 的情境數是 6-max 的兩倍多，
   * 直接從整份 key 陣列均勻抽，7 成題目都會是 9-max。 */
  function pickSpot(keys, spots) {
    var six = keys.filter(function (k) { return spots[k].table !== 9; });
    var nine = keys.filter(function (k) { return spots[k].table === 9; });
    if (!six.length || !nine.length) return pick(keys);
    return pick(Math.random() < 0.5 ? six : nine);
  }

  function v3bAggroLabel(info) {
    return info.mode === 'callAllin' ? '跟全下'
      : info.mode === 'jamOrFold' ? '4-bet 全下' : '4-bet';
  }
  function v3bActionTxt(info) {
    return info.mode === 'normal'
      ? '4-bet、跟注還是蓋牌'
      : v3bAggroLabel(info) + '還是蓋牌';
  }
  function defAggroLabel(info) { return info.threeBetAllIn ? '3-bet 全下' : '3-bet'; }
  function defActionTxt(info) {
    return info.mode === 'normal'
      ? defAggroLabel(info) + '、跟注還是蓋牌'
      : defAggroLabel(info) + '還是蓋牌';
  }
  /** 該深度下的開牌正解 — 與圖表一致：100bb 看建議表，其餘依深度重排（寬度不變） */
  function rfiStateAt(table, pos, bb, idx) {
    if (bb === Ranges.VS3B_BASE_BB) return rfiSet(table, pos)[idx] ? 'in' : 'out';
    var target = PushFold.rangeComboTotal(PushFold.rangeFromNotation(rfiNotation(table, pos)));
    return Ranges.rfiAtDepth(target, bb)[PushFold.classLabel(idx)] || 'out';
  }
  /** 該深度下的防守正解 — 與圖表一致（對手開牌寬度用該情境預設值） */
  function defStateAt(key, bb, idx) {
    if (bb === Ranges.VS3B_BASE_BB) {
      var set = defSet(key);
      return set.tbSet[idx] ? 'tb' : set.callSet[idx] ? 'in' : 'out';
    }
    var dyn = defDynInfo(key);
    return Ranges.defenseAtDepth(key, PushFold.topPercentRange(dyn.pct), dyn.thr, bb)[
      PushFold.classLabel(idx)] || 'out';
  }
  /** 該深度下某手牌的正解狀態 — 與圖表顯示一致：100bb 看建議表，其餘看動態試算 */
  function v3bStateAt(key, bb, idx) {
    if (bb === Ranges.VS3B_BASE_BB) {
      var set = v3bSet(key);
      return set.fbSet[idx] ? 'tb' : set.callSet[idx] ? 'in' : 'out';
    }
    return Ranges.vs3bDefense(key, bb, v3bCalib(key))[PushFold.classLabel(idx)] || 'out';
  }

  var QUIZ_MODE_BTN = { pf: '#btnQuizModePf', rfi: '#btnQuizModeRfi',
                        def: '#btnQuizModeDef', v3b: '#btnQuizModeV3b',
                        cb: '#btnQuizModeCb', bc: '#btnQuizModeBc' };
  var QUIZ_AGGRO_TXT = { pf: '全下', rfi: '加注', def: '3-bet', v3b: '4-bet',
                         cb: '下注 75%', bc: '' };
  var QUIZ_CALL_TXT = { def: '跟注', v3b: '跟注', cb: '下注 33%', bc: '跟注' };
  var QUIZ_FOLD_TXT = { cb: '過牌' };
  // 有「中間選項」的題型（三選一）；bc 的中間選項就是跟注（沒有加注）
  function quizHasCall(mode) { return !!QUIZ_CALL_TXT[mode]; }
  function quizHasAggro(mode) { return mode !== 'bc'; }
  // 翻後題型的正解來自 postflop.js，沒有混合頻率模型
  function quizIsPreflop(mode) { return mode !== 'cb' && mode !== 'bc'; }

  function setQuizMode(mode) {
    quizMode = mode;
    for (var m in QUIZ_MODE_BTN) {
      if (QUIZ_MODE_BTN.hasOwnProperty(m)) {
        $(QUIZ_MODE_BTN[m]).classList.toggle('active-role', mode === m);
      }
    }
    $('#btnQuizPush').textContent = QUIZ_AGGRO_TXT[mode] || '';
    $('#btnQuizPush').hidden = !quizHasAggro(mode);
    $('#btnQuizCall').hidden = !quizHasCall(mode);
    $('#btnQuizCall').textContent = QUIZ_CALL_TXT[mode] || '跟注';
    $('#btnQuizFold').textContent = QUIZ_FOLD_TXT[mode] || '蓋牌';
    $('#quizBoard').hidden = quizIsPreflop(mode);
    if (!$('#quizRun').hidden) quizNext();
  }

  /* 翻前四種題型在門檻附近是混合策略 → 取出這題的動作頻率，供放寬評分用 */
  function quizFreqs(cur) {
    var lbl = PushFold.classLabel(cur.idx);
    if (cur.mode === 'pf') {
      var p = NashHU.solveCached(cur.S).push[cur.idx];
      return { aggro: p, call: 0, fold: 1 - p };
    }
    if (cur.mode === 'rfi') {
      var target = PushFold.rangeComboTotal(
        PushFold.rangeFromNotation(rfiNotation(cur.table || '6', cur.pos)));
      return Ranges.rfiFreqMap(target, cur.bb)[lbl];
    }
    if (cur.mode === 'def') {
      var dyn = defDynInfo(cur.spot);
      return Ranges.defFreqMap(cur.spot, PushFold.topPercentRange(dyn.pct), dyn.thr, cur.bb)[lbl];
    }
    if (cur.mode === 'v3b') {
      return Ranges.vs3bFreqMap(cur.spot, cur.bb, v3bCalib(cur.spot))[lbl];
    }
    return null;
  }
  function freqTxt(mode, fr, hasCall) {
    return '（模型頻率：' + QUIZ_AGGRO_TXT[mode] + ' ' + Math.round(fr.aggro * 100) + '%' +
      (hasCall ? '、跟注 ' + Math.round(fr.call * 100) + '%' : '') +
      '、棄牌 ' + Math.round(fr.fold * 100) + '%）';
  }
  Object.keys(QUIZ_MODE_BTN).forEach(function (m) {
    $(QUIZ_MODE_BTN[m]).addEventListener('click', function () { setQuizMode(m); });
  });

  var quizCur = null;
  function quizNext() {
    if (quizMode === 'pf') {
      var S = 2 + Math.floor(Math.random() * 14); // 2–15 bb
      quizCur = { mode: 'pf', S: S, idx: randHandIdx() };
      $('#quizInfo').textContent = '你在 SB（按鈕位），有效籌碼 ' + S + ' bb。推還是棄？';
    } else if (quizMode === 'rfi') {
      var rtable = Math.random() < 0.5 ? '6' : '9';
      var pos = pick(rtable === '9' ? Ranges.RFI_POS_9 : Ranges.RFI_POS_6);
      var rbb = pick(QUIZ_DEPTHS);
      var rInfo = Ranges.rfiStackInfo(rbb);
      quizCur = { mode: 'rfi', table: rtable, pos: pos, bb: rbb, idx: randHandIdx() };
      $('#quizInfo').textContent = rtable + '-max，有效籌碼 ' + rInfo.effBb + 'bb，你在 ' +
        RFI_TABLES[rtable][pos].name + '，前面無人入池。' +
        (rInfo.mode === 'jam' ? '開牌等於全下 —— 全下還是蓋牌？' : '開牌加注還是蓋牌？');
      $('#btnQuizPush').textContent = rInfo.mode === 'jam' ? '全下' : '加注';
    } else if (quizMode === 'def') {
      var spotKey = pickSpot(Ranges.DEF_SPOT_KEYS, Ranges.DEF_SPOTS);
      var spot = Ranges.DEF_SPOTS[spotKey];
      var dbb = QUIZ_DEPTHS[Math.floor(Math.random() * QUIZ_DEPTHS.length)];
      var dInfo = Ranges.defStackInfo(spotKey, dbb);
      quizCur = { mode: 'def', spot: spotKey, bb: dbb, idx: randHandIdx() };
      $('#quizInfo').textContent = (spot.table === 9 ? '9-max' : '6-max') + '，有效籌碼 ' +
        dInfo.effBb + 'bb，' + spot.sizeTxt + '，你在 ' + spot.hero + '。' +
        defActionTxt(dInfo) + '？';
      // SPR 太低就沒有平跟這個選項
      $('#btnQuizCall').hidden = dInfo.mode !== 'normal';
      $('#btnQuizPush').textContent = defAggroLabel(dInfo);
    } else if (quizMode === 'cb') {
      var cs = Postflop.buildCbetSpot({});
      quizCur = { mode: 'cb', spot: cs };
      $('#quizBoard').innerHTML = cardsHtml(cs.board) +
        '<span class="board-tag">' + cs.policy.texture.label +
        '（濕度 ' + cs.policy.texture.wetness.toFixed(2) + '）</span>';
      $('#quizInfo').textContent =
        (cs.potType === '3bp' ? '3-bet 底池' : '單次加注底池') + '，你是翻前加注者，' +
        (cs.role === 'ip' ? '有位置' : '無位置') + '，對手過牌給你。' +
        '下注 75%、下注 33% 還是過牌？';
    } else if (quizMode === 'bc') {
      var rs = Postflop.buildRiverSpot({ pot: 10 });
      quizCur = { mode: 'bc', spot: rs };
      $('#quizBoard').innerHTML = cardsHtml(rs.board) +
        '<span class="board-tag">你的牌力：' + rs.heroClass.label + '</span>';
      $('#quizInfo').textContent =
        '河牌，底池 ' + rs.pot + 'bb，對手下注 ' + rs.bet + 'bb（' +
        Math.round(rs.betFrac * 100) + '% 底池）。他這條線的下注 range 是：價值 ' +
        rs.nValue + ' combo（兩對以上）＋詐唬 ' + rs.nBluff +
        ' combo（高牌）。你這手贏光他所有詐唬、輸給所有價值 —— 跟還是棄？';
    } else {
      var vKey = pickSpot(Ranges.VS3B_SPOT_KEYS, Ranges.VS3B_SPOTS);
      var vSpot = Ranges.VS3B_SPOTS[vKey];
      var bb = QUIZ_DEPTHS[Math.floor(Math.random() * QUIZ_DEPTHS.length)];
      var vInfo = Ranges.vs3bStackInfo(vKey, bb);
      quizCur = { mode: 'v3b', spot: vKey, bb: bb, idx: randHandIdx() };
      $('#quizInfo').textContent = (vSpot.table === 9 ? '9-max' : '6-max') +
        '，有效籌碼 ' + vInfo.effBb + 'bb，你在 ' +
        vSpot.hero + ' 開 ' + vInfo.openBb + 'bb，' + vSpot.villain + ' 3-bet 到 ' +
        vInfo.tbBb + 'bb' + (vInfo.mode === 'callAllin' ? '（等於全下你）' : '') + '。' +
        v3bActionTxt(vInfo) + '？';
      // 淺籌碼沒有平跟這個選項 → 該題不給「跟注」按鈕
      $('#btnQuizCall').hidden = vInfo.mode !== 'normal';
      $('#btnQuizPush').textContent = v3bAggroLabel(vInfo);
    }
    if (quizIsPreflop(quizCur.mode)) {
      $('#quizHand').textContent = PushFold.classLabel(quizCur.idx);
      $('#quizBoard').hidden = true;
    } else {
      $('#quizHand').innerHTML = cardsHtml(quizCur.spot.hero);
      $('#quizBoard').hidden = false;
    }
    $('#quizFeedback').hidden = true;
    $('#btnQuizNext').hidden = true;
    $('#btnQuizPush').disabled = false;
    $('#btnQuizCall').disabled = false;
    $('#btnQuizFold').disabled = false;
  }
  // action: 'aggro'（全下/加注/3-bet）| 'call' | 'fold'
  function quizAnswer(action) {
    if (!quizCur) return;
    var ok, detail, bestAct, qKey;
    if (quizCur.mode === 'pf') {
      var sol = NashHU.solveCached(quizCur.S);
      var correct = sol.pushSet[quizCur.idx];
      ok = (action === 'aggro') === !!correct;
      bestAct = correct ? 'aggro' : 'fold';
      qKey = 'pf:' + quizCur.S + ':' + quizCur.idx;
      detail = ' Nash 均衡：' + PushFold.classLabel(quizCur.idx) + ' 在 ' + quizCur.S + ' bb ' +
        (correct ? '應該<b>全下</b>' : '應該<b>蓋牌</b>') +
        '（均衡全下頻率 ' + Math.round(sol.push[quizCur.idx] * 100) + '%）。';
    } else if (quizCur.mode === 'rfi') {
      var rInfo2 = Ranges.rfiStackInfo(quizCur.bb);
      var inRange = rfiStateAt(quizCur.table, quizCur.pos, quizCur.bb, quizCur.idx) === 'in';
      ok = (action === 'aggro') === inRange;
      bestAct = inRange ? 'aggro' : 'fold';
      qKey = 'rfi:' + quizCur.table + ':' + quizCur.pos + ':' + quizCur.bb + ':' + quizCur.idx;
      var rAggro = rInfo2.mode === 'jam' ? '全下' : '加注';
      detail = ' ' + quizCur.table + '-max ' + RFI_TABLES[quizCur.table][quizCur.pos].name +
        ' 開牌（' + rInfo2.effBb + 'bb）：' +
        PushFold.classLabel(quizCur.idx) +
        (inRange ? ' 在開牌 range 內，應該<b>' + rAggro + '</b>。'
                 : ' 不在開牌 range，應該<b>蓋牌</b>。');
    } else if (quizCur.mode === 'def') {
      var dInfo2 = Ranges.defStackInfo(quizCur.spot, quizCur.bb);
      var dst = defStateAt(quizCur.spot, quizCur.bb, quizCur.idx);
      var best = dst === 'tb' ? 'aggro' : dst === 'in' ? 'call' : 'fold';
      ok = action === best;
      bestAct = best;
      qKey = 'def:' + quizCur.spot + ':' + quizCur.bb + ':' + quizCur.idx;
      var bestTxt = best === 'aggro' ? '<b>' + defAggroLabel(dInfo2) + '</b>'
        : best === 'call' ? '<b>跟注</b>' : '<b>蓋牌</b>';
      detail = ' ' + Ranges.DEF_SPOTS[quizCur.spot].name + '（' + dInfo2.effBb + 'bb）：' +
        PushFold.classLabel(quizCur.idx) + ' 應該' + bestTxt +
        '（跟注要投 ' + dInfo2.toCall + 'bb 進 ' + dInfo2.pot + 'bb 底池，需約 ' +
        Math.round(dInfo2.needEq * 100) + '%）。';
    } else if (quizCur.mode === 'cb') {
      var cs2 = quizCur.spot, cp = cs2.policy;
      var cBest = cp.action === 'big' ? 'aggro' : cp.action === 'small' ? 'call' : 'fold';
      ok = action === cBest;
      bestAct = cBest;
      qKey = 'cb:' + cs2.board.concat(cs2.hero).map(Evaluator.cardToString).join('') +
        ':' + cs2.role + ':' + cs2.potType;
      detail = ' ' + cp.texture.label + '（濕度 ' + cp.texture.wetness.toFixed(2) + '），你是 ' +
        cp.hand.label + ' → 應該<b>' + cp.actionTxt + '</b>。' + cp.why +
        '。這個牌面整體建議 c-bet 頻率約 ' + Math.round(cp.rangePolicy.freq * 100) +
        '%、主要尺度 ' + cp.rangePolicy.sizeTxt + '。';
    } else if (quizCur.mode === 'bc') {
      var rs2 = quizCur.spot;
      ok = action === rs2.best;
      bestAct = rs2.best;
      qKey = 'bc:' + rs2.board.concat(rs2.hero).map(Evaluator.cardToString).join('') +
        ':' + rs2.bet + ':' + rs2.nBluff;
      detail = ' 對手詐唬占比 ' + (rs2.equity * 100).toFixed(1) + '%（' + rs2.nBluff + ' bluff / ' +
        (rs2.nBluff + rs2.nValue) + ' 總 combo），你的底池賠率需要 ' +
        (rs2.needEq * 100).toFixed(1) + '% → 應該<b>' + (rs2.best === 'call' ? '跟注' : '蓋牌') +
        '</b>（跟注 EV ' + (rs2.evBB >= 0 ? '+' : '') + rs2.evBB.toFixed(2) + 'bb）。' +
        '平衡的話他該有 ' + rs2.balancedBluff.toFixed(1) + ' 個詐唬 combo，' +
        '他實際 ' + rs2.nBluff + ' 個 → ' +
        (rs2.nBluff > rs2.balancedBluff ? '詐唬過多，你該多跟' : '詐唬不足，你該多棄') +
        '。你面對這個尺度的 MDF 是 ' + (rs2.mdf * 100).toFixed(0) + '%。';
    } else {
      var vInfo2 = Ranges.vs3bStackInfo(quizCur.spot, quizCur.bb);
      var st3 = v3bStateAt(quizCur.spot, quizCur.bb, quizCur.idx);
      var vBest = st3 === 'tb' ? 'aggro' : st3 === 'in' ? 'call' : 'fold';
      ok = action === vBest;
      bestAct = vBest;
      qKey = 'v3b:' + quizCur.spot + ':' + quizCur.bb + ':' + quizCur.idx;
      var vBestTxt = vBest === 'aggro' ? '<b>' + v3bAggroLabel(vInfo2) + '</b>'
        : vBest === 'call' ? '<b>跟注</b>' : '<b>蓋牌</b>';
      detail = ' ' + Ranges.VS3B_SPOTS[quizCur.spot].name + '（' + vInfo2.effBb + 'bb）：' +
        PushFold.classLabel(quizCur.idx) + ' 應該' + vBestTxt +
        '（跟注要投 ' + vInfo2.toCall + 'bb 進 ' + vInfo2.pot + 'bb 底池，需約 ' +
        Math.round(vInfo2.needEq * 100) + '%' +
        (vInfo2.mode === 'normal' ? '，跟注後 SPR ' + vInfo2.spr.toFixed(1) : '') + '）。';
    }
    // 混合策略放寬：門檻附近的手牌本來就有多個動作，選到有足夠頻率的也算對
    if (!ok && quizIsPreflop(quizCur.mode)) {
      var fr = quizFreqs(quizCur);
      if (Ranges.mixTolerates(fr, action, bestAct)) {
        ok = true;
        detail = ' 這手在門檻附近是<b>混合策略</b>，你選的動作也在頻率內 ' +
          freqTxt(quizCur.mode, fr, !$('#btnQuizCall').hidden) + '。' + detail;
      }
    }
    var s = quizScore(quizCur.mode);
    s.total++; if (ok) s.correct++;
    quizSave(quizCur.mode, s);
    // 訓練系統：記錄答題（滾動熟練度 / 錯題本 / 每日任務）
    if (window.TRAINING && window.TRAINING.record) {
      var payload = { idx: quizCur.idx, best: bestAct, info: $('#quizInfo').textContent };
      if (quizCur.mode === 'cb' || quizCur.mode === 'bc') {
        payload.hand = quizCur.spot.hero.map(Evaluator.cardToString).join(' ');
        payload.board = quizCur.spot.board.map(Evaluator.cardToString).join(' ');
        payload.aggro = QUIZ_AGGRO_TXT[quizCur.mode];
        payload.call = QUIZ_CALL_TXT[quizCur.mode];
        payload.fold = QUIZ_FOLD_TXT[quizCur.mode] || '蓋牌';
        payload.noAggro = quizCur.mode === 'bc';
        delete payload.idx;
      } else if (quizCur.mode === 'v3b') {
        var pInfo = Ranges.vs3bStackInfo(quizCur.spot, quizCur.bb);
        payload.aggro = v3bAggroLabel(pInfo);
        payload.noCall = pInfo.mode !== 'normal';
      } else if (quizCur.mode === 'def') {
        var pdInfo = Ranges.defStackInfo(quizCur.spot, quizCur.bb);
        payload.aggro = defAggroLabel(pdInfo);
        payload.noCall = pdInfo.mode !== 'normal';
      } else if (quizCur.mode === 'rfi') {
        payload.aggro = Ranges.rfiStackInfo(quizCur.bb).mode === 'jam' ? '全下' : '加注';
      }
      window.TRAINING.record(quizCur.mode, ok, qKey, payload);
    }
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
  /** 記號優先、留空才用「前 X%」；回傳 {classes, name} */
  function rangeInput(notSel, pctSel, tag) {
    var notation = $(notSel).value.trim();
    if (notation) return { classes: PushFold.rangeFromNotation(notation), name: notation };
    var pct = parseFloat($(pctSel).value);
    if (!(pct > 0 && pct <= 100)) throw new Error(tag + ' 的「前 X%」請輸入 0.1–100');
    return { classes: PushFold.topPercentRange(pct), name: '前 ' + pct + '%' };
  }

  function renderRvrProfile(board, A, B) {
    var pa = Postflop.rangeBoardProfile(A.classes, board);
    var pb = Postflop.rangeBoardProfile(B.classes, board);
    var rows = Postflop.BUCKET_ORDER.map(function (b) {
      var na = pa.buckets[b], nb = pb.buckets[b];
      return '<tr><td>' + Postflop.BUCKET_NAMES[b] + '</td>' +
        '<td>' + na + '（' + (pa.combos ? na / pa.combos * 100 : 0).toFixed(1) + '%）</td>' +
        '<td>' + nb + '（' + (pb.combos ? nb / pb.combos * 100 : 0).toFixed(1) + '%）</td></tr>';
    }).join('');
    $('#rvrProfileTable').innerHTML =
      '<tr><th>牌力</th><th>Range A</th><th>Range B</th></tr>' + rows +
      '<tr><td><b>堅果（三條以上）</b></td><td>' + pa.nutPct.toFixed(1) + '%</td><td>' +
      pb.nutPct.toFixed(1) + '%</td></tr>' +
      '<tr><td><b>空氣</b></td><td>' + pa.airPct.toFixed(1) + '%</td><td>' +
      pb.airPct.toFixed(1) + '%</td></tr>';
    $('#rvrProfileWrap').hidden = false;
    return { a: pa, b: pb };
  }

  $('#btnCalcRvr').addEventListener('click', function () {
    var A, B, board;
    try {
      A = rangeInput('#rvrANot', '#rvrA', 'Range A');
      B = rangeInput('#rvrBNot', '#rvrB', 'Range B');
      board = $('#rvrBoard').value.trim() ? HANDS.parseCards($('#rvrBoard').value) : [];
    } catch (err) { alert(err.message); return; }
    if (!A.classes.length || !B.classes.length) { alert('range 是空的'); return; }
    if (board.length && (board.length < 3 || board.length > 5)) {
      alert('公牌需留空（翻前）或填 3 / 4 / 5 張');
      return;
    }

    function show(eqA, detail) {
      var eqB = 100 - eqA;
      $('#rvrResult').hidden = false;
      $('#rvrATxt').textContent = 'A ' + A.name + '：' + eqA.toFixed(1) + '%';
      $('#rvrBTxt').textContent = 'B ' + B.name + '：' + eqB.toFixed(1) + '%';
      $('#rvrBarA').style.width = eqA + '%';
      $('#rvrBarB').style.width = eqB + '%';
      $('#rvrDetail').textContent = detail;
    }

    if (!board.length) {
      $('#rvrProfileWrap').hidden = true;
      var r;
      try { r = PushFold.rangeVsRangeClasses(A.classes, B.classes); }
      catch (err) { alert(err.message); return; }
      show(r.equityA * 100, '翻前：Range A ' + r.classesA + ' 類 / ' + r.combosA +
        ' combo ｜ Range B ' + r.classesB + ' 類 / ' + r.combosB +
        ' combo（169×169 勝率表加權，忽略 blocker，平手折半計入）');
      return;
    }

    var btn = this;
    btn.disabled = true;
    btn.textContent = '計算中…';
    setTimeout(function () {
      try {
        var res = Postflop.rangeVsRangeBoard(A.classes, B.classes, board, 12000);
        var prof = renderRvrProfile(board, A, B);
        var tex = Postflop.classifyBoard(board);
        var edge = (res.a - res.b) * 100;
        var nutEdge = prof.a.nutPct - prof.b.nutPct;
        show(res.a * 100,
          board.length + ' 張公牌（' + tex.label + '，濕度 ' + tex.wetness.toFixed(2) + '）｜' +
          'range 優勢：' + (edge >= 0 ? 'A' : 'B') + ' 領先 ' + Math.abs(edge).toFixed(1) +
          ' 個百分點；堅果優勢：' + (nutEdge >= 0 ? 'A' : 'B') + ' 多 ' +
          Math.abs(nutEdge).toFixed(1) + ' 個百分點。' +
          'A ' + res.combosA + ' combo／B ' + res.combosB + ' combo，' +
          (res.method === 'exact' ? '窮舉 ' : 'Monte Carlo ') + res.trials + ' 次。');
      } catch (err) { alert(err.message); }
      btn.disabled = false;
      btn.textContent = '計算 range 勝率';
    }, 20);
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
