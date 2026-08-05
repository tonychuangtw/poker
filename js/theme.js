/* 色系主題：head 內的 inline script 已在首繪前套用 data-theme，
   這裡負責選單 UI、持久化、meta theme-color 與原生狀態列連動。 */
(function () {
  'use strict';
  var THEMES = [
    ['', '金綠賭桌'],
    ['midnight', '午夜藍'],
    ['crimson', '酒紅'],
    ['violet', '紫羅蘭'],
    ['light', '明亮']
  ];
  var BAR_COLORS = {
    '': '#0b0e0d', midnight: '#0a0d13', crimson: '#0e0b0c',
    violet: '#0d0b12', light: '#f2efe8'
  };

  var cur = '';
  try { cur = localStorage.getItem('poker.theme') || ''; } catch (e) {}
  if (!THEMES.some(function (t) { return t[0] === cur; })) cur = '';

  function apply(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR_COLORS[theme] || BAR_COLORS['']);
    /* 原生殼：狀態列文字顏色跟主題明暗走 */
    var cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.StatusBar) {
      cap.Plugins.StatusBar.setStyle({ style: theme === 'light' ? 'LIGHT' : 'DARK' }).catch(function () {});
    }
  }

  function addPicker() {
    var header = document.querySelector('.app-header');
    var langSel = document.getElementById('langSel');
    if (!header) return;
    var sel = document.createElement('select');
    sel.id = 'themeSel';
    sel.className = 'theme-sel';
    sel.setAttribute('aria-label', 'Theme');
    THEMES.forEach(function (th) {
      var o = document.createElement('option');
      o.value = th[0];
      o.textContent = '🎨 ' + t(th[1]);
      if (th[0] === cur) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      cur = sel.value;
      try { localStorage.setItem('poker.theme', cur); } catch (e) {}
      apply(cur);
    });
    /* 插在語言選單後面 */
    if (langSel && langSel.nextSibling) header.insertBefore(sel, langSel.nextSibling);
    else header.appendChild(sel);
  }

  apply(cur);
  addPicker();
})();
