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
  /* 選單裡的色塊：左半是該色系的底色、右半是重點色，一眼看得出差別 */
  var SWATCH = {
    '': 'linear-gradient(135deg, #0b0e0d 48%, #d4af6a 52%)',
    midnight: 'linear-gradient(135deg, #0a0d13 48%, #8ab4f8 52%)',
    crimson: 'linear-gradient(135deg, #0e0b0c 48%, #e8938a 52%)',
    violet: 'linear-gradient(135deg, #0d0b12 48%, #b79ce8 52%)',
    light: 'linear-gradient(135deg, #f2efe8 48%, #a9853f 52%)'
  };
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
    var langChip = document.getElementById('langChip');
    if (!header) return;
    /* 只露調色盤圖示，色系名稱與色塊留在下拉選單裡（手機頂欄放不下字） */
    var chip = window.makeIconChip('🎨', t('色系'),
      THEMES.map(function (th) { return [th[0], t(th[1])]; }), cur,
      function (v) {
        cur = v;
        try { localStorage.setItem('poker.theme', cur); } catch (e) {}
        apply(cur);
      },
      {
        decorate: function (row, value) {
          var sw = document.createElement('span');
          sw.className = 'menu-swatch';
          sw.style.background = SWATCH[value] || SWATCH[''];
          row.appendChild(sw);
        }
      });
    chip.wrap.id = 'themeChip';
    /* 插在語言選單後面 */
    if (langChip && langChip.nextSibling) header.insertBefore(chip.wrap, langChip.nextSibling);
    else header.appendChild(chip.wrap);
  }

  apply(cur);
  addPicker();
})();
