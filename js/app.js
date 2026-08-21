/* 撲克工具箱 UI：tabs + 記帳 + Equity UI + ICM UI */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var TYPE_NAMES = { cash: t('現金局'), timed: t('限時桌'), mtt: 'MTT', sng: 'SNG', home: 'Homegame' };
  /* 有盲注結構、可算 bb 統計的類型（錦標賽型的 mtt/sng 不算） */
  function isCashLike(type) { return type === 'cash' || type === 'timed' || type === 'home'; }
  function arenaOf(r) { return r.arena || 'live'; }  // 舊紀錄視為現場

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

  /* 圖表分頁的子分段：翻前 range / 翻後・速查 */
  $('#chartSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    $$('#chartSeg button').forEach(function (b) { b.classList.toggle('active-role', b === btn); });
    $('#chartGroupPre').hidden = btn.dataset.group !== 'pre';
    $('#chartGroupPost').hidden = btn.dataset.group !== 'post';
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

  /* --- 多幣別（2026-08-11 Tony，參考 ivey）---
     每筆紀錄存 rec.cur（ISO 代碼），沒存的舊紀錄視為 TWD。
     顯示層統一換算成「顯示幣種」（右上角選、記在 poker.dispCur），
     匯率用 data/fx.json（每日更新），抓不到就用上次快取，再不行只顯示原值。 */
  var CURS = ['TWD', 'KRW', 'USD', 'VND', 'JPY', 'PHP', 'EUR', 'GBP', 'CNY', 'HKD', 'THB', 'MYR', 'SGD'];
  var CUR_SYM = { TWD: 'NT$', KRW: '₩', USD: '$', VND: '₫', JPY: '¥', PHP: '₱', EUR: '€',
    GBP: '£', CNY: 'CN¥', HKD: 'HK$', THB: '฿', MYR: 'RM', SGD: 'S$' };
  var fxRates = null;
  try { fxRates = JSON.parse(localStorage.getItem('poker.fxCache') || 'null'); } catch (e) {}
  fetch('data/fx.json?d=' + new Date().toISOString().slice(0, 10))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.rates) {
        fxRates = d.rates;
        try { localStorage.setItem('poker.fxCache', JSON.stringify(d.rates)); } catch (e) {}
        renderTracker();
      }
    }).catch(function () {});

  function dispCur() { return localStorage.getItem('poker.dispCur') || 'TWD'; }
  function conv(amt, from) {
    from = from || 'TWD';
    var to = dispCur();
    if (from === to || !fxRates || !fxRates[from] || !fxRates[to]) return amt;
    return amt * fxRates[to] / fxRates[from];
  }
  /* 換算後的顯示用副本：金額一律轉成顯示幣種，統計/圖表全吃這份 */
  function viewSessions() {
    return sessions.map(function (r) {
      if ((r.cur || 'TWD') === dispCur()) return r;
      var c = Object.assign({}, r);
      c.buyin0 = r.buyin; c.cashout0 = r.cashout;   // 原幣值，列表顯示用
      c.buyin = conv(r.buyin, r.cur);
      c.cashout = conv(r.cashout, r.cur);
      /* bb 也是錢的單位，一起換算才不會把 bb 統計弄錯 */
      if (c.bb > 0) c.bb = conv(r.bb, r.cur);
      return c;
    });
  }
  var vSessions = sessions;

  /* --- 儀表板篩選（2026-08-14 Tony，參考截圖）：類型頁籤 × 期間（月/年/全部）---
     只影響 hero / 曲線圖 / 統計磚；下方各分析卡與紀錄列表維持全量。 */
  var trkType = localStorage.getItem('poker.trkType') || 'all';
  var heroScope = localStorage.getItem('poker.heroScope') || 'month';
  if (['month', 'year', 'all', 'custom'].indexOf(heroScope) < 0) heroScope = 'month';
  var periodY = new Date().getFullYear();
  var periodM = new Date().getMonth() + 1;
  /* 自訂起訖日（2026-08-15 Tony：月/年/全部之外加自訂，進去可以選幾號到幾號） */
  var customFrom = localStorage.getItem('poker.customFrom') || '';
  var customTo = localStorage.getItem('poker.customTo') || '';
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function typeMatch(r) {
    if (trkType === 'all') return true;
    if (trkType === 'tourney') return r.type === 'mtt' || r.type === 'sng';
    return isCashLike(r.type);
  }
  function periodMatch(r) {
    if (heroScope === 'all') return true;
    var d = String(r.date || '');
    if (heroScope === 'custom') {
      if (customFrom && d < customFrom) return false;
      if (customTo && d > customTo) return false;
      return true;
    }
    if (heroScope === 'year') return d.slice(0, 4) === String(periodY);
    return d.slice(0, 7) === periodY + '-' + pad2(periodM);
  }
  function dashList() {
    return vSessions.filter(function (r) { return typeMatch(r) && periodMatch(r); });
  }
  $('#trkTypeSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    trkType = btn.dataset.ttype;
    try { localStorage.setItem('poker.trkType', trkType); } catch (e2) {}
    renderTracker();
  });
  function stepPeriod(dir) {
    if (heroScope === 'year') { periodY += dir; }
    else {
      periodM += dir;
      if (periodM < 1) { periodM = 12; periodY--; }
      if (periodM > 12) { periodM = 1; periodY++; }
    }
    renderTracker();
  }
  $('#periodPrev').addEventListener('click', function () { stepPeriod(-1); });
  $('#periodNext').addEventListener('click', function () { stepPeriod(1); });
  $('#customFrom').addEventListener('change', function () {
    customFrom = this.value;
    try { localStorage.setItem('poker.customFrom', customFrom); } catch (e) {}
    renderTracker();
  });
  $('#customTo').addEventListener('change', function () {
    customTo = this.value;
    try { localStorage.setItem('poker.customTo', customTo); } catch (e) {}
    renderTracker();
  });

  /* --- bottom sheet 通用開關（2026-08-15 Tony「照 3」：新增改 FAB＋彈出表單）--- */
  function openSheet(id) {
    $('#' + id).hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet(id) {
    $('#' + id).hidden = true;
    document.body.style.overflow = '';
  }
  $$('.sheet-backdrop').forEach(function (bk) {
    bk.addEventListener('click', function (e) { if (e.target === bk) closeSheet(bk.id); });
  });
  $('#fabAddSession').addEventListener('click', function () { openSheet('addSheet'); });
  $('#btnAddSessionDesk').addEventListener('click', function () { openSheet('addSheet'); });
  $('#btnCloseAddSheet').addEventListener('click', function () { closeSheet('addSheet'); });

  // 新增
  /* 幣別選單：新增用 fCur（記住上次選的）、右上角 dispCur = 統一顯示幣種 */
  (function initCurSelects() {
    var fSel = $('#fCur'), dSel = $('#dispCur');
    CURS.forEach(function (c) {
      var o1 = document.createElement('option');
      o1.value = c; o1.textContent = c;
      fSel.appendChild(o1);
      var o2 = document.createElement('option');
      o2.value = c; o2.textContent = c;
      dSel.appendChild(o2);
    });
    fSel.value = localStorage.getItem('poker.lastCur') || 'TWD';
    $('#fArena').value = localStorage.getItem('poker.lastArena') || 'live';
    dSel.value = dispCur();
    dSel.addEventListener('change', function () {
      try { localStorage.setItem('poker.dispCur', dSel.value); } catch (e) {}
      renderTracker();
    });
  })();

  /* 現場行為標籤（2026-08-11，參考 ivey 行為觀察）——canonical 為繁中，顯示走 t() */
  var MOODS = ['狀態好', '疲勞', '上頭', '分心', 'Read 準', 'Read 失誤', '魚多', '桌硬'];
  (function initMoodChips() {
    var box = $('#fMood');
    MOODS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mood-chip';
      b.dataset.mood = m;
      b.textContent = t(m);
      b.addEventListener('click', function () { b.classList.toggle('active'); });
      box.appendChild(b);
    });
  })();
  function pickedMoods() {
    var out = [];
    $('#fMood').querySelectorAll('.mood-chip.active').forEach(function (b) { out.push(b.dataset.mood); });
    return out;
  }

  /* 中途事件（補碼/暫停…，2026-08-11 參考 ivey 的 session 時間軸）
     金額為該筆紀錄的幣別；補碼金額只作紀錄，總買入仍以「買入」欄為準（欄名已註明含 rebuy） */
  var EVT_KINDS = ['補碼', '加碼', '暫停', '繼續'];
  $('#btnAddEvt').addEventListener('click', function () {
    var row = document.createElement('div');
    row.className = 'evt-row';
    var sel = document.createElement('select');
    EVT_KINDS.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = t(k);
      sel.appendChild(o);
    });
    var tm = document.createElement('input');
    tm.type = 'time';
    var amt = document.createElement('input');
    amt.type = 'number'; amt.inputMode = 'decimal'; amt.min = '0'; amt.step = 'any';
    amt.placeholder = t('金額');
    sel.addEventListener('change', function () {
      amt.style.visibility = (sel.value === '暫停' || sel.value === '繼續') ? 'hidden' : 'visible';
    });
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'del-btn'; del.textContent = '✕';
    del.addEventListener('click', function () { row.remove(); });
    row.appendChild(sel); row.appendChild(tm); row.appendChild(amt); row.appendChild(del);
    $('#evtEditor').appendChild(row);
  });
  function pickedEvents() {
    var out = [];
    $('#evtEditor').querySelectorAll('.evt-row').forEach(function (row) {
      var sel = row.querySelector('select'), tm = row.querySelector('input[type=time]'),
          amt = row.querySelector('input[type=number]');
      var a = parseFloat(amt.value) || 0;
      out.push({ k: sel.value, t: tm.value || '', amt: a > 0 ? a : undefined });
    });
    return out;
  }

  $('#fDate').value = new Date().toISOString().slice(0, 10);
  $('#sessionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (sessions.length >= Pro.limit('records')) {
      Pro.hitLimit(t('免費版最多記 10 筆，升級 Pro 可無限記錄。'));
      return;
    }
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
      cur: $('#fCur').value,
      arena: $('#fArena').value,
      note: $('#fNote').value.trim()
    };
    var moods = pickedMoods();
    if (moods.length) rec.mood = moods;
    var evts = pickedEvents();
    if (evts.length) rec.events = evts;
    try {
      localStorage.setItem('poker.lastCur', rec.cur);
      localStorage.setItem('poker.lastArena', rec.arena);
    } catch (e) {}
    sessions.push(rec);
    saveSessions(sessions);
    $('#fVenue').value = ''; $('#fTag').value = '';
    $('#fBuyin').value = ''; $('#fCashout').value = '';
    $('#fHours').value = ''; $('#fBB').value = ''; $('#fNote').value = '';
    $('#fMood').querySelectorAll('.mood-chip.active').forEach(function (b) { b.classList.remove('active'); });
    $('#evtEditor').innerHTML = '';
    closeSheet('addSheet');
    renderTracker();
  });

  // 篩選
  $('#filterType').addEventListener('change', function () { listExpanded = false; renderList(); });
  $('#filterArena').addEventListener('change', function () { listExpanded = false; renderList(); });

  /* 歷史記錄先顯示 10 筆，其餘收折（2026-08-14 Tony） */
  var LIST_LIMIT = 10;
  var listExpanded = false;
  $('#btnMoreSessions').addEventListener('click', function () {
    listExpanded = !listExpanded;
    renderList();
  });

  function renderList() {
    var filter = $('#filterType').value;
    var arenaF = $('#filterArena').value;
    var ul = $('#sessionList');
    ul.innerHTML = '';
    var shown = vSessions
      .filter(function (r) {
        return (filter === 'all' || r.type === filter) &&
               (arenaF === 'all' || arenaOf(r) === arenaF);
      })
      .slice()
      .sort(function (a, b) {
        return b.date < a.date ? -1 : b.date > a.date ? 1 : (b.id < a.id ? -1 : 1);
      });
    var moreBtn = $('#btnMoreSessions');
    if (!shown.length) {
      ul.innerHTML = t('<li class="empty-msg">尚無紀錄</li>');
      moreBtn.hidden = true;
      return;
    }
    if (shown.length > LIST_LIMIT) {
      moreBtn.hidden = false;
      moreBtn.textContent = listExpanded
        ? t('收合')
        : t('顯示其餘 ') + (shown.length - LIST_LIMIT) + t(' 筆');
      if (!listExpanded) shown = shown.slice(0, LIST_LIMIT);
    } else {
      moreBtn.hidden = true;
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
      if (arenaOf(r) === 'online') badge.textContent += '·' + t('線上');
      title.appendChild(badge);
      title.appendChild(document.createTextNode(r.date + (r.venue ? ' · ' + r.venue : '') +
        (r.tag ? t(' · ＃') + r.tag : '')));
      var sub = document.createElement('div');
      sub.className = 'session-sub';
      var curTag = (r.cur && r.cur !== dispCur())
        ? t('（原幣 ') + (CUR_SYM[r.cur] || r.cur + ' ') + fmtMoney(r.cashout0 - r.buyin0) + t('）') : '';
      var bbTxt = (isCashLike(r.type) && r.bb > 0)
        ? t(' ｜ ') + fmtPL(Math.round(pl / r.bb * 10) / 10) + ' bb' : '';
      sub.textContent = t('買入 ') + fmtMoney(r.buyin) + t(' → 兌現 ') + fmtMoney(r.cashout) +
        curTag + bbTxt +
        (r.hours ? t(' ｜ ') + r.hours + t(' 小時') : '') +
        (r.mood && r.mood.length ? t(' ｜ ') + r.mood.map(function (m) { return t(m); }).join('·') : '') +
        (r.events && r.events.length ? t(' ｜ ⏱ ') + r.events.length + t(' 事件') : '') +
        (r.note ? t(' ｜ ') + r.note : '');
      main.appendChild(title);
      main.appendChild(sub);
      if (r.events && r.events.length) {
        var tl = document.createElement('div');
        tl.className = 'session-timeline';
        tl.hidden = true;
        var sym = CUR_SYM[r.cur || 'TWD'] || '';
        r.events.forEach(function (ev2) {
          var line = document.createElement('div');
          line.className = 'timeline-line';
          line.textContent = (ev2.t ? ev2.t + '　' : '') + t(ev2.k) +
            (ev2.amt ? '　+' + sym + fmtMoney(ev2.amt) : '');
          tl.appendChild(line);
        });
        main.appendChild(tl);
        main.style.cursor = 'pointer';
        main.addEventListener('click', function () { tl.hidden = !tl.hidden; });
      }
      var plEl = document.createElement('span');
      plEl.className = 'session-pl ' + (pl > 0 ? 'pos' : pl < 0 ? 'neg' : 'muted');
      plEl.textContent = fmtPL(pl);
      var del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.setAttribute('aria-label', t('刪除'));
      del.addEventListener('click', function () {
        UI.confirm(t('刪除這筆紀錄？')).then(function (ok) {
          if (!ok) return;
          sessions = sessions.filter(function (x) { return x.id !== r.id; });
          saveSessions(sessions);
          renderTracker();
        });
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
      [t('現金局'), vSessions.filter(function (r) { return r.type === 'cash'; }), false],
      ['MTT', vSessions.filter(function (r) { return r.type === 'mtt'; }), true],
      ['SNG', vSessions.filter(function (r) { return r.type === 'sng'; }), true]
    ];
    /* 限時桌/私場：有紀錄才佔一列 */
    var timed = vSessions.filter(function (r) { return r.type === 'timed'; });
    var home = vSessions.filter(function (r) { return r.type === 'home'; });
    if (timed.length) cats.push([t('限時桌'), timed, false]);
    if (home.length) cats.push([t('私場'), home, false]);
    /* 現場/線上拆列：兩邊都有才顯示 */
    var lv = vSessions.filter(function (r) { return arenaOf(r) === 'live'; });
    var ol = vSessions.filter(function (r) { return arenaOf(r) === 'online'; });
    if (lv.length && ol.length) {
      cats.push([t('現場'), lv, false]);
      cats.push([t('線上'), ol, false]);
    }
    cats.push([t('總計'), vSessions, false]);
    var html = t('<tr><th>類別</th><th>場次</th><th>總買入</th><th>總盈虧</th><th>ROI%</th><th>ITM%</th></tr>');
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
      if (isCashLike(r.type) && r.bb > 0 && r.hours > 0) {
        bbSum += (r.cashout - r.buyin) / r.bb;
        bbHours += r.hours;
      }
    });
    return { n: n, mean: mean, sd: sd, maxDD: maxDD, hours: hours,
             hourly: hours > 0 ? plHr / hours : null,
             bbPerHr: bbHours > 0 ? bbSum / bbHours : null };
  }

  function renderAdvStats() {
    var s = advStats(vSessions);
    var tbl = $('#advStatsTable'), hint = $('#advStatsHint');
    /* 沒紀錄也照樣渲染 0 值表格（2026-08-15 Tony：空白時先以 0 撐出版面該有的樣子） */
    function row(k, v, cls) {
      return '<tr><td>' + k + '</td><td class="' + (cls || '') + '">' + v + '</td></tr>';
    }
    var html = t('<tr><th>指標</th><th>數值</th></tr>');
    html += row(t('每場平均盈虧'), fmtPL(Math.round(s.mean * 100) / 100),
      s.mean > 0 ? 'pos' : s.mean < 0 ? 'neg' : 'muted');
    html += row(t('每場標準差 σ'), fmtMoney(Math.round(s.sd * 100) / 100));
    html += row(t('最大回撤'), s.maxDD > 0 ? '-' + fmtMoney(Math.round(s.maxDD * 100) / 100) : '0',
      s.maxDD > 0 ? 'neg' : 'muted');
    html += row(t('時薪（有填時數的場次）'),
      s.hourly === null ? t('—（未填時數）') : fmtPL(Math.round(s.hourly * 100) / 100) + ' /hr',
      s.hourly === null ? 'muted' : s.hourly > 0 ? 'pos' : 'neg');
    if (s.bbPerHr !== null) {
      var bb100 = s.bbPerHr / 30 * 100; // 現場約 30 手/小時
      html += row(t('現金局 bb/hr'), fmtPL(Math.round(s.bbPerHr * 100) / 100),
        s.bbPerHr > 0 ? 'pos' : 'neg');
      html += row(t('現金局 bb/100（估）'), fmtPL(Math.round(bb100 * 10) / 10),
        bb100 > 0 ? 'pos' : 'neg');
    } else {
      html += row(t('現金局 bb/hr'), t('—（現金局需填大盲＋時數）'), 'muted');
    }
    if (s.mean > 0 && s.sd > 0) {
      // 破產風險模型：RoR = exp(-2μB/σ²) → B = σ²·ln(1/risk)/(2μ)
      var br5 = s.sd * s.sd * Math.log(20) / (2 * s.mean);
      var br1 = s.sd * s.sd * Math.log(100) / (2 * s.mean);
      html += row(t('建議資金（破產風險 ≤5%）'), fmtMoney(Math.ceil(br5)));
      html += row(t('建議資金（破產風險 ≤1%）'), fmtMoney(Math.ceil(br1)));
      hint.textContent = t('資金建議用 Kelly 式破產風險模型 RoR = exp(−2μB/σ²)，') +
        t('假設每場盈虧近似常態且 winrate 不變，僅供參考。');
    } else if (s.n < 2) {
      hint.textContent = t('滿 2 筆紀錄後統計才有意義。填時數可算時薪。');
    } else {
      hint.textContent = s.mean <= 0
        ? t('平均盈虧 ≤ 0，任何資金長期都會歸零 — 資金建議不適用，先改善 winrate。')
        : '';
    }
    if (s.bbPerHr !== null) {
      hint.textContent += t(' bb/100 以現場約 30 手/小時換算，僅供參考。');
    }
    tbl.innerHTML = html;
  }

  /* --- 標籤分析 --- */
  function renderTagStats() {
    var tbl = $('#tagStatsTable'), hint = $('#tagStatsHint');
    if (!sessions.length) {
      tbl.innerHTML = '';
      hint.textContent = t('新增紀錄後顯示。無標籤的紀錄以場地分組。');
      return;
    }
    hint.textContent = t('無標籤的舊紀錄以場地分組；依總盈虧排序。');
    var groups = TrackerStats.tagStats(vSessions);
    var html = t('<tr><th>標籤</th><th>場次</th><th>總盈虧</th><th>時薪</th></tr>');
    groups.forEach(function (g) {
      var plCls = g.pl > 0 ? 'pos' : g.pl < 0 ? 'neg' : 'muted';
      html += '<tr><td>' + escapeHtml(g.tag) + '</td><td>' + g.n +
        '</td><td class="' + plCls + '">' + fmtPL(g.pl) + '</td><td>' +
        (g.hourly === null ? '—' : fmtPL(Math.round(g.hourly * 100) / 100) + ' /hr') +
        '</td></tr>';
    });
    tbl.innerHTML = html;
  }

  /* --- 行為分析（mood 標籤 × 盈虧）--- */
  function renderMoodStats() {
    var tbl = $('#moodStatsTable'), hint = $('#moodStatsHint');
    var groups = TrackerStats.moodStats(vSessions);
    if (!groups.length) {
      tbl.innerHTML = '';
      hint.textContent = t('新增紀錄時點選「現場狀態」標籤，這裡會顯示每種狀態下的盈虧。');
      return;
    }
    hint.textContent = t('依平均盈虧排序 — 平均為負的狀態，就是該避開的開局訊號。');
    var html = t('<tr><th>狀態</th><th>場次</th><th>總盈虧</th><th>平均</th></tr>');
    groups.forEach(function (g) {
      var plCls = g.pl > 0 ? 'pos' : g.pl < 0 ? 'neg' : 'muted';
      var avgCls = g.avg > 0 ? 'pos' : g.avg < 0 ? 'neg' : 'muted';
      html += '<tr><td>' + escapeHtml(t(g.tag)) + '</td><td>' + g.n +
        '</td><td class="' + plCls + '">' + fmtPL(Math.round(g.pl)) +
        '</td><td class="' + avgCls + '">' + fmtPL(Math.round(g.avg)) + '</td></tr>';
    });
    tbl.innerHTML = html;
  }

  /* --- 洞察卡（規則型統計，門檻兩側 n≥5）--- */
  function renderInsights() {
    var card = $('#insightCard'), box = $('#insightBox');
    var facts = TrackerStats.insights(vSessions);
    if (!facts.length) { card.hidden = true; return; }
    card.hidden = false;
    box.innerHTML = '';
    facts.forEach(function (f) {
      var txt = '';
      if (f.k === 'weekday') {
        txt = (f.a >= f.b)
          ? '📅 ' + t('平日平均每場 ') + fmtPL(Math.round(f.a)) + t('，週末 ') + fmtPL(Math.round(f.b)) + t(' — 上班日才是你的主場')
          : '📅 ' + t('週末平均每場 ') + fmtPL(Math.round(f.b)) + t('，平日 ') + fmtPL(Math.round(f.a)) + t(' — 你在週末狀態更好');
      } else if (f.k === 'venue-best') {
        txt = '🏆 ' + t('在「') + f.name + t('」平均每場 ') + fmtPL(Math.round(f.a)) +
          t('（') + f.an + t(' 場）— 你最賺的場地');
      } else if (f.k === 'venue-worst') {
        txt = '⚠️ ' + t('在「') + f.name + t('」平均每場 ') + fmtPL(Math.round(f.a)) +
          t('（') + f.an + t(' 場）— 考慮避開或檢討打法');
      } else if (f.k === 'duration') {
        txt = (f.a >= f.b)
          ? '⏱ ' + t('短場（≤') + f.med + t(' 小時）平均 ') + fmtPL(Math.round(f.a)) + t('，長場 ') + fmtPL(Math.round(f.b)) + t(' — 見好就收對你有利')
          : '⏱ ' + t('長場（>') + f.med + t(' 小時）平均 ') + fmtPL(Math.round(f.b)) + t('，短場 ') + fmtPL(Math.round(f.a)) + t(' — 你適合打深場');
      } else if (f.k === 'arena') {
        txt = '🎰 ' + t('現場平均每場 ') + fmtPL(Math.round(f.a)) + t('，線上 ') + fmtPL(Math.round(f.b)) +
          (f.a >= f.b ? t(' — 現場是你的優勢區') : t(' — 線上是你的優勢區'));
      } else if (f.k === 'mood') {
        txt = '🏷 ' + t('標「') + t(f.name) + t('」的場次平均 ') + fmtPL(Math.round(f.a)) +
          t('，整體平均 ') + fmtPL(Math.round(f.b));
      }
      if (!txt) return;
      var p = document.createElement('p');
      p.className = 'insight-item';
      p.textContent = txt;
      box.appendChild(p);
    });
  }

  /* --- 月報 --- */
  function renderMonthly() {
    var tbl = $('#monthlyTable'), chart = $('#monthlyChart'), hint = $('#monthlyHint');
    chart.innerHTML = '';
    if (!sessions.length) {
      tbl.innerHTML = '';
      hint.textContent = t('新增紀錄後顯示每月盈虧。');
      return;
    }
    hint.textContent = '';
    var months = TrackerStats.monthlyStats(vSessions);
    var html = t('<tr><th>月份</th><th>場次</th><th>盈虧</th><th>時數</th></tr>');
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
    var st = TrackerStats.tiltStats(vSessions);
    if (st.afterLossCount < 5) {
      box.textContent = t('樣本不足（連輸後的場次需 ≥ 5，目前 ') + st.afterLossCount +
        t('），累積更多紀錄後顯示分析。');
      return;
    }
    var after = Math.round(st.afterLossAvg * 100) / 100;
    var overall = Math.round(st.overallAvg * 100) / 100;
    var msg = t('輸錢場次後的平均盈虧 ') + fmtPL(after) + t(' vs 整體平均 ') + fmtPL(overall) +
      t('（樣本 ') + st.afterLossCount + t(' 場）');
    if (st.afterLossAvg < st.overallAvg) {
      msg += t(' —— 連輸後表現明顯變差，注意傾斜（tilt）。');
    } else {
      msg += t(' —— 未見明顯傾斜跡象。');
    }
    msg += t(' 最長連敗：') + st.longestLossStreak + t(' 場。');
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
      ul.innerHTML = t('<li class="empty-msg">尚無筆記</li>');
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
      del.setAttribute('aria-label', t('刪除筆記'));
      del.addEventListener('click', function () {
        UI.confirm(t('刪除這則筆記？')).then(function (ok) {
          if (!ok) return;
          notes = notes.filter(function (x) { return x.id !== nt.id; });
          saveNotes(notes);
          renderNotes();
        });
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

    var ordered = dashList().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1);
    });
    /* x 位置（0~1）：月檢視照日、年檢視照月日、全部照場次序 */
    function fracOf(r) {
      var d = String(r.date || '');
      if (heroScope === 'month') {
        var days = new Date(periodY, periodM, 0).getDate();
        return Math.min(1, (parseInt(d.slice(8, 10), 10) || 1) / days);
      }
      if (heroScope === 'year') {
        var m = parseInt(d.slice(5, 7), 10) || 1;
        var dim = new Date(periodY, m, 0).getDate();
        return Math.min(1, (m - 1 + (parseInt(d.slice(8, 10), 10) || 1) / dim) / 12);
      }
      return 0; /* 全部：下面改成場次序 */
    }
    var pts = [0], xs = [0], cum = 0;
    ordered.forEach(function (r) { cum += r.cashout - r.buyin; pts.push(cum); xs.push(fracOf(r)); });
    if (heroScope === 'all' || heroScope === 'custom') {
      for (var xi = 0; xi < xs.length; xi++) xs[xi] = ordered.length ? xi / ordered.length : 0;
    }

    /* 現場/線上分線（兩邊都有紀錄才畫）；比例尺要涵蓋三條線，不然分線會衝出畫布 */
    var hasLive = ordered.some(function (r) { return arenaOf(r) === 'live'; });
    var hasOnline = ordered.some(function (r) { return arenaOf(r) === 'online'; });
    var split = hasLive && hasOnline;
    var lvPts = [0], olPts = [0];
    if (split) {
      var lc = 0, oc = 0;
      ordered.forEach(function (r) {
        var p = r.cashout - r.buyin;
        if (arenaOf(r) === 'live') lc += p; else oc += p;
        lvPts.push(lc); olPts.push(oc);
      });
    }
    var allPts = split ? pts.concat(lvPts, olPts) : pts;

    var padL = 46, padR = 10, padT = 12, padB = 22;
    var w = cssW - padL - padR, h = cssH - padT - padB;
    var min = Math.min.apply(null, allPts), max = Math.max.apply(null, allPts);
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    min -= span * 0.08; max += span * 0.08;

    function x(i) { return padL + xs[i] * w; }
    function y(v) { return padT + (max - v) / (max - min) * h; }

    // 格線 + Y 軸標籤
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#8b91a3';
    ctx.strokeStyle = '#333848';
    ctx.lineWidth = 1;
    var ticks = 4;
    for (var tk = 0; tk <= ticks; tk++) {
      var v = min + (max - min) * tk / ticks;
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
    // X 軸刻度：月＝日、年＝月、全部＝場次
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b91a3';
    if (heroScope === 'month') {
      var days2 = new Date(periodY, periodM, 0).getDate();
      [1, 6, 11, 16, 21, 26, days2].forEach(function (d2) {
        ctx.fillText(pad2(d2), padL + d2 / days2 * w, cssH - 6);
      });
    } else if (heroScope === 'year') {
      for (var mm = 1; mm <= 12; mm++) {
        ctx.fillText(pad2(mm), padL + (mm - 0.5) / 12 * w, cssH - 6);
      }
    } else {
      ctx.fillText('0', padL, cssH - 6);
      if (pts.length > 1) ctx.fillText(String(pts.length - 1) + t(' 場'), padL + w, cssH - 6);
    }

    if (pts.length < 2) {
      ctx.textAlign = 'center';
      ctx.fillText(t(vSessions.length ? '此期間尚無紀錄' : '新增紀錄後顯示走勢'), cssW / 2, cssH / 2);
      return;
    }
    function drawLine(series, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      series.forEach(function (v, i) {
        if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v));
      });
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x(series.length - 1), y(series[series.length - 1]), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 現場 / 線上 都有紀錄 → 三條線（2026-08-12 Tony）；否則維持單線 */
    if (split) {
      drawLine(lvPts, '#3ecf7a', 1.6);
      drawLine(olPts, '#6ea8fe', 1.6);
      drawLine(pts, '#e8c87e', 2.4);
      /* 圖例 */
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      var lx = padL + 4;
      [['#e8c87e', t('合計')], ['#3ecf7a', t('現場')], ['#6ea8fe', t('線上')]].forEach(function (lg) {
        ctx.fillStyle = lg[0];
        ctx.fillRect(lx, padT, 10, 3);
        ctx.fillText(lg[1], lx + 14, padT + 5);
        lx += 14 + ctx.measureText(lg[1]).width + 14;
      });
    } else {
      drawLine(pts, cum >= 0 ? '#3ecf7a' : '#ff5c6c', 2);
    }
  }
  window.addEventListener('resize', drawChart);

  /* --- 大字盈虧 hero 卡（ivey 式，2026-08-11 Tony）--- */
  $('#heroScope').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    heroScope = btn.dataset.scope;
    try { localStorage.setItem('poker.heroScope', heroScope); } catch (e2) {}
    renderTracker();
  });

  function renderHero() {
    var btns = $('#heroScope').querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.scope === heroScope);
    }
    var tbtns = $('#trkTypeSeg').querySelectorAll('.seg-btn');
    for (var j = 0; j < tbtns.length; j++) {
      tbtns[j].classList.toggle('active', tbtns[j].dataset.ttype === trkType);
    }
    var nav = $('#periodNav');
    nav.hidden = heroScope === 'all' || heroScope === 'custom';
    var cr = $('#customRange');
    cr.hidden = heroScope !== 'custom';
    if (heroScope === 'custom') {
      $('#customFrom').value = customFrom;
      $('#customTo').value = customTo;
    }
    $('#periodLabel').textContent =
      heroScope === 'year' ? String(periodY) : periodY + '/' + pad2(periodM);
    var list = dashList();
    var num = $('#heroNum'), sub = $('#heroSub');
    if (!list.length) {
      /* 空白也照版面該有的樣子顯示 0（2026-08-15 Tony） */
      num.textContent = '0 ' + dispCur();
      num.className = 'hero-num muted';
      sub.textContent = '0' + t(' 場') + '　·　' +
        t(heroScope === 'all' ? '尚無紀錄' : '此期間尚無紀錄');
      return;
    }
    var s = advStats(list);
    var pl = 0;
    list.forEach(function (r) { pl += r.cashout - r.buyin; });
    num.textContent = fmtPL(Math.round(pl)) + ' ' + dispCur();
    num.className = 'hero-num ' + (pl > 0 ? 'pos' : pl < 0 ? 'neg' : 'muted');
    var bits = [list.length + t(' 場')];
    if (s.bbPerHr !== null) bits.push(fmtPL(Math.round(s.bbPerHr * 10) / 10) + ' bb/hr');
    sub.textContent = bits.join('　·　');
  }

  /* --- 統計磚 2×3（2026-08-14，參考截圖）--- */
  var TILE_ICONS = {
    n: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    avg: '<path d="M3 17l6-6 4 4 8-8"/>',
    win: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3"/>',
    roi: '<circle cx="6.5" cy="6.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/><path d="M19 5L5 19"/>',
    hourly: '<path d="M12 3v18M16.5 7.5A3.5 3.5 0 0 0 13 5h-2a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2a3.5 3.5 0 0 1-3.5-2.5"/>'
  };
  function renderTiles() {
    var box = $('#statTiles');
    var s = TrackerStats.summary(dashList());
    function plCls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
    /* 完全沒紀錄時以 0 撐出版面；有紀錄但缺欄位（沒填時數等）維持 — */
    var zero = !s.n;
    var tiles = [
      [t('總場次'), String(s.n || 0), '', 'n'],
      [t('總時數'), s.hours > 0 ? (Math.round(s.hours * 10) / 10) + ' h' : (zero ? '0 h' : '—'), '', 'hours'],
      [t('平均損益'), s.n ? fmtPL(Math.round(s.avg * 10) / 10) : '0', plCls(zero ? 0 : s.avg), 'avg'],
      [t('勝率'), s.winRate === null ? (zero ? '0%' : '—') : s.winRate.toFixed(1) + '%', '', 'win'],
      ['ROI', s.roi === null ? (zero ? '0%' : '—') : (s.roi > 0 ? '+' : '') + s.roi.toFixed(1) + '%', plCls(zero ? 0 : s.roi), 'roi'],
      [t('每小時損益'), s.hourly === null ? (zero ? '0' : '—') : fmtPL(Math.round(s.hourly * 10) / 10), plCls(zero ? 0 : s.hourly), 'hourly']
    ];
    box.innerHTML = tiles.map(function (tl) {
      return '<div class="stat-tile"><div class="stat-tile-head"><span>' + tl[0] +
        '</span><svg viewBox="0 0 24 24" aria-hidden="true">' + TILE_ICONS[tl[3]] +
        '</svg></div><div class="stat-tile-val ' + tl[2] + '">' + tl[1] + '</div></div>';
    }).join('');
  }

  function renderTracker() {
    vSessions = viewSessions();
    renderHero();
    renderTiles();
    renderList();
    renderStats();
    renderInsights();
    renderAdvStats();
    renderTagStats();
    renderMoodStats();
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
    var rows = [[t('日期'), t('類型'), t('場域'), t('場地'), t('標籤'), t('幣別'), t('買入'), t('兌現'), t('盈虧'), t('時數'), t('大盲'), t('備註')]];
    sessions.forEach(function (r) {
      rows.push([r.date, TYPE_NAMES[r.type] || r.type, arenaOf(r) === 'online' ? t('線上') : t('現場'),
        r.venue, r.tag || '', r.cur || 'TWD', r.buyin, r.cashout,
        r.cashout - r.buyin, r.hours || '', r.bb || '', r.note]);
    });
    var csv = '\uFEFF' + rows.map(function (row) { return row.map(csvEscape).join(','); }).join('\r\n');
    download('poker-sessions.csv', csv, 'text/csv;charset=utf-8');
  });
  $('#btnExportJson').addEventListener('click', function () {
    if (!Pro.has()) { Pro.hitLimit(t('JSON 匯出入是 Pro 功能，免費版可以匯出 CSV。')); return; }
    download('poker-sessions.json', JSON.stringify(sessions, null, 2), 'application/json');
  });
  $('#btnImportJson').addEventListener('click', function () {
    if (!Pro.has()) { Pro.hitLimit(t('JSON 匯出入是 Pro 功能，免費版可以匯出 CSV。')); return; }
    $('#importFile').click();
  });
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
        UI.confirm(t('匯入 ') + valid.length + t(' 筆紀錄？（將加到現有紀錄後）')).then(function (ok) {
          if (!ok) return;
          sessions = sessions.concat(valid);
          saveSessions(sessions);
          renderTracker();
        });
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
      label.textContent = villainCount === 1 ? 'Villain' : t('對手 ') + (i + 1);
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
    if (villainCount >= Pro.limit('villains')) {
      Pro.hitLimit(t('多人（2 位以上對手）勝率是 Pro 功能。'));
      return;
    }
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
        alert('對手 ' + (vi + 1) + t(' 只選了 1 張牌，請選滿 2 張或全部清空'));
        return;
      }
      hands.push([a, b2]);
      names.push(villainCount === 1 ? 'Villain' : t('對手 ') + (vi + 1));
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
    btn.textContent = t('計算中…');
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
            (p.tie > 0.0005 ? t(' <span class="muted">(平手 ') + (p.tie * 100).toFixed(1) + '%)</span>' : '') +
            '</span></div>' +
            '<div class="equity-bar eqp-bar"><div class="' + (pi === 0 ? 'eq-hero' : 'eq-villain') +
            '" style="width:' + pct + '%"></div></div>';
          rows.appendChild(div);
        });
        $('#eqMethodTxt').textContent = (res.method === 'exact'
          ? t('窮舉 ') + res.trials.toLocaleString() + t(' 種發牌')
          : t('Monte Carlo 模擬 ') + res.trials.toLocaleString() + t(' 次（誤差約 ±0.5%）')) +
          (hands.length > 2 ? ' · ' + hands.length + t(' 人 all-in，平手依人數均分') : '');
        renderEV();
        renderEqAnalysis(res, hands, names, board);
      } catch (err) {
        alert('計算失敗：' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = t('計算勝率');
      }
    }, 30);
  });

  /* --- 牌局分析：成牌、領先/落後、反超 outs（語音或手動計算勝率後都會出現） --- */
  function rankChar(r) {
    return r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : r === 10 ? '10' : String(r);
  }

  function scoreDesc(score) {
    var main = (score[0] === 2 || score[0] === 6)
      ? rankChar(score[1]) + '・' + rankChar(score[2]) // 兩對 / 葫蘆秀兩個 rank
      : rankChar(score[1]);
    return Evaluator.CATEGORY_NAMES[score[0]] + ' (' + main + ')';
  }

  function holeDesc(cards) {
    var r0 = Evaluator.cardRank(cards[0]), r1 = Evaluator.cardRank(cards[1]);
    if (r0 === r1) return t('口袋對子') + ' ' + rankChar(r0);
    var hi = Math.max(r0, r1), lo = Math.min(r0, r1);
    return rankChar(hi) + rankChar(lo) + ' ' +
      (Evaluator.cardSuit(cards[0]) === Evaluator.cardSuit(cards[1]) ? t('同花') : t('不同花'));
  }

  function renderEqAnalysis(res, hands, names, board) {
    var el = $('#eqAnalysis');
    if (!el) return;
    var lines = [];
    hands.forEach(function (h, i) {
      var desc = board.length >= 3 ? scoreDesc(EquityLib.bestScore(h.concat(board))) : holeDesc(h);
      lines.push('<b>' + names[i] + '</b>：' + desc);
    });
    var heroEq = res.players[0].equity, maxEq = 0;
    res.players.forEach(function (p) { if (p.equity > maxEq) maxEq = p.equity; });
    lines.push(heroEq >= maxEq - 1e-9
      ? '<span class="pos">' + t('你目前領先') + '</span>'
      : '<span class="neg">' + t('你目前落後') + '</span>');
    var o = EquityLib.outsNext(hands, board);
    if (o) {
      if (o.outs.length) {
        lines.push('<b>' + names[o.trail] + '</b>' + t(' 的反超 outs：') + o.outs.length + t(' 張') +
          '<br><span class="muted">' + o.outs.map(voiceCardTxt).join(' ') + '</span>');
      } else {
        lines.push('<b>' + names[o.trail] + '</b>' + t(' 已無反超 outs（drawing dead）'));
      }
    }
    var pot = parseFloat($('#fPot').value), call = parseFloat($('#fCall').value);
    if (!(pot >= 0) || !(call > 0)) {
      lines.push('<span class="muted">' + t('輸入底池與需跟金額（或語音直接說「底池100 需跟30」），即自動算跟注建議。') + '</span>');
    }
    el.innerHTML = '<h3>' + t('牌局分析') + '</h3>' + lines.join('<br>');
    el.hidden = false;
  }

  /* 語音選牌（js/voice.js）：把解析出的 {slot, card} 灌進牌位。
     語音提到的區塊整組換新（公牌從最小提到的位置往後清，翻牌重講不會殘留舊轉牌），
     沒提到的區塊保持不動。回傳 {ok, n?, msg?} 給 voice.js 顯示狀態。 */
  window.VoiceCardsApply = function (parsed, amounts) {
    if (parsed.clear) {
      slotCards = {};
      activeSlot = 'hero0';
      lastEquity = null;
      $('#equityResult').hidden = true;
      renderVillainRows();
      renderEV();
      return { ok: true, msg: t('已全部清除') };
    }
    var i, err;
    for (i = 0; i < parsed.errors.length; i++) {
      err = parsed.errors[i];
      if (err.code === 'dup') return { ok: false, msg: t('有重複的牌：') + voiceCardTxt(err.card) };
      if (err.code === 'overflow') return { ok: false, msg: t('牌太多，超出可填的牌位') };
      if (err.code === 'villains') return { ok: false, msg: t('對手最多 5 位') };
    }
    if (!parsed.entries.length) return { ok: false, msg: t('沒聽到可用的牌，再試一次') };
    var needV = parsed.maxVillain + 1;
    if (needV > villainCount) {
      if (needV > MAX_VILLAINS) return { ok: false, msg: t('對手最多 5 位') };
      if (needV > Pro.limit('villains')) {
        Pro.hitLimit(t('多人（2 位以上對手）勝率是 Pro 功能。'));
        return { ok: false, msg: t('多人（2 位以上對手）勝率是 Pro 功能。') };
      }
    }
    var next = {}, k;
    for (k in slotCards) next[k] = slotCards[k];
    var minBoard = 5;
    parsed.entries.forEach(function (en) {
      var m = /^board(\d)$/.exec(en.slot);
      if (m && +m[1] < minBoard) minBoard = +m[1];
    });
    var wiped = {};
    parsed.entries.forEach(function (en) {
      var g = en.slot.charAt(0) === 'h' ? 'hero'
        : en.slot.charAt(0) === 'v' ? en.slot.slice(0, 2) : 'board';
      if (wiped[g]) return;
      wiped[g] = 1;
      if (g === 'hero') { delete next.hero0; delete next.hero1; }
      else if (g === 'board') { for (var b = minBoard; b < 5; b++) delete next['board' + b]; }
      else { delete next[g + 'a']; delete next[g + 'b']; }
    });
    parsed.entries.forEach(function (en) { next[en.slot] = en.card; });
    var seen = {};
    for (k in next) {
      if (seen[next[k]] !== undefined) return { ok: false, msg: t('有重複的牌：') + voiceCardTxt(next[k]) };
      seen[next[k]] = 1;
    }
    if (needV > villainCount) villainCount = needV;
    slotCards = next;
    activeSlot = nextEmptySlot(parsed.entries[parsed.entries.length - 1].slot);
    renderVillainRows(); // 內含 refreshCardUI
    if (amounts) { // 語音講的「底池 N／需跟 N」直接灌進 EV 欄位
      if (amounts.pot !== undefined) $('#fPot').value = amounts.pot;
      if (amounts.call !== undefined) $('#fCall').value = amounts.call;
    }
    var analyzed = voiceAutoCalc();
    if (!analyzed) renderEV();
    return { ok: true, n: parsed.entries.length, analyzed: analyzed };
  };

  function voiceCardTxt(c) {
    var s = Evaluator.cardToString(c);
    return s[0] + Evaluator.SUIT_SYMBOLS[s[1]];
  }

  /* Hero + 至少一位完整對手齊了就自動算，一句話直接出勝率＋牌局分析 */
  function voiceAutoCalc() {
    if (slotCards.hero0 === undefined || slotCards.hero1 === undefined) return false;
    var full = 0, vi, a, b;
    for (vi = 0; vi < villainCount; vi++) {
      a = slotCards['v' + vi + 'a'];
      b = slotCards['v' + vi + 'b'];
      if (a === undefined && b === undefined) continue;
      if (a === undefined || b === undefined) return false; // 半套對手先不吵
      full++;
    }
    if (!full) return false;
    var bn = 0;
    for (vi = 0; vi < 5; vi++) if (slotCards['board' + vi] !== undefined) bn++;
    if (bn === 1 || bn === 2) return false;
    $('#btnCalcEquity').click();
    return true;
  }

  renderVillainRows();

  function renderEV() {
    var box = $('#evResult');
    var pot = parseFloat($('#fPot').value);
    var call = parseFloat($('#fCall').value);
    if (!lastEquity) {
      box.textContent = t('先計算勝率，再輸入底池與跟注金額。');
      return;
    }
    if (!(pot >= 0) || !(call > 0)) {
      box.textContent = t('Hero 勝率 ') + (lastEquity.hero * 100).toFixed(1) +
        t('%。輸入底池與需跟注金額即可算 EV。');
      return;
    }
    var ev = EquityLib.callEV(lastEquity.hero, pot, call);
    var needed = call / (pot + call) * 100;
    var verdict = ev >= 0
      ? t('<span class="pos">✔ +EV 跟注</span>')
      : t('<span class="neg">✘ −EV 蓋牌</span>');
    box.innerHTML =
      t('跟注 EV = ') + (lastEquity.hero * 100).toFixed(1) + '% × (' + pot + ' + ' + call +
      ') − ' + call + ' = <b class="' + (ev >= 0 ? 'pos' : 'neg') + '">' + fmtPL(Math.round(ev * 100) / 100) + '</b><br>' +
      t('所需勝率（底池賠率）：') + needed.toFixed(1) + '%<br>' + verdict;
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
      row.querySelector('.row-label').textContent = t('第 ') + (i + 1) + t(' 名');
    });
  }
  function addPayoutRow(value) {
    if ($$('#payoutRows .dyn-row').length >= ICM.MAX_PLACES) {
      alert('最多計算前 ' + ICM.MAX_PLACES + t(' 名獎金'));
      return;
    }
    makeRow($('#payoutRows'), {
      label: '',
      inputs: [{ placeholder: t('獎金'), cls: 'payout-input', value: value }],
      onRemove: relabelPayouts
    });
    relabelPayouts();
  }
  function addPlayerRow(name, stack) {
    if ($$('#playerRows .dyn-row').length >= ICM.MAX_PLAYERS) {
      alert('最多 ' + ICM.MAX_PLAYERS + t(' 位玩家'));
      return;
    }
    makeRow($('#playerRows'), {
      inputs: [
        { type: 'text', placeholder: t('名字（選填）'), cls: 'name-input', value: name },
        { placeholder: t('籌碼'), cls: 'stack-input', value: stack }
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
          name: row.querySelector('.name-input').value.trim() || (t('玩家 ') + (i + 1)),
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
    var html = t('<tr><th>玩家</th><th>籌碼</th><th>籌碼%</th><th>ICM $EV</th><th>占獎池%</th></tr>');
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
    html += t('<tr><td><b>合計</b></td><td>') + totalChips.toLocaleString() +
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
      alert('最多 ' + DEAL_MAX_PLAYERS + t(' 位玩家'));
      return;
    }
    makeRow($('#dealPlayerRows'), {
      inputs: [
        { type: 'text', placeholder: t('名字（選填）'), cls: 'name-input', value: name },
        { placeholder: t('籌碼'), cls: 'deal-stack', value: stack },
        { placeholder: t('已鎖定獎金'), cls: 'deal-locked', value: locked }
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
          name: row.querySelector('.name-input').value.trim() || (t('玩家 ') + (i + 1)),
          stack: stack,
          locked: parseFloat(row.querySelector('.deal-locked').value) || 0
        });
      }
    });
    if (players.length < 2 || players.length > DEAL_MAX_PLAYERS) {
      alert('請輸入 2–' + DEAL_MAX_PLAYERS + t(' 位玩家籌碼'));
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
    var html = t('<tr><th>玩家</th><th>籌碼%</th><th>ICM 分法</th><th>Chip-chop</th><th>差異</th></tr>');
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
    html += t('<tr><td><b>合計</b></td><td>100.0</td><td>') +
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
        opt.textContent = p.name + t('（') + p.stack.toLocaleString() + t('）');
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
      ? t('<span class="pos">✔ 推薦 SHOVE（多 ') + fmtPL(d) + t('）</span>')
      : t('<span class="neg">✘ 推薦 FOLD（全下少 ') + fmtPL(d) + t('）</span>');
    var box = $('#pfResult');
    box.hidden = false;
    box.innerHTML =
      t('手牌 <b>') + escapeHtml(res.hand) + t('</b> ｜ 跟注 range 前 ') + callPct + t('%（') +
      res.rangeClasses.length + t(' 類 / ') + res.rangeCombos + t(' combo）<br>') +
      t('P(被跟注) = ') + (res.pCall * 100).toFixed(1) + t('%，被跟注時勝率 = ') +
      (res.equity * 100).toFixed(1) + '%<br>' +
      t('蓋牌 $EV = <b>') + res.foldEV.toFixed(2) + '</b><br>' +
      t('全下 $EV = <b class="') + (res.diff >= 0 ? 'pos' : 'neg') + '">' + res.shoveEV.toFixed(2) +
      t('</b>（全蓋 ') + res.evAllFold.toFixed(2) +
      t(' ／ 被跟注且贏 ') + res.evWin.toFixed(2) +
      t(' ／ 被跟注且輸 ') + res.evLose.toFixed(2) + t('）<br>') +
      t('差異 ') + fmtPL(d) + ' → ' + verdictHtml;
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
    return t('混合頻率檢視（模型推估）：加權加注 ') + (aggro / total * 100).toFixed(1) + '%' +
      (hasCall ? t('、跟注 ') + (call / total * 100).toFixed(1) + '%' : '') +
      t('，其中 ') + mixed + t(' 手是混合手牌（沒有任何動作 ≥90%）。') +
      t('門檻附近本來就沒有明確的分界，測驗也依此放寬評分。');
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
        (nashRole === 'push' ? t('SB 全下 range：') : t('BB 跟注 range：')) +
        pct.toFixed(1) + t('%（') + nashS + t(' bb）｜') +
        freqSummary(fmap, false).replace(t('（模型推估）'), t('（Nash 均衡實際頻率）'));
      return;
    }
    for (i = 0; i < 169; i++) {
      var cls = set[i] ? 'in' : 'out';
      if (mix[i] > 0.25 && mix[i] < 0.75) cls = 'mix';
      html += '<div class="nash-cell ' + cls + '">' + PushFold.classLabel(i) + '</div>';
    }
    $('#nashGrid').innerHTML = html;
    $('#nashRangeTxt').textContent =
      (nashRole === 'push' ? t('SB 全下 range：') : t('BB 跟注 range：')) +
      pct.toFixed(1) + t('% 的手牌（') + nashS + t(' bb）');
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
      $('#rfiTxt').textContent = rfiTable + '-max ' + def.name + t(' 開牌（') + info.effBb +
        t('bb，寬度 ') + pct.toFixed(1) + t('%）｜') + freqSummary(rfiFmap, false);
      $('#rfiCustomRow').hidden = !ov;
      $('#btnRfiEdit').disabled = true;
      if (!rfiSliding) $('#rfiPct').value = pct;
      $('#rfiPctVal').textContent = pct.toFixed(1) + '%';
      if (!rfiStackSliding) $('#rfiStack').value = rfiStackCur;
      $('#rfiStackVal').textContent = rfiStackCur + 'bb';
      return;
    }
    $('#rfiTxt').textContent = rfiTable + '-max ' + def.name +
      (info.mode === 'jam' ? t(' 開牌（≤') + Ranges.RFI_JAM_BB + t('bb，等於全下）') : t(' 開牌')) +
      t(' range：') + pct.toFixed(1) + t('% 的手牌（') + combos + t(' combo）') +
      (depth
        ? t('｜有效籌碼 ') + info.effBb + t('bb：寬度不變，組成依深度重排（') +
          (info.effBb < Ranges.VS3B_BASE_BB
            ? t('淺 → 高張／雜色大牌擠進來，同花小連張掉出去')
            : t('深 → 同花連張與小對子擠進來，雜色邊緣牌掉出去')) + t('，唯讀）')
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
    this.textContent = rfiEdit ? t('✔ 完成編輯') : t('✏️ 編輯');
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
    UI.confirm(t('確定捨棄這張圖的自訂內容，還原為建議 range？')).then(function (ok) {
      if (!ok) return;
      setRangeOverride(rfiChartKey(), null);
      renderRfi();
    });
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
      $('#defTxt').textContent = spot.name + t('（對手開 ') + defPctCur.toFixed(1) + t('%，') +
        stackInfo.effBb + t('bb）｜') + freqSummary(fmap, true);
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
      $('#defTxt').textContent = t('動態試算：對手開 ') + defPctCur.toFixed(1) + t('%，有效籌碼 ') +
        stackInfo.effBb + t('bb（3-bet 到 ') + stackInfo.threeBetBb + 'bb' +
        (stackInfo.threeBetAllIn ? t('＝全下') : '') + t('，跟注賠率 ') +
        (stackInfo.needEq * 100).toFixed(0) + t('%，跟注後 SPR ') + stackInfo.spr.toFixed(1) +
        t('）→ 3-bet ') + (tbCombos / 1326 * 100).toFixed(1) + t('%（') + tbCombos + t(' combo）／跟注 ') +
        (callCombos / 1326 * 100).toFixed(1) + t('%（') + callCombos + t(' combo）。') +
        (stackInfo.mode === 'jamOrFold'
          ? t('SPR 太低 → 沒有平跟，只剩 3-bet 全下或棄牌。')
          : stackInfo.effBb < Ranges.VS3B_BASE_BB
            ? t('籌碼淺 → 隱含賠率縮水，小對子與同花連張先掉出跟注；3-bet 因為接近全下而放寬。')
            : stackInfo.effBb > Ranges.VS3B_BASE_BB
              ? t('籌碼深 → 隱含賠率變大，跟注變寬、3-bet 價值範圍收緊。') : '') +
        t('門檻以 100bb 建議表校準；簡化 equity 近似，阻斷牌 bluff（如 A5s 3-bet）不在模型內。');
    } else {
      $('#defTxt').textContent = spot.sizeTxt + t('｜3-bet ') +
        (tbCombos / 1326 * 100).toFixed(1) + t('%（') + tbCombos + t(' combo）＋跟注 ') +
        (callCombos / 1326 * 100).toFixed(1) + t('%（') + callCombos + t(' combo）');
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
    this.textContent = defEdit ? t('✔ 完成編輯') : t('✏️ 編輯');
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
    UI.confirm(t('確定捨棄這張圖的自訂內容，還原為建議 range？')).then(function (ok) {
      if (!ok) return;
      setRangeOverride(defChartKey(), null);
      renderDef();
    });
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
      t('<optgroup label="9-max Full Ring（現場取向）">') + nine + '</optgroup>';
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
      $('#v3bTxt').textContent = spot.name + t('（有效籌碼 ') + info.effBb + t('bb）｜') +
        freqSummary(fmap, info.mode === 'normal');
      $('#v3bNote').textContent = t('跟注要再投 ') + info.toCall + t('bb 進 ') + info.pot +
        t('bb 底池 → 底池賠率約 ') + (info.needEq * 100).toFixed(0) + t('%。頻率檢視為唯讀。');
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
    var aggroTxt = info.mode === 'callAllin' ? t('跟全下')
      : info.mode === 'jamOrFold' ? t('4-bet 全下') : '4-bet';
    $('#v3bTxt').textContent = spot.hero + t(' 開 ') + info.openBb + 'bb → ' + spot.villain +
      t(' 3-bet 到 ') + info.tbBb + t('bb（有效籌碼 ') + info.effBb + t('bb）｜') +
      aggroTxt + ' ' + (fbCombos / 1326 * 100).toFixed(1) + t('%（') + fbCombos + t(' combo）') +
      (info.mode === 'normal'
        ? t('＋跟注 ') + (callCombos / 1326 * 100).toFixed(1) + t('%（') + callCombos + t(' combo）')
        : t('，其餘蓋牌'));
    var modeTxt = info.mode === 'callAllin'
      ? t('籌碼不夠蓋住這個 3-bet → 對手等於直接全下你，只能跟全下或棄。')
      : info.mode === 'jamOrFold'
        ? t('跟注後 SPR 只剩 ') + info.spr.toFixed(2) + t(' → 沒有平跟的空間，只剩 4-bet 全下或棄牌。')
        : t('跟注後 SPR ') + info.spr.toFixed(1) +
          (info.effBb > Ranges.VS3B_BASE_BB
            ? t('，籌碼深 → 小對子與同花連張的隱含賠率變大，跟注變寬、4-bet 價值範圍收緊。')
            : info.effBb < Ranges.VS3B_BASE_BB
              ? t('，籌碼淺 → 隱含賠率縮水，小對子與同花連張先掉出跟注範圍。')
              : t('。'));
    $('#v3bNote').textContent = t('跟注要再投 ') + info.toCall + t('bb 進 ') + info.pot +
      t('bb 底池 → 直接的底池賠率約 ') + (info.needEq * 100).toFixed(0) + t('%。') + modeTxt +
      (dynamic ? t('（動態試算，唯讀）') : spot.note + t('。'));
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
    this.textContent = v3bEdit ? t('✔ 完成編輯') : t('✏️ 編輯');
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
    UI.confirm(t('確定捨棄這張圖的自訂內容，還原為建議 range？')).then(function (ok) {
      if (!ok) return;
      setRangeOverride(v3bChartKey(), null);
      renderV3b();
    });
  });
  renderV3b();

  /* ---------- 冷 4-bet / 冷跟（前面開牌 + 有人 3-bet） ----------
   * 唯讀圖：沒有手打的建議表可以覆寫，整張圖都是依「對手 3-bet 寬度 + 籌碼深度」算出來的。
   * 滑桿停在該情境的預設寬度時用真正的 3-bet range 記號，拉動後才改用「最強 X%」近似。 */
  var coldKeyCur = Ranges.COLD_DEFAULT_KEY, coldFreq = false;
  var coldPctCur = null, coldSliding = false;
  var coldStackCur = Ranges.VS3B_BASE_BB, coldStackSliding = false;

  /* 94 格的完整矩陣塞進一個 select，只分 6-max / 9-max 會滑到找不到自己那格，
   * 所以再按「你在哪個位置」分 optgroup，選項只留「開牌者 → 3-bet 者」。 */
  (function buildColdSpotOptions() {
    var groups = [], byGroup = {};
    Ranges.COLD_SPOT_KEYS.forEach(function (k) {
      var spot = Ranges.COLD_SPOTS[k];
      var label = (spot.table === 9 ? t('9-max Full Ring（現場取向）') : '6-max') +
                  t('｜你在 ') + spot.hero;
      if (!byGroup[label]) { byGroup[label] = []; groups.push(label); }
      byGroup[label].push('<option value="' + k + '">' + (spot.short || spot.name) +
                          '</option>');
    });
    $('#coldSpot').innerHTML = groups.map(function (label) {
      return '<optgroup label="' + label + '">' + byGroup[label].join('') + '</optgroup>';
    }).join('');
  })();

  function coldDefaultPct(key) { return Ranges.coldVillainPct(key); }
  function coldPctChanged() {
    return coldPctCur !== null && Math.abs(coldPctCur - coldDefaultPct(coldKeyCur)) > 0.25;
  }
  /** 滑桿沒動就用真正的 3-bet range，動了才用「最強 X%」近似 */
  function coldVillain() {
    return coldPctChanged() ? PushFold.topPercentRange(coldPctCur)
      : Ranges.coldVillainRange(coldKeyCur);
  }

  function renderCold() {
    // 下拉選單值對不上（快取到舊版 HTML 之類）時退回第一個情境，不要整張圖掛掉
    if (!Ranges.COLD_SPOTS[coldKeyCur]) coldKeyCur = Ranges.COLD_DEFAULT_KEY;
    var spot = Ranges.COLD_SPOTS[coldKeyCur];
    if (coldPctCur === null) coldPctCur = coldDefaultPct(coldKeyCur);
    var info = Ranges.coldStackInfo(coldKeyCur, coldStackCur);
    var villain = coldVillain();
    var html = '', tbCombos = 0, callCombos = 0, i, lbl;

    if (coldFreq) {
      var fmap = Ranges.coldFreqMap(coldKeyCur, villain, coldStackCur);
      for (i = 0; i < 169; i++) html += freqCellHtml(i, fmap[PushFold.classLabel(i)], true);
      $('#coldGrid').innerHTML = html;
      $('#coldTxt').textContent = spot.name + t('（對手 3-bet ') + coldPctCur.toFixed(1) + t('%，') +
        info.effBb + t('bb）｜') + freqSummary(fmap, info.mode === 'normal');
      $('#coldNote').textContent = spot.note;
      $('#coldSpot').value = coldKeyCur;
      if (!coldSliding) $('#coldPct').value = coldPctCur;
      $('#coldPctVal').textContent = coldPctCur.toFixed(1) + '%';
      if (!coldStackSliding) $('#coldStack').value = coldStackCur;
      $('#coldStackVal').textContent = coldStackCur + 'bb';
      return;
    }

    var map = Ranges.coldDefense(coldKeyCur, villain, coldStackCur);
    for (i = 0; i < 169; i++) {
      lbl = PushFold.classLabel(i);
      var st = map[lbl] || 'out';
      if (st === 'tb') tbCombos += PushFold.comboCount(i);
      else if (st === 'in') callCombos += PushFold.comboCount(i);
      html += '<div class="nash-cell ' + (st === 'in' || st === 'tb' ? st : 'out') +
        '" data-i="' + i + '">' + lbl + '</div>';
    }
    $('#coldGrid').innerHTML = html;

    var aggroTxt = info.mode === 'normal'
      ? t('冷 4-bet 到 ') + info.fourBetBb.toFixed(1) + 'bb' + (info.fourBetAllIn ? t('＝全下') : '')
      : t('全下');
    $('#coldTxt').textContent = spot.opener + t(' 開 ') + info.openBb + 'bb → ' + spot.tbettor +
      t(' 3-bet 到 ') + info.tbBb + t('bb（') + coldPctCur.toFixed(1) + t('% 的手牌），你在 ') +
      spot.hero + t('，有效籌碼 ') + info.effBb + t('bb｜') +
      aggroTxt + ' ' + (tbCombos / 1326 * 100).toFixed(1) + t('%（') + tbCombos + t(' combo）') +
      (info.mode === 'normal'
        ? t('＋冷跟 ') + (callCombos / 1326 * 100).toFixed(1) + t('%（') + callCombos + t(' combo）')
        : t('，其餘蓋牌'));
    $('#coldNote').textContent = t('你要補 ') + info.toCall + t('bb 進 ') + info.pot +
      t('bb 底池 → 需要 ') + (info.needEq * 100).toFixed(1) + t('% 勝率') +
      (spot.oopPenalty ? t('，再加 ') + (spot.oopPenalty * 100).toFixed(1) +
        t(' 點的無位置代價（接下來三條街都要無位置面對兩家）') : t('（你有位置，沒有額外代價）')) +
      t('。') + (info.mode === 'normal'
        ? t('跟注後 SPR ') + info.spr.toFixed(1) +
          (info.effBb > Ranges.VS3B_BASE_BB ? t('，籌碼深 → 小對子的 set mining 價值變大。')
            : info.effBb < Ranges.VS3B_BASE_BB ? t('，籌碼淺 → 小對子先掉出冷跟範圍。') : t('。'))
        : t('SPR 太低 → 沒有冷跟這個選項，只剩全下或棄牌。')) + spot.note;
    $('#coldSpot').value = coldKeyCur;
    if (!coldSliding) $('#coldPct').value = coldPctCur;
    $('#coldPctVal').textContent = coldPctCur.toFixed(1) + '%' +
      (coldPctChanged() ? '' : t('（該情境建議值）'));
    if (!coldStackSliding) $('#coldStack').value = coldStackCur;
    $('#coldStackVal').textContent = coldStackCur + 'bb';
  }
  $('#coldSpot').addEventListener('change', function () {
    if (!Ranges.COLD_SPOTS[this.value]) return;   // 值對不上就不要動狀態
    coldKeyCur = this.value;
    coldPctCur = coldDefaultPct(coldKeyCur);      // 換情境 → 滑桿回到該情境的建議寬度
    renderCold();
  });
  $('#coldPct').addEventListener('input', function () {
    coldSliding = true;
    coldPctCur = +this.value;
    renderCold();
  });
  $('#coldPct').addEventListener('change', function () { coldSliding = false; renderCold(); });
  $('#coldStack').addEventListener('input', function () {
    coldStackSliding = true;
    coldStackCur = +this.value;
    renderCold();
  });
  $('#coldStack').addEventListener('change', function () { coldStackSliding = false; renderCold(); });
  bindFreqToggle('#btnColdFreq',
    function () { return coldFreq; },
    function (v) { coldFreq = v; }, renderCold);
  renderCold();

  /* ---------- 面對 4-bet（你 3-bet 後被 4-bet） ----------
   * 與冷 4-bet 同一套版式：唯讀、對手寬度滑桿 + 籌碼滑桿。
   * 滑桿停在該情境預設寬度時用 vs3b 那格真正的 4-bet range，拉動後改用「最強 X%」近似。 */
  var vs4bKeyCur = Ranges.VS4B_DEFAULT_KEY, vs4bFreq = false;
  var vs4bPctCur = null, vs4bSliding = false;
  var vs4bStackCur = Ranges.VS3B_BASE_BB, vs4bStackSliding = false;

  (function buildVs4bSpotOptions() {
    var groups = [], byGroup = {};
    Ranges.VS4B_SPOT_KEYS.forEach(function (k) {
      var spot = Ranges.VS4B_SPOTS[k];
      var label = (spot.table === 9 ? t('9-max Full Ring（現場取向）') : '6-max') +
                  t('｜你在 ') + spot.hero;
      if (!byGroup[label]) { byGroup[label] = []; groups.push(label); }
      byGroup[label].push('<option value="' + k + '">' + (spot.short || spot.name) +
                          '</option>');
    });
    $('#vs4bSpot').innerHTML = groups.map(function (label) {
      return '<optgroup label="' + label + '">' + byGroup[label].join('') + '</optgroup>';
    }).join('');
  })();

  function vs4bDefaultPct(key) { return Ranges.vs4bVillainPct(key); }
  function vs4bPctChanged() {
    return vs4bPctCur !== null && Math.abs(vs4bPctCur - vs4bDefaultPct(vs4bKeyCur)) > 0.25;
  }
  function vs4bVillain() {
    return vs4bPctChanged() ? PushFold.topPercentRange(vs4bPctCur)
      : Ranges.vs4bVillainRange(vs4bKeyCur);
  }
  function vs4bAggroLabel(info) {
    return info.mode === 'callAllin' ? t('跟全下')
      : info.mode === 'jamOrFold' ? t('5-bet 全下')
      : info.fiveBetAllIn ? t('5-bet（＝全下）') : '5-bet';
  }

  function renderVs4b() {
    if (!Ranges.VS4B_SPOTS[vs4bKeyCur]) vs4bKeyCur = Ranges.VS4B_DEFAULT_KEY;
    var spot = Ranges.VS4B_SPOTS[vs4bKeyCur];
    if (vs4bPctCur === null) vs4bPctCur = vs4bDefaultPct(vs4bKeyCur);
    var info = Ranges.vs4bStackInfo(vs4bKeyCur, vs4bStackCur);
    var villain = vs4bVillain();
    var html = '', tbCombos = 0, callCombos = 0, i, lbl;

    if (vs4bFreq) {
      var fmap = Ranges.vs4bFreqMap(vs4bKeyCur, villain, vs4bStackCur);
      for (i = 0; i < 169; i++) html += freqCellHtml(i, fmap[PushFold.classLabel(i)], true);
      $('#vs4bGrid').innerHTML = html;
      $('#vs4bTxt').textContent = spot.name + t('（對手 4-bet ') + vs4bPctCur.toFixed(1) + t('%，') +
        info.effBb + t('bb）｜') + freqSummary(fmap, info.mode === 'normal');
      $('#vs4bNote').textContent = spot.note;
      $('#vs4bSpot').value = vs4bKeyCur;
      if (!vs4bSliding) $('#vs4bPct').value = vs4bPctCur;
      $('#vs4bPctVal').textContent = vs4bPctCur.toFixed(1) + '%';
      if (!vs4bStackSliding) $('#vs4bStack').value = vs4bStackCur;
      $('#vs4bStackVal').textContent = vs4bStackCur + 'bb';
      return;
    }

    var map = Ranges.vs4bDefense(vs4bKeyCur, villain, vs4bStackCur);
    for (i = 0; i < 169; i++) {
      lbl = PushFold.classLabel(i);
      var st = map[lbl] || 'out';
      if (st === 'tb') tbCombos += PushFold.comboCount(i);
      else if (st === 'in') callCombos += PushFold.comboCount(i);
      html += '<div class="nash-cell ' + (st === 'in' || st === 'tb' ? st : 'out') +
        '" data-i="' + i + '">' + lbl + '</div>';
    }
    $('#vs4bGrid').innerHTML = html;

    var aggroTxt = info.mode === 'normal'
      ? '5-bet' + t(' 到 ') + info.fiveBetBb.toFixed(1) + 'bb' + (info.fiveBetAllIn ? t('＝全下') : '')
      : vs4bAggroLabel(info);
    $('#vs4bTxt').textContent = spot.opener + t(' 開 ') + info.openBb + t('bb → 你 3-bet 到 ') +
      info.tbBb + t('bb → 他 4-bet 到 ') + info.fbBb + t('bb（') + vs4bPctCur.toFixed(1) +
      t('% 的手牌），有效籌碼 ') + info.effBb + t('bb｜') +
      aggroTxt + ' ' + (tbCombos / 1326 * 100).toFixed(1) + t('%（') + tbCombos + t(' combo）') +
      (info.mode === 'normal'
        ? t('＋跟注 ') + (callCombos / 1326 * 100).toFixed(1) + t('%（') + callCombos + t(' combo）')
        : t('，其餘蓋牌'));
    $('#vs4bNote').textContent = t('你要補 ') + info.toCall.toFixed(1) + t('bb 進 ') +
      info.pot.toFixed(1) + t('bb 底池 → 需要 ') + (info.needEq * 100).toFixed(1) + t('% 勝率。') +
      (info.mode === 'normal'
        ? t('跟注後 SPR ') + info.spr.toFixed(1) + t('。')
        : info.mode === 'jamOrFold'
          ? t('跟注後 SPR 太低 → 沒有平跟這個選項，只剩 5-bet 全下或棄牌。')
          : t('他的 4-bet 已把你蓋住 → 只剩跟全下或棄牌。')) + spot.note;
    $('#vs4bSpot').value = vs4bKeyCur;
    if (!vs4bSliding) $('#vs4bPct').value = vs4bPctCur;
    $('#vs4bPctVal').textContent = vs4bPctCur.toFixed(1) + '%' +
      (vs4bPctChanged() ? '' : t('（該情境建議值）'));
    if (!vs4bStackSliding) $('#vs4bStack').value = vs4bStackCur;
    $('#vs4bStackVal').textContent = vs4bStackCur + 'bb';
  }
  $('#vs4bSpot').addEventListener('change', function () {
    if (!Ranges.VS4B_SPOTS[this.value]) return;
    vs4bKeyCur = this.value;
    vs4bPctCur = vs4bDefaultPct(vs4bKeyCur);
    renderVs4b();
  });
  $('#vs4bPct').addEventListener('input', function () {
    vs4bSliding = true;
    vs4bPctCur = +this.value;
    renderVs4b();
  });
  $('#vs4bPct').addEventListener('change', function () { vs4bSliding = false; renderVs4b(); });
  $('#vs4bStack').addEventListener('input', function () {
    vs4bStackSliding = true;
    vs4bStackCur = +this.value;
    renderVs4b();
  });
  $('#vs4bStack').addEventListener('change', function () { vs4bStackSliding = false; renderVs4b(); });
  bindFreqToggle('#btnVs4bFreq',
    function () { return vs4bFreq; },
    function (v) { vs4bFreq = v; }, renderVs4b);
  renderVs4b();

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
    var summary = '<b>' + cardsHtml(board) + t('</b>　') + tex.label +
      t('（濕度 ') + tex.wetness.toFixed(2) + t('）<br>') +
      t('整體建議：<b>') + Math.round(rp.freq * 100) + t('% 的頻率持續下注</b>，主要尺度 <b>') +
      rp.sizeTxt + t('</b>。<br><span class="hint">') + rp.why + '</span>';
    if (hero) {
      var hp = Postflop.cbetHandPolicy(hero, board, opts);
      summary += t('<hr>你的 ') + cardsHtml(hero) + t('：') + hp.hand.label +
        t('（') + hp.hand.bucketTxt + t('）→ <b class="') +
        (hp.action === 'check' ? 'neg' : 'pos') + '">' + hp.actionTxt + '</b><br>' +
        '<span class="hint">' + hp.why + '</span>';
    }
    $('#cbSummary').innerHTML = summary;

    var rows = t('<tr><th>項目</th><th>值</th></tr>');
    function row(k, v) { rows += '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; }
    row(t('最大張'), Evaluator.RANKS[tex.highCard - 2]);
    row(t('花色'), tex.monotone ? t('單色（3 張以上同花色）') : tex.twoTone ? t('兩色') : t('彩虹'));
    row(t('配對'), tex.paired ? (tex.trips ? t('三條面') : t('配對面')) : t('無'));
    row(t('順子連結度'), tex.straightSpan + t(' / 5（同一順子窗內的張數）'));
    row(t('濕度'), tex.wetness.toFixed(2) + t('（') + tex.wetTxt + t('）'));
    row(t('建議 c-bet 頻率'), Math.round(rp.freq * 100) + '%');
    row(t('建議尺度'), rp.sizeTxt);
    row(t('對手面對 33% 的 MDF'), (Postflop.mdf(0.33, 1) * 100).toFixed(0) + '%');
    row(t('對手面對 75% 的 MDF'), (Postflop.mdf(0.75, 1) * 100).toFixed(0) + '%');
    $('#cbTable').innerHTML = rows;
    $('#cbResult').hidden = false;
  });

  /* ---------- MDF / 詐唬比速查表 ---------- */
  (function () {
    var SIZES = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5, 2];
    var html = t('<tr><th>下注（底池比）</th><th>MDF</th><th>對手棄牌超過</th>') +
      t('<th>跟注賠率</th><th>value : bluff</th></tr>');
    SIZES.forEach(function (f) {
      var m = Postflop.mdf(f, 1);
      var need = Postflop.callPotOdds(f, 1);
      // 平衡時 bluff = value × bet/(pot+bet) → value : bluff = (pot+bet) : bet
      var ratio = (1 + f) / f;
      html += '<tr><td>' + Math.round(f * 100) + '%</td><td>' + (m * 100).toFixed(0) +
        '%</td><td>' + ((1 - m) * 100).toFixed(0) + t('% 就該詐唬</td><td>') +
        (need * 100).toFixed(0) + '%</td><td>' + ratio.toFixed(1) + ' : 1</td></tr>';
    });
    $('#mdfTable').innerHTML = html;
  })();

  /* ---------- Outs / 賠率速查表 ---------- */
  (function () {
    var DRAWS = {
      2: t('口袋對 → set'), 4: t('卡順（gutshot）'), 6: t('兩張高牌'),
      8: t('兩頭順（OESD）'), 9: t('同花聽牌'), 12: t('同花＋卡順'), 15: t('同花＋兩頭順')
    };
    var html = t('<tr><th>Outs</th><th>常見聽牌</th><th>轉牌</th><th>河牌</th><th>轉+河</th></tr>');
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
                    v3b: 'poker.v3b_quiz', cold: 'poker.cold_quiz',
                    vs4b: 'poker.vs4b_quiz',
                    cb: 'poker.cb_quiz', bc: 'poker.bc_quiz' };
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
      ? name + t('：') + s.correct + ' / ' + s.total + t('（') + Math.round(s.correct / s.total * 100) + t('%）')
      : '';
  }
  function renderQuizScore() {
    $('#quizScoreTxt').textContent =
      [scoreLine('Push/Fold', quizScore('pf')), scoreLine('RFI', quizScore('rfi')),
       scoreLine(t('面對開牌'), quizScore('def')), scoreLine(t('被 3-bet'), quizScore('v3b')),
       scoreLine(t('冷 4-bet'), quizScore('cold')),
       scoreLine(t('面對 4-bet'), quizScore('vs4b')),
       scoreLine(t('翻後 c-bet'), quizScore('cb')), scoreLine(t('河牌接 bluff'), quizScore('bc'))]
        .filter(Boolean).join(t(' ｜ '));
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
    return info.mode === 'callAllin' ? t('跟全下')
      : info.mode === 'jamOrFold' ? t('4-bet 全下') : '4-bet';
  }
  function v3bActionTxt(info) {
    return info.mode === 'normal'
      ? t('4-bet、跟注還是蓋牌')
      : v3bAggroLabel(info) + t('還是蓋牌');
  }
  function defAggroLabel(info) { return info.threeBetAllIn ? t('3-bet 全下') : '3-bet'; }
  function defActionTxt(info) {
    return info.mode === 'normal'
      ? defAggroLabel(info) + t('、跟注還是蓋牌')
      : defAggroLabel(info) + t('還是蓋牌');
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
                        cold: '#btnQuizModeCold', vs4b: '#btnQuizModeVs4b',
                        cb: '#btnQuizModeCb', bc: '#btnQuizModeBc' };
  var QUIZ_AGGRO_TXT = { pf: t('全下'), rfi: t('加注'), def: '3-bet', v3b: '4-bet',
                         cold: t('冷 4-bet'), vs4b: '5-bet', cb: t('下注 75%'), bc: '' };
  var QUIZ_CALL_TXT = { def: t('跟注'), v3b: t('跟注'), cold: t('冷跟'), vs4b: t('跟注'),
                        cb: t('下注 33%'), bc: t('跟注') };
  var QUIZ_FOLD_TXT = { cb: t('過牌') };
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
    $('#btnQuizCall').textContent = QUIZ_CALL_TXT[mode] || t('跟注');
    $('#btnQuizFold').textContent = QUIZ_FOLD_TXT[mode] || t('蓋牌');
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
    if (cur.mode === 'cold') {
      return Ranges.coldFreqMap(cur.spot, cur.villain, cur.bb)[lbl];
    }
    if (cur.mode === 'vs4b') {
      return Ranges.vs4bFreqMap(cur.spot, cur.villain, cur.bb)[lbl];
    }
    return null;
  }
  function freqTxt(mode, fr, hasCall) {
    return t('（模型頻率：') + QUIZ_AGGRO_TXT[mode] + ' ' + Math.round(fr.aggro * 100) + '%' +
      (hasCall ? t('、跟注 ') + Math.round(fr.call * 100) + '%' : '') +
      t('、棄牌 ') + Math.round(fr.fold * 100) + t('%）');
  }
  Object.keys(QUIZ_MODE_BTN).forEach(function (m) {
    $(QUIZ_MODE_BTN[m]).addEventListener('click', function () { setQuizMode(m); });
  });

  var quizCur = null;
  function quizNext() {
    if (!Pro.quizLeft()) {
      /* 額度用完就收回測驗畫面，免得停在一題答不下去的狀態 */
      $('#quizRun').hidden = true;
      $('#quizIdle').hidden = false;
      Pro.hitLimit(t('免費版每天 10 題，升級 Pro 無限練習。'));
      return;
    }
    Pro.quizBump();
    if (quizMode === 'pf') {
      var S = 2 + Math.floor(Math.random() * 14); // 2–15 bb
      quizCur = { mode: 'pf', S: S, idx: randHandIdx() };
      $('#quizInfo').textContent = t('你在 SB（按鈕位），有效籌碼 ') + S + t(' bb。推還是棄？');
    } else if (quizMode === 'rfi') {
      var rtable = Math.random() < 0.5 ? '6' : '9';
      var pos = pick(rtable === '9' ? Ranges.RFI_POS_9 : Ranges.RFI_POS_6);
      var rbb = pick(QUIZ_DEPTHS);
      var rInfo = Ranges.rfiStackInfo(rbb);
      quizCur = { mode: 'rfi', table: rtable, pos: pos, bb: rbb, idx: randHandIdx() };
      $('#quizInfo').textContent = rtable + t('-max，有效籌碼 ') + rInfo.effBb + t('bb，你在 ') +
        RFI_TABLES[rtable][pos].name + t('，前面無人入池。') +
        (rInfo.mode === 'jam' ? t('開牌等於全下 —— 全下還是蓋牌？') : t('開牌加注還是蓋牌？'));
      $('#btnQuizPush').textContent = rInfo.mode === 'jam' ? t('全下') : t('加注');
    } else if (quizMode === 'def') {
      var spotKey = pickSpot(Ranges.DEF_SPOT_KEYS, Ranges.DEF_SPOTS);
      var spot = Ranges.DEF_SPOTS[spotKey];
      var dbb = QUIZ_DEPTHS[Math.floor(Math.random() * QUIZ_DEPTHS.length)];
      var dInfo = Ranges.defStackInfo(spotKey, dbb);
      quizCur = { mode: 'def', spot: spotKey, bb: dbb, idx: randHandIdx() };
      $('#quizInfo').textContent = (spot.table === 9 ? '9-max' : '6-max') + t('，有效籌碼 ') +
        dInfo.effBb + t('bb，') + spot.sizeTxt + t('，你在 ') + spot.hero + t('。') +
        defActionTxt(dInfo) + t('？');
      // SPR 太低就沒有平跟這個選項
      $('#btnQuizCall').hidden = dInfo.mode !== 'normal';
      $('#btnQuizPush').textContent = defAggroLabel(dInfo);
    } else if (quizMode === 'cold') {
      var cKey = pickSpot(Ranges.COLD_SPOT_KEYS, Ranges.COLD_SPOTS);
      var cSpot = Ranges.COLD_SPOTS[cKey];
      var cbb = pick(QUIZ_DEPTHS);
      // 一半用該情境真正的 3-bet range，一半隨機抽寬度 —— 練「先判斷對手多寬」
      var defPct = Ranges.coldVillainPct(cKey);
      var wide = Math.random() < 0.5;
      var cPct = wide ? pick([3, 4, 5, 6, 8, 10, 12, 15, 20]) : defPct;
      var cVillain = wide ? PushFold.topPercentRange(cPct) : Ranges.coldVillainRange(cKey);
      var cInfo = Ranges.coldStackInfo(cKey, cbb);
      quizCur = { mode: 'cold', spot: cKey, villain: cVillain, pct: cPct,
                  bb: cbb, idx: randHandIdx() };
      $('#quizInfo').textContent = (cSpot.table === 9 ? '9-max' : '6-max') +
        t('，有效籌碼 ') + cInfo.effBb + t('bb。') + cSpot.opener + t(' 開 ') + cInfo.openBb +
        t('bb，') + cSpot.tbettor + t(' 3-bet 到 ') + cInfo.tbBb + t('bb（他這條線 3-bet 約 ') +
        cPct.toFixed(1) + t('% 的手牌），你在 ') + cSpot.hero + t('，還沒投錢。') +
        (cInfo.mode === 'normal' ? t('冷 4-bet、冷跟還是蓋牌？') : t('全下還是蓋牌？'));
      $('#btnQuizCall').hidden = cInfo.mode !== 'normal';
      $('#btnQuizPush').textContent = cInfo.mode === 'normal' ? t('冷 4-bet') : t('全下');
    } else if (quizMode === 'vs4b') {
      var fKey = pickSpot(Ranges.VS4B_SPOT_KEYS, Ranges.VS4B_SPOTS);
      var fSpot = Ranges.VS4B_SPOTS[fKey];
      var fbb = pick(QUIZ_DEPTHS);
      // 一半用該情境真正的 4-bet range，一半隨機抽寬度 —— 練「先判斷對手多寬」
      var fDefPct = Ranges.vs4bVillainPct(fKey);
      var fWide = Math.random() < 0.5;
      var fPct = fWide ? pick([2, 3, 4, 5, 6, 8, 10, 12]) : fDefPct;
      var fVillain = fWide ? PushFold.topPercentRange(fPct) : Ranges.vs4bVillainRange(fKey);
      var fInfo = Ranges.vs4bStackInfo(fKey, fbb);
      quizCur = { mode: 'vs4b', spot: fKey, villain: fVillain, pct: fPct,
                  bb: fbb, idx: randHandIdx() };
      $('#quizInfo').textContent = (fSpot.table === 9 ? '9-max' : '6-max') +
        t('，有效籌碼 ') + fInfo.effBb + t('bb。') + fSpot.opener + t(' 開 ') + fInfo.openBb +
        t('bb，你在 ') + fSpot.hero + t(' 3-bet 到 ') + fInfo.tbBb + t('bb，他 4-bet 到 ') +
        fInfo.fbBb + t('bb（他這條線 4-bet 約 ') + fPct.toFixed(1) + t('% 的手牌）。') +
        (fInfo.mode === 'normal' ? t('5-bet、跟注還是蓋牌？')
          : fInfo.mode === 'jamOrFold' ? t('5-bet 全下還是蓋牌？') : t('跟全下還是蓋牌？'));
      $('#btnQuizCall').hidden = fInfo.mode !== 'normal';
      $('#btnQuizPush').textContent = vs4bAggroLabel(fInfo);
    } else if (quizMode === 'cb') {
      var cs = Postflop.buildCbetSpot({});
      quizCur = { mode: 'cb', spot: cs };
      $('#quizBoard').innerHTML = cardsHtml(cs.board) +
        '<span class="board-tag">' + cs.policy.texture.label +
        t('（濕度 ') + cs.policy.texture.wetness.toFixed(2) + t('）</span>');
      $('#quizInfo').textContent =
        (cs.potType === '3bp' ? t('3-bet 底池') : t('單次加注底池')) + t('，你是翻前加注者，') +
        (cs.role === 'ip' ? t('有位置') : t('無位置')) + t('，對手過牌給你。') +
        t('下注 75%、下注 33% 還是過牌？');
    } else if (quizMode === 'bc') {
      var rs = Postflop.buildRiverSpot({ pot: 10 });
      quizCur = { mode: 'bc', spot: rs };
      $('#quizBoard').innerHTML = cardsHtml(rs.board) +
        t('<span class="board-tag">你的牌力：') + rs.heroClass.label + '</span>';
      $('#quizInfo').textContent =
        t('河牌，底池 ') + rs.pot + t('bb，對手下注 ') + rs.bet + t('bb（') +
        Math.round(rs.betFrac * 100) + t('% 底池）。他這條線的下注 range 是：價值 ') +
        rs.nValue + t(' combo（兩對以上）＋詐唬 ') + rs.nBluff +
        t(' combo（高牌）。你這手贏光他所有詐唬、輸給所有價值 —— 跟還是棄？');
    } else {
      var vKey = pickSpot(Ranges.VS3B_SPOT_KEYS, Ranges.VS3B_SPOTS);
      var vSpot = Ranges.VS3B_SPOTS[vKey];
      var bb = QUIZ_DEPTHS[Math.floor(Math.random() * QUIZ_DEPTHS.length)];
      var vInfo = Ranges.vs3bStackInfo(vKey, bb);
      quizCur = { mode: 'v3b', spot: vKey, bb: bb, idx: randHandIdx() };
      $('#quizInfo').textContent = (vSpot.table === 9 ? '9-max' : '6-max') +
        t('，有效籌碼 ') + vInfo.effBb + t('bb，你在 ') +
        vSpot.hero + t(' 開 ') + vInfo.openBb + t('bb，') + vSpot.villain + t(' 3-bet 到 ') +
        vInfo.tbBb + 'bb' + (vInfo.mode === 'callAllin' ? t('（等於全下你）') : '') + t('。') +
        v3bActionTxt(vInfo) + t('？');
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
      detail = t(' Nash 均衡：') + PushFold.classLabel(quizCur.idx) + t(' 在 ') + quizCur.S + ' bb ' +
        (correct ? t('應該<b>全下</b>') : t('應該<b>蓋牌</b>')) +
        t('（均衡全下頻率 ') + Math.round(sol.push[quizCur.idx] * 100) + t('%）。');
    } else if (quizCur.mode === 'rfi') {
      var rInfo2 = Ranges.rfiStackInfo(quizCur.bb);
      var inRange = rfiStateAt(quizCur.table, quizCur.pos, quizCur.bb, quizCur.idx) === 'in';
      ok = (action === 'aggro') === inRange;
      bestAct = inRange ? 'aggro' : 'fold';
      qKey = 'rfi:' + quizCur.table + ':' + quizCur.pos + ':' + quizCur.bb + ':' + quizCur.idx;
      var rAggro = rInfo2.mode === 'jam' ? t('全下') : t('加注');
      detail = ' ' + quizCur.table + '-max ' + RFI_TABLES[quizCur.table][quizCur.pos].name +
        t(' 開牌（') + rInfo2.effBb + t('bb）：') +
        PushFold.classLabel(quizCur.idx) +
        (inRange ? t(' 在開牌 range 內，應該<b>') + rAggro + t('</b>。')
                 : t(' 不在開牌 range，應該<b>蓋牌</b>。'));
    } else if (quizCur.mode === 'def') {
      var dInfo2 = Ranges.defStackInfo(quizCur.spot, quizCur.bb);
      var dst = defStateAt(quizCur.spot, quizCur.bb, quizCur.idx);
      var best = dst === 'tb' ? 'aggro' : dst === 'in' ? 'call' : 'fold';
      ok = action === best;
      bestAct = best;
      qKey = 'def:' + quizCur.spot + ':' + quizCur.bb + ':' + quizCur.idx;
      var bestTxt = best === 'aggro' ? '<b>' + defAggroLabel(dInfo2) + '</b>'
        : best === 'call' ? t('<b>跟注</b>') : t('<b>蓋牌</b>');
      detail = ' ' + Ranges.DEF_SPOTS[quizCur.spot].name + t('（') + dInfo2.effBb + t('bb）：') +
        PushFold.classLabel(quizCur.idx) + t(' 應該') + bestTxt +
        t('（跟注要投 ') + dInfo2.toCall + t('bb 進 ') + dInfo2.pot + t('bb 底池，需約 ') +
        Math.round(dInfo2.needEq * 100) + t('%）。');
    } else if (quizCur.mode === 'cold') {
      var cInfo2 = Ranges.coldStackInfo(quizCur.spot, quizCur.bb);
      var cSpot2 = Ranges.COLD_SPOTS[quizCur.spot];
      var cst = Ranges.coldDefense(quizCur.spot, quizCur.villain,
        quizCur.bb)[PushFold.classLabel(quizCur.idx)] || 'out';
      var cBest = cst === 'tb' ? 'aggro' : cst === 'in' ? 'call' : 'fold';
      ok = action === cBest;
      bestAct = cBest;
      qKey = 'cold:' + quizCur.spot + ':' + quizCur.pct.toFixed(1) + ':' +
        quizCur.bb + ':' + quizCur.idx;
      var cEq = PushFold.equityVsRange(quizCur.idx, [], quizCur.villain).equity;
      detail = ' ' + PushFold.classLabel(quizCur.idx) + t(' 對上 ') + cSpot2.tbettor +
        t(' 的 3-bet range（') + quizCur.pct.toFixed(1) + t('%）只有 <b>') +
        (cEq * 100).toFixed(1) + t('%</b> 勝率，你要補 ') + cInfo2.toCall + t('bb 進 ') +
        cInfo2.pot + t('bb 底池 → 需要 ') + (cInfo2.needEq * 100).toFixed(1) + '%' +
        (cSpot2.oopPenalty ? t('（再加 ') + (cSpot2.oopPenalty * 100).toFixed(1) +
          t(' 點的無位置代價）') : '') + t(' → 應該<b>') +
        (cBest === 'aggro' ? (cInfo2.mode === 'normal' ? t('冷 4-bet') : t('全下'))
          : cBest === 'call' ? t('冷跟') : t('蓋牌')) + t('</b>。');
    } else if (quizCur.mode === 'vs4b') {
      var fInfo2 = Ranges.vs4bStackInfo(quizCur.spot, quizCur.bb);
      var fSpot2 = Ranges.VS4B_SPOTS[quizCur.spot];
      var fst = Ranges.vs4bDefense(quizCur.spot, quizCur.villain,
        quizCur.bb)[PushFold.classLabel(quizCur.idx)] || 'out';
      var fBest = fst === 'tb' ? 'aggro' : fst === 'in' ? 'call' : 'fold';
      ok = action === fBest;
      bestAct = fBest;
      qKey = 'vs4b:' + quizCur.spot + ':' + quizCur.pct.toFixed(1) + ':' +
        quizCur.bb + ':' + quizCur.idx;
      var fEq = PushFold.equityVsRange(quizCur.idx, [], quizCur.villain).equity;
      detail = ' ' + PushFold.classLabel(quizCur.idx) + t(' 對上 ') + fSpot2.opener +
        t(' 的 4-bet range（') + quizCur.pct.toFixed(1) + t('%）有 <b>') +
        (fEq * 100).toFixed(1) + t('%</b> 勝率，跟注要補 ') + fInfo2.toCall.toFixed(1) +
        t('bb 進 ') + fInfo2.pot.toFixed(1) + t('bb 底池 → 需要 ') +
        (fInfo2.needEq * 100).toFixed(1) + t('%，另外續玩上限是 MDF × 你的 3-bet range → 應該<b>') +
        (fBest === 'aggro' ? vs4bAggroLabel(fInfo2)
          : fBest === 'call' ? t('跟注') : t('蓋牌')) + t('</b>。');
    } else if (quizCur.mode === 'cb') {
      var cs2 = quizCur.spot, cp = cs2.policy;
      var cBest = cp.action === 'big' ? 'aggro' : cp.action === 'small' ? 'call' : 'fold';
      ok = action === cBest;
      bestAct = cBest;
      qKey = 'cb:' + cs2.board.concat(cs2.hero).map(Evaluator.cardToString).join('') +
        ':' + cs2.role + ':' + cs2.potType;
      detail = ' ' + cp.texture.label + t('（濕度 ') + cp.texture.wetness.toFixed(2) + t('），你是 ') +
        cp.hand.label + t(' → 應該<b>') + cp.actionTxt + t('</b>。') + cp.why +
        t('。這個牌面整體建議 c-bet 頻率約 ') + Math.round(cp.rangePolicy.freq * 100) +
        t('%、主要尺度 ') + cp.rangePolicy.sizeTxt + t('。');
    } else if (quizCur.mode === 'bc') {
      var rs2 = quizCur.spot;
      ok = action === rs2.best;
      bestAct = rs2.best;
      qKey = 'bc:' + rs2.board.concat(rs2.hero).map(Evaluator.cardToString).join('') +
        ':' + rs2.bet + ':' + rs2.nBluff;
      detail = t(' 對手詐唬占比 ') + (rs2.equity * 100).toFixed(1) + t('%（') + rs2.nBluff + ' bluff / ' +
        (rs2.nBluff + rs2.nValue) + t(' 總 combo），你的底池賠率需要 ') +
        (rs2.needEq * 100).toFixed(1) + t('% → 應該<b>') + (rs2.best === 'call' ? t('跟注') : t('蓋牌')) +
        t('</b>（跟注 EV ') + (rs2.evBB >= 0 ? '+' : '') + rs2.evBB.toFixed(2) + t('bb）。') +
        t('平衡的話他該有 ') + rs2.balancedBluff.toFixed(1) + t(' 個詐唬 combo，') +
        t('他實際 ') + rs2.nBluff + t(' 個 → ') +
        (rs2.nBluff > rs2.balancedBluff ? t('詐唬過多，你該多跟') : t('詐唬不足，你該多棄')) +
        t('。你面對這個尺度的 MDF 是 ') + (rs2.mdf * 100).toFixed(0) + t('%。');
    } else {
      var vInfo2 = Ranges.vs3bStackInfo(quizCur.spot, quizCur.bb);
      var st3 = v3bStateAt(quizCur.spot, quizCur.bb, quizCur.idx);
      var vBest = st3 === 'tb' ? 'aggro' : st3 === 'in' ? 'call' : 'fold';
      ok = action === vBest;
      bestAct = vBest;
      qKey = 'v3b:' + quizCur.spot + ':' + quizCur.bb + ':' + quizCur.idx;
      var vBestTxt = vBest === 'aggro' ? '<b>' + v3bAggroLabel(vInfo2) + '</b>'
        : vBest === 'call' ? t('<b>跟注</b>') : t('<b>蓋牌</b>');
      detail = ' ' + Ranges.VS3B_SPOTS[quizCur.spot].name + t('（') + vInfo2.effBb + t('bb）：') +
        PushFold.classLabel(quizCur.idx) + t(' 應該') + vBestTxt +
        t('（跟注要投 ') + vInfo2.toCall + t('bb 進 ') + vInfo2.pot + t('bb 底池，需約 ') +
        Math.round(vInfo2.needEq * 100) + '%' +
        (vInfo2.mode === 'normal' ? t('，跟注後 SPR ') + vInfo2.spr.toFixed(1) : '') + t('）。');
    }
    // 混合策略放寬：門檻附近的手牌本來就有多個動作，選到有足夠頻率的也算對
    if (!ok && quizIsPreflop(quizCur.mode)) {
      var fr = quizFreqs(quizCur);
      if (Ranges.mixTolerates(fr, action, bestAct)) {
        ok = true;
        detail = t(' 這手在門檻附近是<b>混合策略</b>，你選的動作也在頻率內 ') +
          freqTxt(quizCur.mode, fr, !$('#btnQuizCall').hidden) + t('。') + detail;
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
        payload.fold = QUIZ_FOLD_TXT[quizCur.mode] || t('蓋牌');
        payload.noAggro = quizCur.mode === 'bc';
        delete payload.idx;
      } else if (quizCur.mode === 'cold') {
        var pcInfo = Ranges.coldStackInfo(quizCur.spot, quizCur.bb);
        payload.aggro = pcInfo.mode === 'normal' ? t('冷 4-bet') : t('全下');
        payload.call = t('冷跟');
        payload.noCall = pcInfo.mode !== 'normal';
      } else if (quizCur.mode === 'vs4b') {
        var pfInfo = Ranges.vs4bStackInfo(quizCur.spot, quizCur.bb);
        payload.aggro = vs4bAggroLabel(pfInfo);
        payload.noCall = pfInfo.mode !== 'normal';
      } else if (quizCur.mode === 'v3b') {
        var pInfo = Ranges.vs3bStackInfo(quizCur.spot, quizCur.bb);
        payload.aggro = v3bAggroLabel(pInfo);
        payload.noCall = pInfo.mode !== 'normal';
      } else if (quizCur.mode === 'def') {
        var pdInfo = Ranges.defStackInfo(quizCur.spot, quizCur.bb);
        payload.aggro = defAggroLabel(pdInfo);
        payload.noCall = pdInfo.mode !== 'normal';
      } else if (quizCur.mode === 'rfi') {
        payload.aggro = Ranges.rfiStackInfo(quizCur.bb).mode === 'jam' ? t('全下') : t('加注');
      }
      window.TRAINING.record(quizCur.mode, ok, qKey, payload);
    }
    var fb = $('#quizFeedback');
    fb.hidden = false;
    fb.innerHTML = (ok ? t('<span class="pos">✔ 正確！</span>') : t('<span class="neg">✘ 錯誤。</span>')) +
      detail + t('<br>目前成績 ') + s.correct + ' / ' + s.total;
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
        rangeName = t('前 ') + pct + '%';
      }
    } catch (err) { alert(err.message); return; }
    if (!classes.length) { alert('range 是空的'); return; }
    var combos = [];
    classes.forEach(function (ci) {
      PushFold.expandCombos(ci).forEach(function (vc) { combos.push(vc); });
    });
    var btn = $('#btnCalcRvh');
    btn.disabled = true;
    btn.textContent = t('計算中…');
    setTimeout(function () {
      try {
        var res = EquityLib.computeEquityVsCombos(hero, combos, board, 30000);
        var eqH = res.hero * 100, eqR = 100 - eqH;
        $('#rvhResult').hidden = false;
        $('#rvhHeroTxt').textContent = t('Hero：') + eqH.toFixed(1) + '%';
        $('#rvhRangeTxt').textContent = t('Range：') + eqR.toFixed(1) + '%';
        $('#rvhBarHero').style.width = eqH + '%';
        $('#rvhBarRange').style.width = eqR + '%';
        $('#rvhDetail').textContent = t('對手 range「') + rangeName + t('」：') + classes.length +
          t(' 類 / ') + res.combos + t(' 可用 combo（已扣 blocker）｜') +
          (res.method === 'exact'
            ? t('窮舉 ') + res.trials.toLocaleString() + t(' 種發牌')
            : 'Monte Carlo ' + res.trials.toLocaleString() + t(' 次（誤差約 ±0.6%）')) +
          (board.length ? '' : t('｜翻前')) + t('，平手依勝率折半計入');
      } catch (err) {
        alert('計算失敗：' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = t('計算 vs range 勝率');
      }
    }, 30);
  });

  /* ================= Range vs Range ================= */
  /** 記號優先、留空才用「前 X%」；回傳 {classes, name} */
  function rangeInput(notSel, pctSel, tag) {
    var notation = $(notSel).value.trim();
    if (notation) return { classes: PushFold.rangeFromNotation(notation), name: notation };
    var pct = parseFloat($(pctSel).value);
    if (!(pct > 0 && pct <= 100)) throw new Error(tag + t(' 的「前 X%」請輸入 0.1–100'));
    return { classes: PushFold.topPercentRange(pct), name: t('前 ') + pct + '%' };
  }

  function renderRvrProfile(board, A, B) {
    var pa = Postflop.rangeBoardProfile(A.classes, board);
    var pb = Postflop.rangeBoardProfile(B.classes, board);
    var rows = Postflop.BUCKET_ORDER.map(function (b) {
      var na = pa.buckets[b], nb = pb.buckets[b];
      return '<tr><td>' + Postflop.BUCKET_NAMES[b] + '</td>' +
        '<td>' + na + t('（') + (pa.combos ? na / pa.combos * 100 : 0).toFixed(1) + t('%）</td>') +
        '<td>' + nb + t('（') + (pb.combos ? nb / pb.combos * 100 : 0).toFixed(1) + t('%）</td></tr>');
    }).join('');
    $('#rvrProfileTable').innerHTML =
      t('<tr><th>牌力</th><th>Range A</th><th>Range B</th></tr>') + rows +
      t('<tr><td><b>堅果（三條以上）</b></td><td>') + pa.nutPct.toFixed(1) + '%</td><td>' +
      pb.nutPct.toFixed(1) + '%</td></tr>' +
      t('<tr><td><b>空氣</b></td><td>') + pa.airPct.toFixed(1) + '%</td><td>' +
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
      $('#rvrATxt').textContent = 'A ' + A.name + t('：') + eqA.toFixed(1) + '%';
      $('#rvrBTxt').textContent = 'B ' + B.name + t('：') + eqB.toFixed(1) + '%';
      $('#rvrBarA').style.width = eqA + '%';
      $('#rvrBarB').style.width = eqB + '%';
      $('#rvrDetail').textContent = detail;
    }

    if (!board.length) {
      $('#rvrProfileWrap').hidden = true;
      var r;
      try { r = PushFold.rangeVsRangeClasses(A.classes, B.classes); }
      catch (err) { alert(err.message); return; }
      show(r.equityA * 100, t('翻前：Range A ') + r.classesA + t(' 類 / ') + r.combosA +
        t(' combo ｜ Range B ') + r.classesB + t(' 類 / ') + r.combosB +
        t(' combo（169×169 勝率表加權，忽略 blocker，平手折半計入）'));
      return;
    }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('計算中…');
    setTimeout(function () {
      try {
        var res = Postflop.rangeVsRangeBoard(A.classes, B.classes, board, 12000);
        var prof = renderRvrProfile(board, A, B);
        var tex = Postflop.classifyBoard(board);
        var edge = (res.a - res.b) * 100;
        var nutEdge = prof.a.nutPct - prof.b.nutPct;
        show(res.a * 100,
          board.length + t(' 張公牌（') + tex.label + t('，濕度 ') + tex.wetness.toFixed(2) + t('）｜') +
          t('range 優勢：') + (edge >= 0 ? 'A' : 'B') + t(' 領先 ') + Math.abs(edge).toFixed(1) +
          t(' 個百分點；堅果優勢：') + (nutEdge >= 0 ? 'A' : 'B') + t(' 多 ') +
          Math.abs(nutEdge).toFixed(1) + t(' 個百分點。') +
          'A ' + res.combosA + t(' combo／B ') + res.combosB + t(' combo，') +
          (res.method === 'exact' ? t('窮舉 ') : 'Monte Carlo ') + res.trials + t(' 次。'));
      } catch (err) { alert(err.message); }
      btn.disabled = false;
      btn.textContent = t('計算 range 勝率');
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

  /* --- 手牌記錄精靈（2026-08-15 Tony 拍板照 3→1→2，參考 PokerAlpha 5 步流程）--- */
  var HW_LAST_STEP = 5;
  var hwStep = 1;
  var HW_POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var SUIT_CHIP = { s: '♠', h: '♥', d: '♦', c: '♣' };

  (function initHandWizard() {
    var pSel = $('#hwPlayers');
    for (var i = 2; i <= 10; i++) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = i + t(' 人');
      pSel.appendChild(o);
    }
    pSel.value = '8';
    $('#hwDate').value = new Date().toISOString().slice(0, 10);
    var dots = $('#hwDots');
    for (var s = 1; s <= HW_LAST_STEP; s++) {
      var d = document.createElement('span');
      d.className = 'wiz-dot';
      dots.appendChild(d);
    }
    function openHandWizard() {
      openSheet('handSheet');
      hwGo(1);
    }
    $('#fabAddHand').addEventListener('click', openHandWizard);
    $('#btnAddHandDesk').addEventListener('click', openHandWizard);
    $('#btnCloseHandSheet').addEventListener('click', function () { closeSheet('handSheet'); });
    $('#btnHwPrev').addEventListener('click', function () { hwGo(hwStep - 1); });
    $('#btnHwNext').addEventListener('click', function () { hwGo(hwStep + 1); });
    $('#hHero').addEventListener('input', renderHeroPreview);
    $('#btnAddOpp').addEventListener('click', function () { addPosRow($('#hwOpps'), 'stack'); });
    $('#btnAddShow').addEventListener('click', function () { addPosRow($('#hwShows'), 'cards'); });
  })();

  function hwGo(n) {
    if (n < 1 || n > HW_LAST_STEP) return;
    hwStep = n;
    $$('#handSheet .wiz-step').forEach(function (el) { el.hidden = +el.dataset.step !== n; });
    $$('#hwDots .wiz-dot').forEach(function (el, i) { el.classList.toggle('active', i < n); });
    $('#btnHwPrev').hidden = n === 1;
    $('#btnHwNext').hidden = n === HW_LAST_STEP;
    if (n === HW_LAST_STEP) renderHandPreview();
    $('#handSheet .sheet').scrollTop = 0;
  }

  function addPosRow(box, kind) {
    var row = document.createElement('div');
    row.className = 'evt-row';
    var sel = document.createElement('select');
    HW_POSITIONS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
    var inp = document.createElement('input');
    if (kind === 'stack') {
      inp.type = 'number';
      inp.inputMode = 'decimal';
      inp.min = '0';
      inp.step = 'any';
      inp.placeholder = t('籌碼（bb）');
    } else {
      inp.type = 'text';
      inp.autocapitalize = 'off';
      inp.autocomplete = 'off';
      inp.placeholder = t('牌（例：9s 8d）');
    }
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-btn';
    del.textContent = '✕';
    del.addEventListener('click', function () { row.remove(); });
    row.appendChild(sel);
    row.appendChild(inp);
    row.appendChild(del);
    box.appendChild(row);
  }
  function readPosRows(box, kind) {
    var out = [];
    Array.prototype.forEach.call(box.querySelectorAll('.evt-row'), function (row) {
      var pos = row.querySelector('select').value;
      var v = row.querySelector('input').value;
      if (kind === 'stack') {
        var st = parseFloat(v);
        out.push(st > 0 ? { pos: pos, stack: st } : { pos: pos });
      } else if (v.trim()) {
        out.push({ pos: pos, cards: v.trim() });
      }
    });
    return out;
  }

  function cardChip(cs) {
    var span = document.createElement('span');
    var suit = cs[1];
    span.className = 'card-chip suit-' + suit;
    span.textContent = cs[0].toUpperCase() + (SUIT_CHIP[suit] || '');
    return span;
  }
  function renderHeroPreview() {
    var box = $('#hwHeroPrev');
    box.innerHTML = '';
    var txt = $('#hHero').value.trim();
    if (!txt) return;
    try {
      HANDS.parseCards(txt, 2).forEach(function (c) {
        box.appendChild(cardChip(Evaluator.cardToString(c)));
      });
    } catch (e) {
      box.textContent = '⚠ ' + e.message;
    }
  }

  function draftHandRec() {
    return {
      date: $('#hwDate').value || new Date().toISOString().slice(0, 10),
      name: $('#hwName').value.trim(),
      gtype: $('#hwType').value,
      players: parseInt($('#hwPlayers').value, 10) || 0,
      blinds: $('#hBlinds').value.trim(),
      ante: parseFloat($('#hAnte').value) || 0,
      stack: parseFloat($('#hStack').value) || 0,
      pos: $('#hPos').value,
      hero: $('#hHero').value.trim(),
      result: $('#hResult').value === '' ? null : parseFloat($('#hResult').value),
      note: $('#hNote').value.trim(),
      opps: readPosRows($('#hwOpps'), 'stack'),
      showdown: readPosRows($('#hwShows'), 'cards')
    };
  }
  function renderHandPreview() {
    var pre = $('#hwPreview');
    var rec = draftHandRec();
    try {
      rec.streets = readStreetInputs().map(function (s) {
        return { street: s.street, boardTxt: s.board.map(Evaluator.cardToString).join(' '),
                 pot: s.pot, toCall: s.toCall, action: s.action, range: s.range };
      });
      pre.textContent = HANDS.handToText(rec);
    } catch (err) {
      rec.streets = [];
      pre.textContent = HANDS.handToText(rec) + '\n\n⚠ ' + err.message;
    }
  }

  var HS_BOARD_LABEL = {
    flop: t('翻牌公牌（3 張，例：Qh 7d 2s）'),
    turn: t('轉牌（第 4 張，例：9c）'),
    river: t('河牌（第 5 張，例：2d）')
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
        t('<label>行動前底池(bb)<input type="number" class="hs-pot" inputmode="decimal" step="any" min="0"></label>') +
        t('<label>需跟注(bb)<input type="number" class="hs-call" inputmode="decimal" step="any" min="0" placeholder="0"></label>') +
        t('<label>我的行動<select class="hs-action"><option value="">（略過）</option>') +
        t('<option value="fold">蓋牌</option><option value="call">跟注</option>') +
        t('<option value="raise">加注</option><option value="allin">全下</option></select></label>') +
        '</div>' +
        t('<label>對手估計 range（例：77+ A9s+ KQo）') +
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
        throw new Error(HANDS.STREET_NAMES[st] + t(' 決策需要 ') + HANDS.BOARD_LEN[st] +
          t(' 張公牌（目前 ') + boardSoFar.length + t(' 張，前面街的公牌也要填）'));
      }
      var pot = parseFloat(block.querySelector('.hs-pot').value);
      var toCall = parseFloat(block.querySelector('.hs-call').value) || 0;
      var range = block.querySelector('.hs-range').value.trim();
      if (!(pot >= 0)) throw new Error(HANDS.STREET_NAMES[st] + t('：請輸入行動前底池（bb）'));
      if (!range) throw new Error(HANDS.STREET_NAMES[st] + t('：請輸入對手估計 range'));
      out.push({ street: st, board: boardSoFar.slice(), pot: pot, toCall: toCall,
                 action: action, range: range });
    });
    return out;
  }

  $('#btnSaveHand').addEventListener('click', function () {
    if (handRecords.length >= Pro.limit('hands')) {
      Pro.hitLimit(t('免費版最多存 5 手，升級 Pro 無限複盤。'));
      return;
    }
    var heroCards;
    try { heroCards = HANDS.parseCards($('#hHero').value, 2); }
    catch (err) { alert('手牌錯誤：' + err.message); return; }
    var streets;
    try { streets = readStreetInputs(); }
    catch (err) { alert(err.message); return; }
    if (!streets.length) { alert('至少記錄一街的決策（選一個行動）'); return; }
    var btn = $('#btnSaveHand');
    btn.disabled = true;
    btn.textContent = t('分析中…');
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
        var rec = draftHandRec();
        rec.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        rec.hero = heroCards.map(Evaluator.cardToString).join(' ');
        rec.streets = streets;
        handRecords.unshift(rec);
        if (handRecords.length > HANDS_CAP) handRecords = handRecords.slice(0, HANDS_CAP);
        saveHands(handRecords);
        // 清空手牌相關輸入（保留桌況：盲注 / 籌碼 / 位置 / 人數，方便連續記錄）
        $('#hHero').value = ''; $('#hResult').value = ''; $('#hNote').value = '';
        $('#hwHeroPrev').innerHTML = '';
        $('#hwOpps').innerHTML = '';
        $('#hwShows').innerHTML = '';
        closeSheet('handSheet');
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
        btn.textContent = t('儲存並分析');
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
      (st.boardTxt ? t(' ｜ 公牌 ') + escapeHtml(st.boardTxt) : '') +
      t(' ｜ 底池 ') + st.pot + t(' bb，需跟注 ') + st.toCall + t(' bb，行動：') +
      HANDS.ACTION_NAMES[st.action] + '<br>' +
      t('對手 range「') + escapeHtml(st.range) + t('」：') + a.rangeClasses + t(' 類 / ') +
      a.combos + t(' combo（') + (a.method === 'exact' ? t('窮舉') : 'Monte Carlo') + t('）<br>') +
      t('需要勝率 ') + needPct + t('% vs 實際勝率 <b>') + eqPct + '%</b><br>';
    if (st.action === 'call') {
      html += t('跟注 EV = ') + eqPct + '% × (' + st.pot + ' + ' + st.toCall + ') − ' + st.toCall +
        ' = <b class="' + (a.evBB >= 0 ? 'pos' : 'neg') + '">' + fmtPL(evRounded) + ' bb</b><br>';
    } else if (st.action === 'fold') {
      html += t('蓋牌 EV = 0 bb') +
        (a.verdict === 'missed_call'
          ? t('（跟注本可 ') + fmtPL(Math.round(HANDS.callEVbb(a.equity, st.pot, st.toCall) * 100) / 100) + t(' bb）')
          : '') + '<br>';
    } else {
      html += t('視同跟注 EV = ') + fmtPL(evRounded) + t(' bb（簡化模型，未計 fold equity）<br>');
    }
    html += '<span class="' + vCls + '">' + HANDS.verdictText(a.verdict) + '</span>';
    return html;
  }

  function renderLeaks() {
    var s = HANDS.leakSummary(handRecords);
    var tbl = $('#leakTable'), hint = $('#leakHint');
    if (!s.decisions) {
      tbl.innerHTML = '';
      hint.textContent = t('儲存手牌後，統計各街的 −EV 跟注與錯過的 +EV 跟注。');
      return;
    }
    var html = t('<tr><th>街</th><th>決策數</th><th>−EV 跟注</th><th>錯過 +EV</th></tr>');
    HANDS.STREETS.forEach(function (st) {
      var b = s.byStreet[st];
      if (!b.decisions) return;
      html += '<tr><td>' + HANDS.STREET_NAMES[st] + '</td><td>' + b.decisions +
        '</td><td class="' + (b.badCalls ? 'neg' : 'muted') + '">' + b.badCalls +
        '</td><td class="' + (b.missedCalls ? 'neg' : 'muted') + '">' + b.missedCalls + '</td></tr>';
    });
    html += t('<tr><td><b>合計</b></td><td>') + s.decisions +
      '</td><td class="' + (s.badCalls ? 'neg' : 'muted') + '">' + s.badCalls +
      '</td><td class="' + (s.missedCalls ? 'neg' : 'muted') + '">' + s.missedCalls + '</td></tr>';
    tbl.innerHTML = html;
    var leaks = s.badCalls + s.missedCalls;
    hint.textContent = leaks
      ? t('共 ') + leaks + t(' 個 leak（跟注決策）— 點下方手牌看完整分析。加注 / 全下未計 fold equity，不列入 leak。')
      : t('目前跟注決策沒有 leak，繼續保持。');
  }

  /* --- 手牌列表：搜尋 / 書籤 / 時間分組（2026-08-15，照 PokerAlpha）--- */
  var handQuery = '';
  var handFavOnly = false;
  $('#handSearch').addEventListener('input', function () {
    handQuery = this.value.trim().toLowerCase();
    renderHandList();
  });
  $('#handFavToggle').addEventListener('click', function () {
    handFavOnly = !handFavOnly;
    this.classList.toggle('on', handFavOnly);
    this.setAttribute('aria-pressed', String(handFavOnly));
    renderHandList();
  });
  function handMatches(h, q) {
    if (!q) return true;
    var hay = [h.hero, HANDS.prettyCards(h.hero), h.name, h.pos, h.note, h.blinds, h.date]
      .concat((h.streets || []).map(function (s) { return s.range; }))
      .join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function copyText(txt, btn, normalLabel) {
    function ok() {
      btn.textContent = t('已複製 ✓');
      setTimeout(function () { btn.textContent = normalLabel; }, 1500);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, fallback);
    } else fallback();
  }

  /* 牌桌圖 PNG 匯出（PokerAlpha 式：桌面＋座位＋公牌＋逐街摘要） */
  var SUIT_COLOR = { s: '#22262e', h: '#d02b3f', d: '#1f6ff0', c: '#1e9e4a' };
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawCardImg(ctx, x, y, w, h, tk) {
    var m = /^([2-9TJQKA])([shdc])$/i.exec(String(tk).trim());
    rr(ctx, x, y, w, h, 4);
    ctx.fillStyle = '#f7f5ee';
    ctx.fill();
    if (!m) return;
    var col = SUIT_COLOR[m[2].toLowerCase()];
    ctx.fillStyle = col;
    ctx.font = 'bold ' + Math.round(h * 0.42) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m[1].toUpperCase(), x + w / 2, y + h * 0.45);
    ctx.font = Math.round(h * 0.34) + 'px sans-serif';
    ctx.fillText(SUIT_CHIP[m[2].toLowerCase()], x + w / 2, y + h * 0.82);
  }
  function handToImage(h) {
    var scale = 2, W = 700;
    var streets = h.streets || [];
    var shows = h.showdown || [];
    var listH = 0;
    streets.forEach(function (st) { listH += st.analysis ? 66 : 46; });
    var H = 96 + 330 + 26 + listH + (shows.length ? 26 + shows.length * 22 : 0) +
            (h.result !== null && h.result !== undefined ? 36 : 0) + (h.note ? 26 : 0) + 30;
    var cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#101413';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c9a24b';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    // 標題列
    ctx.fillStyle = '#e8c87e';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(h.name || (h.gtype === 'mtt' ? t('錦標賽') : t('現金局')), W / 2, 42);
    ctx.fillStyle = '#8b91a3';
    ctx.font = '13px sans-serif';
    ctx.fillText(h.date +
      (h.blinds ? '　' + t('盲注 ') + h.blinds : '') +
      (h.players ? '　' + h.players + t(' 人桌') : '') +
      (h.stack ? '　' + h.stack + ' bb' : ''), W / 2, 64);
    // 桌面
    var tcx = W / 2, tcy = 96 + 158, rx = 228, ry = 116;
    ctx.beginPath();
    ctx.ellipse(tcx, tcy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#173428';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9a24b';
    ctx.stroke();
    // 座位：hero 固定在正下方，其他照牌桌相對位置排
    var heroIdx = Math.max(0, HW_POSITIONS.indexOf(h.pos));
    function seatXY(pos, inward) {
      var idx = HW_POSITIONS.indexOf(pos);
      if (idx < 0) idx = 0;
      var a = Math.PI / 2 + (idx - heroIdx) * 2 * Math.PI / 9;
      var f = inward ? 0.62 : 1;
      return { x: tcx + (rx + 26) * f * Math.cos(a), y: tcy + (ry + 24) * f * Math.sin(a) };
    }
    var seatStacks = {};
    (h.opps || []).forEach(function (o) { if (o.stack) seatStacks[o.pos] = o.stack; });
    if (h.stack) seatStacks[h.pos] = h.stack;
    var seatSet = {};
    [h.pos].concat((h.opps || []).map(function (o) { return o.pos; }),
      shows.map(function (s) { return s.pos; })).forEach(function (p) { seatSet[p] = true; });
    Object.keys(seatSet).forEach(function (pos) {
      var pt = seatXY(pos);
      var isHero = pos === h.pos;
      rr(ctx, pt.x - 30, pt.y - 13, 60, 26, 13);
      ctx.fillStyle = isHero ? '#c9a24b' : '#242a28';
      ctx.fill();
      ctx.fillStyle = isHero ? '#141310' : '#d9ddd6';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pos, pt.x, pt.y + 4);
      if (seatStacks[pos]) {
        ctx.fillStyle = '#8b91a3';
        ctx.font = '11px sans-serif';
        ctx.fillText(seatStacks[pos] + ' bb', pt.x, pt.y + (pt.y > tcy ? 26 : -18));
      }
    });
    // hero 手牌＋攤牌玩家的牌（往桌心內縮畫）
    function drawTokensAt(pos, cardsTxt) {
      var toks = HANDS.prettyCards(cardsTxt) ? String(cardsTxt).trim().split(/[\s,]+/) : [];
      var flat = [];
      toks.forEach(function (tk2) {
        if (tk2.length > 2 && tk2.length % 2 === 0) {
          for (var i2 = 0; i2 < tk2.length; i2 += 2) flat.push(tk2.slice(i2, i2 + 2));
        } else flat.push(tk2);
      });
      var pt = seatXY(pos, true);
      var cw = 26, chh = 36, gap = 3;
      var x0 = pt.x - (flat.length * (cw + gap) - gap) / 2;
      flat.forEach(function (tk2, i2) {
        drawCardImg(ctx, x0 + i2 * (cw + gap), pt.y - chh / 2, cw, chh, tk2);
      });
    }
    if (h.hero) drawTokensAt(h.pos, h.hero);
    shows.forEach(function (sd) { drawTokensAt(sd.pos, sd.cards); });
    // 公牌（取最後一街的 board）＋底池
    var lastBoard = '';
    var lastPot = 0;
    streets.forEach(function (st) {
      if (st.boardTxt && st.boardTxt.length >= lastBoard.length) lastBoard = st.boardTxt;
      lastPot = Math.max(lastPot, (st.pot || 0) + (st.toCall || 0));
    });
    if (lastBoard) {
      var toks = lastBoard.split(/\s+/);
      var bw = 30, bh = 42, bgap = 5;
      var bx = tcx - (toks.length * (bw + bgap) - bgap) / 2;
      toks.forEach(function (tk, i) {
        drawCardImg(ctx, bx + i * (bw + bgap), tcy - bh / 2 - 8, bw, bh, tk);
      });
    }
    if (lastPot) {
      ctx.fillStyle = '#e8c87e';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pot: ' + lastPot + ' bb', tcx, tcy + 38);
    }
    // 逐街摘要
    var y = 96 + 330 + 18;
    ctx.textAlign = 'left';
    streets.forEach(function (st) {
      ctx.fillStyle = '#e8c87e';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(HANDS.STREET_NAMES[st.street] +
        (st.boardTxt ? '  ' + HANDS.prettyCards(st.boardTxt) : '') +
        t('｜底池 ') + st.pot + ' bb' +
        (st.toCall ? t('｜需跟注 ') + st.toCall + ' bb' : '') +
        t('｜') + HANDS.ACTION_NAMES[st.action], 30, y);
      y += 20;
      ctx.fillStyle = '#8b91a3';
      ctx.font = '12px sans-serif';
      ctx.fillText(t('對手 range：') + st.range, 30, y);
      y += 18;
      if (st.analysis) {
        var a = st.analysis;
        ctx.fillStyle = a.leak ? '#e8596a'
          : (a.verdict === 'good_call' || a.verdict === 'good_fold' || a.verdict === 'raise_ahead')
            ? '#46d183' : '#8b91a3';
        ctx.fillText(t('需要勝率 ') + (a.needed * 100).toFixed(1) +
          t('% vs 實際 ') + (a.equity * 100).toFixed(1) + '% → ' +
          HANDS.verdictText(a.verdict), 30, y);
        y += 20;
      }
      y += 8;
    });
    if (shows.length) {
      ctx.fillStyle = '#e8c87e';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(t('攤牌'), 30, y);
      y += 20;
      ctx.fillStyle = '#d9ddd6';
      ctx.font = '12px sans-serif';
      shows.forEach(function (sd) {
        ctx.fillText(sd.pos + t('：') + HANDS.prettyCards(sd.cards), 30, y);
        y += 22;
      });
      y += 4;
    }
    if (h.result !== null && h.result !== undefined) {
      ctx.fillStyle = h.result > 0 ? '#46d183' : h.result < 0 ? '#e8596a' : '#8b91a3';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(t('結果：') + (h.result > 0 ? '+' : '') + h.result + ' bb', 30, y);
      y += 26;
    }
    if (h.note) {
      ctx.fillStyle = '#8b91a3';
      ctx.font = '12px sans-serif';
      var noteTxt = h.note.length > 58 ? h.note.slice(0, 58) + '…' : h.note;
      ctx.fillText(t('備註：') + noteTxt, 30, y);
    }
    cv.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hand-' + (h.date || 'export') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, 'image/png');
  }

  var BUCKET_NAMES = { today: t('今天'), yesterday: t('昨天'), thisweek: t('本週'),
    lastweek: t('上週'), thismonth: t('本月'), unknown: t('其他') };

  function renderHandList(expandId) {
    var ul = $('#handList');
    ul.innerHTML = '';
    if (!handRecords.length) {
      ul.innerHTML = t('<li class="empty-msg">尚無複盤紀錄</li>');
      return;
    }
    var list = handRecords.filter(function (h) {
      return (!handFavOnly || h.fav) && handMatches(h, handQuery);
    }).slice().sort(function (a, b) {
      return b.date < a.date ? -1 : b.date > a.date ? 1 : (b.id < a.id ? -1 : 1);
    });
    if (!list.length) {
      ul.innerHTML = t('<li class="empty-msg">沒有符合的手牌</li>');
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    var lastBucket = null;
    list.forEach(function (h) {
      var bk = HANDS.dateBucket(h.date, today);
      if (bk !== lastBucket) {
        lastBucket = bk;
        var gh = document.createElement('li');
        gh.className = 'group-head';
        gh.textContent = BUCKET_NAMES[bk] || bk.replace('-', '/');
        ul.appendChild(gh);
      }
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
        HANDS.prettyCards(h.hero) + (h.name ? ' · ' + h.name : '') +
        (h.blinds ? ' · ' + h.blinds : '')));
      var sub = document.createElement('div');
      sub.className = 'session-sub';
      sub.textContent = h.date + (h.streets && h.streets.length
        ? t(' ｜ ') + h.streets.map(function (st) {
            return HANDS.STREET_NAMES[st.street] + HANDS.ACTION_NAMES[st.action] +
              (st.analysis ? t('：') + HANDS.verdictText(st.analysis.verdict) : '');
          }).join(t(' ｜ '))
        : '');
      main.appendChild(title);
      main.appendChild(sub);
      var fav = document.createElement('button');
      fav.className = 'fav-star' + (h.fav ? ' on' : '');
      fav.textContent = '★';
      fav.setAttribute('aria-label', t('書籤'));
      fav.addEventListener('click', function (e) {
        e.stopPropagation();
        h.fav = !h.fav;
        saveHands(handRecords);
        fav.classList.toggle('on', h.fav);
        if (handFavOnly && !h.fav) renderHandList();
      });
      var pl = document.createElement('span');
      pl.className = 'session-pl ' +
        (h.result > 0 ? 'pos' : h.result < 0 ? 'neg' : 'muted');
      pl.textContent = (h.result === null || h.result === undefined)
        ? '—' : fmtPL(h.result) + ' bb';
      var del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.setAttribute('aria-label', t('刪除手牌'));
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        UI.confirm(t('刪除這手複盤紀錄？')).then(function (ok) {
          if (!ok) return;
          handRecords = handRecords.filter(function (x) { return x.id !== h.id; });
          saveHands(handRecords);
          renderHands();
        });
      });
      head.appendChild(main);
      head.appendChild(fav);
      head.appendChild(pl);
      head.appendChild(del);
      var detail = document.createElement('div');
      detail.className = 'hand-detail';
      detail.hidden = h.id !== expandId;
      var dHtml = '';
      if (h.stack || h.ante) {
        dHtml += t('<p class="hint">有效籌碼 ') + h.stack + ' bb' +
          (h.ante ? t('，前注/人 ') + h.ante : '') + '</p>';
      }
      (h.streets || []).forEach(function (st) {
        if (st.analysis) dHtml += '<div class="ev-result">' + streetDetailHtml(st) + '</div>';
      });
      if (h.showdown && h.showdown.length) {
        dHtml += '<p class="hint">' + escapeHtml(t('攤牌：') + h.showdown.map(function (sd) {
          return sd.pos + ' ' + HANDS.prettyCards(sd.cards);
        }).join(t(' ｜ '))) + '</p>';
      }
      if (h.note) dHtml += '<p class="hint">' + escapeHtml(h.note) + '</p>';
      detail.innerHTML = dHtml;
      var tools = document.createElement('div');
      tools.className = 'btn-row';
      var btnCopy = document.createElement('button');
      btnCopy.className = 'btn';
      var copyLabel = t('📋 複製文字');
      btnCopy.textContent = copyLabel;
      btnCopy.addEventListener('click', function () {
        copyText(HANDS.handToText(h), btnCopy, copyLabel);
      });
      var btnImg = document.createElement('button');
      btnImg.className = 'btn';
      btnImg.textContent = t('🖼 下載圖片');
      btnImg.addEventListener('click', function () { handToImage(h); });
      tools.appendChild(btnCopy);
      tools.appendChild(btnImg);
      detail.appendChild(tools);
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
    if (!s) return t('日期未定');
    var txt = s.slice(5).replace('-', '/');
    if (e) txt += ' – ' + e.slice(5).replace('-', '/');
    return txt + t('（') + s.slice(0, 4) + t('）');
  }

  function renderEvents() {
    if (!evData) return;
    /* 只用洲別＋城市，不顯示也不篩國家 —— 主權敏感地區的名稱爭議一律避開 */
    var region = $('#evRegion').value, city = $('#evCity').value;
    var list = evData.events.filter(function (ev) {
      return (region === 'all' || ev.region === region) &&
             (city === 'all' || ev.city === city);
    });
    /* 免費版只看 14 天內開賽的賽事，完整巡迴表是 Pro */
    var evHidden = 0;
    if (!Pro.has()) {
      var cutoff = new Date(Date.now() + Pro.limits.eventDays * 864e5).toISOString().slice(0, 10);
      var full = list.length;
      list = list.filter(function (ev) { return ev.start && ev.start <= cutoff; });
      evHidden = full - list.length;
    }
    // 依開始日排序，無日期排最後
    list.sort(function (a, b) {
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start < b.start ? -1 : 1;
    });
    var box = $('#evList');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = t('<p class="empty-msg">此篩選條件下沒有賽事</p>');
      if (evHidden) evAppendProMore(box, evHidden);
      return;
    }
    var byRegion = {};
    list.forEach(function (ev) {
      (byRegion[ev.region] = byRegion[ev.region] || []).push(ev);
    });
    Object.keys(byRegion).forEach(function (rg) {
      var h = document.createElement('div');
      h.className = 'ev-region';
      h.textContent = t(rg);
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
        /* 有逐日賽程的賽事：掛徽章，點卡片開站內賽程表（js/schedule.js） */
        if (ev.schedule) {
          var badge = document.createElement('span');
          badge.className = 'ev-sched-badge';
          badge.textContent = '📅 ' + t('賽程表');
          top.appendChild(badge);
          item.classList.add('has-sched');
          item._ev = ev;
        }
        var sub = document.createElement('div');
        sub.className = 'ev-sub';
        sub.textContent = t(ev.city) +
          (ev.venue ? ' · ' + ev.venue : '') +
          (ev.note ? t(' ｜ ') + t(ev.note) : '');
        item.appendChild(top); item.appendChild(sub);
        box.appendChild(item);
      });
    });
    if (evHidden) evAppendProMore(box, evHidden);
  }

  /* 被 14 天限制擋掉的賽事 → 列表尾巴放一顆升級鈕 */
  function evAppendProMore(box, hidden) {
    var more = document.createElement('button');
    more.className = 'btn full pro-more';
    more.textContent = '🔒 +' + hidden + '　' + t('完整巡迴表是 Pro 功能');
    more.addEventListener('click', function () {
      Pro.paywall(t('免費版只看 14 天內的賽事。'));
    });
    box.appendChild(more);
  }

  function evFillFilters() {
    var regions = {}, cities = {};
    evData.events.forEach(function (ev) {
      regions[ev.region] = true;
      if (ev.city) cities[ev.city] = true;
    });
    function fill(sel, keys) {
      var cur = sel.value;
      sel.innerHTML = t('<option value="all">全部</option>');
      Object.keys(keys).sort().forEach(function (k) {
        var o = document.createElement('option');
        o.value = k; o.textContent = t(k);
        sel.appendChild(o);
      });
      sel.value = cur && (cur === 'all' || keys[cur]) ? cur : 'all';
    }
    fill($('#evRegion'), regions);
    fill($('#evCity'), cities);
  }

  function loadEvents() {
    var day = new Date().toISOString().slice(0, 10);
    /* 賽事資料的 city/note 翻譯表：載入後併進當前語言字典，t() 即可查到 */
    var i18nReady = (window.I18N_LANG && window.I18N_LANG !== 'zh-TW' && window.I18N_DICT)
      ? fetch('data/tournaments-i18n.json?d=' + day)
          .then(function (r) { return r.json(); })
          .then(function (tables) {
            var cur = window.I18N_DICT[window.I18N_LANG];
            if (cur && tables[window.I18N_LANG]) Object.assign(cur, tables[window.I18N_LANG]);
          })
          .catch(function () {})
      : Promise.resolve();
    i18nReady.then(function () {
      return fetch('data/tournaments.json?d=' + day);
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        /* 已結束的賽事直接拿掉（2026-08-21 Tony：過期的不要留著）；資料端每日也會修剪，
         * 這裡再擋一層是為了更新間隔內剛過期的那幾筆 */
        data.events = (data.events || []).filter(function (ev) {
          return !ev.end || ev.end >= day;
        });
        evData = data;
        $('#evUpdated').textContent = t('更新於 ') + (data.updated || '—');
        evFillFilters();
        renderEvents();
      })
      .catch(function () {
        $('#evList').innerHTML = t('<p class="empty-msg">賽事資料載入失敗</p>');
      });
  }
  $('#evRegion').addEventListener('change', renderEvents);
  $('#evCity').addEventListener('change', renderEvents);
  /* 賽事卡片：有賽程表就開站內逐日賽程；沒有則展開/收合說明（點連結不算） */
  $('#evList').addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var item = e.target.closest('.ev-item');
    if (!item) return;
    if (item._ev && item._ev.schedule && window.Sched) { Sched.open(item._ev); return; }
    item.classList.toggle('open');
  });
  loadEvents();

  /* ================= PWA ================= */
  /* 原生殼（Capacitor）內不註冊 SW：離線由 app bundle 負責，避免 capacitor:// scheme 下的快取干擾 */
  var isNativeShell = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if ('serviceWorker' in navigator && !isNativeShell) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
