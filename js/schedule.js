/* 賽程表視圖 —— 賽事卡片點進來的站內逐日賽程（取代跳官網）。
 * 版型照每日 TG 提醒卡（Tony 2026-07-18 核可的那版）：日期橫條分組、
 * 類別配色列、頂部圖例；金額顯示原幣別＋美金換算（data/fx.json）。
 * 資料：data/schedules/<slug>.json（tools/sync-schedules.mjs 產）、
 * 翻譯：data/schedules-i18n/<lang>.json（tools/gen-schedules-i18n.mjs 產）。
 * app.js 在卡片點擊時呼叫 Sched.open(ev)（ev.schedule = slug）。 */
(function () {
  'use strict';

  /* 類別分類沿用提醒卡 card.js 的 cat()：順序即優先序，先中先贏 */
  var CATS = [
    { key: 'main', color: '#d4af6a', label: '主賽/保底賽', test: /★|Main Event/i },
    { key: 'crown', color: '#e8a0c8', label: 'Crown Main', test: /♛|Crown/i },
    { key: 'hr', color: '#c8a0e8', label: 'High Roller', test: /High Roller|Apex|Superstar|Super High/i },
    { key: 'mix', color: '#8ab8d8', label: '混合牌種', test: /PLO|Big ?O|Stud|Draw|Omaha|Hi-Lo|Mix/i },
    { key: 'lady', color: '#e8a0b4', label: '女士賽', test: /Ladies|Poker Queen/i },
    { key: 'daily', color: '#9ec89e', label: '每日賽', test: /Daily|MegaStack|Freeroll/i },
    { key: 'sat', color: '#7d857f', label: '衛星賽', test: /衛星|Satellite|Qualifier/i }
  ];
  function cat(name) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].test.test(name || '')) return CATS[i];
    return null;
  }

  var SYM = { USD: '$', KRW: '₩', TWD: 'NT$', VND: '₫', EUR: '€', GBP: '£',
    PHP: '₱', JPY: '¥', CNY: '¥', HKD: 'HK$', THB: '฿', SGD: 'S$', MYR: 'RM' };

  /* "700,000" / "2K" / "11.2M" / "20B" → 數字；解析不了回 null */
  function parseAmt(s) {
    if (s === 0) return 0;
    if (!s) return null;
    var m = String(s).trim().replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    var mul = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
    return n * mul;
  }

  function fmtUsd(n) {
    if (n >= 1e6) return 'US$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return 'US$' + Math.round(n).toLocaleString('en-US');
    return 'US$' + (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
  }

  var fxCache = null, schedCache = {}, dictCache = null, dictLang = null;

  function getJson(url) {
    var day = new Date().toISOString().slice(0, 10);
    return fetch(url + '?d=' + day).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  function loadAll(slug) {
    var lang = window.I18N_LANG || 'zh-TW';
    var jobs = [
      schedCache[slug] ? Promise.resolve(schedCache[slug]) :
        getJson('data/schedules/' + slug + '.json').then(function (d) { return (schedCache[slug] = d); }),
      fxCache ? Promise.resolve(fxCache) :
        getJson('data/fx.json').then(function (d) { return (fxCache = d); }).catch(function () { return null; }),
      (lang === 'en') ? Promise.resolve({}) :
        (dictCache && dictLang === lang) ? Promise.resolve(dictCache) :
          getJson('data/schedules-i18n/' + lang + '.json')
            .then(function (d) { dictLang = lang; return (dictCache = d); })
            .catch(function () { return {}; })
    ];
    return Promise.all(jobs);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function close() {
    var m = document.getElementById('schedView');
    if (m) m.remove();
    document.body.style.overflow = '';
  }

  function fmtRange(days) {
    if (!days.length) return '';
    var a = days[0].date, b = days[days.length - 1].date;
    return a.slice(5).replace('-', '/') + ' – ' + b.slice(5).replace('-', '/') +
      t('（') + a.slice(0, 4) + t('）');
  }

  function weekday(dateStr) {
    try {
      return new Intl.DateTimeFormat(window.I18N_LANG || 'zh-TW', { weekday: 'short' })
        .format(new Date(dateStr + 'T12:00:00'));
    } catch (e) { return ''; }
  }

  /* 一格金額：上行原幣別、下行 ≈US$（同幣別是 USD 就只一行） */
  function amtCell(raw, currency, rate) {
    var box = el('div', 'sched-amt');
    if (raw == null || raw === '') { box.appendChild(el('span', 'sched-amt-main', '—')); return box; }
    var sym = SYM[currency] || (currency + ' ');
    box.appendChild(el('span', 'sched-amt-main', sym + raw));
    var n = parseAmt(raw);
    if (n != null && rate && currency !== 'USD') {
      box.appendChild(el('span', 'sched-amt-usd', '≈' + fmtUsd(n / rate)));
    }
    return box;
  }

  function render(ev, sc, fx, dict) {
    close();
    var tr = function (s) { return (dict && dict[s]) || s; };
    var rate = fx && fx.rates && fx.rates[sc.currency];

    var back = el('div', 'sched-backdrop');
    back.id = 'schedView';

    var head = el('div', 'sched-head');
    var ttl = el('div', 'sched-title', ev.series);
    var x = el('button', 'sched-close', '✕');
    x.setAttribute('aria-label', t('關閉'));
    x.addEventListener('click', close);
    head.appendChild(ttl); head.appendChild(x);
    back.appendChild(head);

    var meta = el('div', 'sched-meta',
      t(ev.city) + (sc.venue ? ' · ' + sc.venue : '') + ' · ' + fmtRange(sc.days));
    back.appendChild(meta);

    /* 圖例 */
    var legend = el('div', 'sched-legend');
    CATS.forEach(function (c) {
      var it = el('span', 'sched-leg');
      var dot = el('span', 'sched-dot');
      dot.style.background = c.color;
      it.appendChild(dot);
      it.appendChild(document.createTextNode(t(c.label)));
      legend.appendChild(it);
    });
    back.appendChild(legend);

    sc.days.forEach(function (d) {
      var bar = el('div', 'sched-day');
      bar.appendChild(el('span', 'sched-day-date',
        d.date.slice(5).replace('-', '/') + '（' + weekday(d.date) + '）'));
      bar.appendChild(el('span', 'sched-day-n', d.events.length + t(' 場')));
      back.appendChild(bar);
      d.events.forEach(function (e2) {
        var row = el('div', 'sched-row');
        var c = cat(e2.name);
        row.style.borderLeftColor = c ? c.color : 'transparent';
        row.appendChild(el('span', 'sched-time', e2.time || ''));
        row.appendChild(el('span', 'sched-name', tr(e2.name)));
        var amts = el('div', 'sched-amts');
        var buy = amtCell(e2.buyin, sc.currency, rate);
        buy.appendChild(el('span', 'sched-amt-tag', t('買入')));
        var gtd = amtCell(e2.gtd, sc.currency, rate);
        gtd.appendChild(el('span', 'sched-amt-tag', t('保證')));
        amts.appendChild(buy); amts.appendChild(gtd);
        row.appendChild(amts);
        back.appendChild(row);
      });
    });

    var notes = Array.isArray(sc.notes) ? sc.notes : (sc.notes ? [sc.notes] : []);
    notes.forEach(function (n) {
      if (typeof n === 'string') back.appendChild(el('p', 'sched-note', tr(n)));
    });

    var foot = el('div', 'sched-foot');
    if (sc.updated) {
      foot.appendChild(el('span', 'sched-updated',
        t('賽程更新於 ') + String(sc.updated).slice(0, 10)));
    }
    if (ev.url) {
      var a = el('a', 'sched-link', t('官網') + ' ↗');
      a.href = ev.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      foot.appendChild(a);
    }
    back.appendChild(foot);

    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
  }

  function open(ev) {
    var slug = ev.schedule;
    if (!slug) return;
    loadAll(slug).then(function (res) {
      render(ev, res[0], res[1], res[2]);
    }).catch(function () {
      alert(t('賽程載入失敗，請稍後再試。'));
    });
  }

  window.Sched = { open: open, close: close };
})();
