/* header 圖示 chip ＋ 自製下拉選單。
 *
 * 原本用原生 <select>：手機還好，桌機的清單是作業系統畫的，跟這個 app 的質感差很多，
 * 也沒辦法放色塊或字級預覽。所以改成自己畫的浮層 —— chip 是按鈕，點開一張小卡，
 * 每列可以帶色塊 / 大小預覽 / 打勾。
 *
 * makeIconChip(glyph, ariaLabel, items, current, onChange, opts) → { wrap, open, close }
 *   items : [[value, label], ...]
 *   opts.decorate(row, value, label) : 想在列上加東西時用（色塊、字級預覽…）
 */
(function () {
  'use strict';

  var openMenu = null;   /* 同時只開一張 */

  function closeAny() {
    if (openMenu) openMenu.close();
  }

  document.addEventListener('click', function (e) {
    if (!openMenu) return;
    if (openMenu.wrap.contains(e.target) || openMenu.pop.contains(e.target)) return;
    closeAny();
  });
  document.addEventListener('keydown', function (e) {
    if (!openMenu) return;
    if (e.key === 'Escape') { closeAny(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var rows = openMenu.pop.querySelectorAll('.menu-item');
      var i = -1;
      for (var k = 0; k < rows.length; k++) if (rows[k] === document.activeElement) i = k;
      i += (e.key === 'ArrowDown' ? 1 : -1);
      if (i < 0) i = rows.length - 1;
      if (i >= rows.length) i = 0;
      rows[i].focus();
    }
  });
  window.addEventListener('resize', closeAny);
  /* 頁面捲動就收起來（浮層是 fixed 定位的），但在選單內捲不算 */
  window.addEventListener('scroll', function (e) {
    if (openMenu && e.target && openMenu.pop.contains && openMenu.pop.contains(e.target)) return;
    closeAny();
  }, true);

  window.makeIconChip = function (glyph, ariaLabel, items, current, onChange, opts) {
    opts = opts || {};

    var wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'icon-chip';
    wrap.setAttribute('aria-label', ariaLabel);
    wrap.setAttribute('aria-haspopup', 'true');
    wrap.setAttribute('aria-expanded', 'false');
    wrap.title = ariaLabel;

    var g = document.createElement('span');
    g.className = 'icon-chip-glyph';
    g.textContent = glyph;
    g.setAttribute('aria-hidden', 'true');
    wrap.appendChild(g);

    var pop = document.createElement('div');
    pop.className = 'menu-pop';
    pop.setAttribute('role', 'menu');
    pop.hidden = true;

    var head = document.createElement('div');
    head.className = 'menu-head';
    head.textContent = ariaLabel;
    pop.appendChild(head);

    var cur = current;

    items.forEach(function (it) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'menu-item';
      row.setAttribute('role', 'menuitemradio');
      row.dataset.value = it[0];

      if (opts.decorate) opts.decorate(row, it[0], it[1]);

      var label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = it[1];
      if (opts.labelStyle) opts.labelStyle(label, it[0]);
      row.appendChild(label);

      var tick = document.createElement('span');
      tick.className = 'menu-tick';
      tick.textContent = '✓';
      row.appendChild(tick);

      row.setAttribute('aria-checked', it[0] === cur ? 'true' : 'false');
      if (it[0] === cur) row.classList.add('sel');

      row.addEventListener('click', function () {
        cur = it[0];
        var rows = pop.querySelectorAll('.menu-item');
        for (var i = 0; i < rows.length; i++) {
          var on = rows[i].dataset.value === cur;
          rows[i].classList.toggle('sel', on);
          rows[i].setAttribute('aria-checked', on ? 'true' : 'false');
        }
        close();
        onChange(cur);
      });

      pop.appendChild(row);
    });

    function place() {
      var r = wrap.getBoundingClientRect();
      pop.style.top = (r.bottom + 8) + 'px';
      /* 靠右對齊 chip，但不要頂出畫面 */
      var right = Math.max(8, window.innerWidth - r.right);
      pop.style.right = right + 'px';
      pop.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 24) + 'px';
    }

    function open() {
      closeAny();
      pop.hidden = false;
      place();
      wrap.setAttribute('aria-expanded', 'true');
      wrap.classList.add('chip-open');
      openMenu = api;
      var sel = pop.querySelector('.menu-item.sel') || pop.querySelector('.menu-item');
      if (sel) sel.focus();
    }

    function close() {
      pop.hidden = true;
      wrap.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('chip-open');
      if (openMenu === api) openMenu = null;
    }

    wrap.addEventListener('click', function () {
      if (pop.hidden) open(); else close();
    });

    document.body.appendChild(pop);

    var api = { wrap: wrap, pop: pop, open: open, close: close };
    return api;
  };
})();
