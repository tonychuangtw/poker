/* 字體大小：改 html 的 font-size，全站 rem 尺寸跟著縮放。
   head 內的 inline script 已在首繪前套用，這裡負責選單 UI 與持久化。 */
(function () {
  'use strict';
  var BASE = 16;
  /* 上限拉到 2×（16→32px）：老花回報 1.45 還是不夠 */
  var SIZES = [
    ['0.9', '小'],
    ['1', '標準'],
    ['1.2', '大'],
    ['1.45', '特大'],
    ['1.7', '超大'],
    ['2', '最大']
  ];

  var cur = '1';
  try { cur = localStorage.getItem('poker.fontScale') || '1'; } catch (e) {}
  if (!SIZES.some(function (s) { return s[0] === cur; })) cur = '1';

  function apply(scale) {
    document.documentElement.style.fontSize = (BASE * parseFloat(scale)) + 'px';
  }

  apply(cur);

  var chip = window.makeIconChip('A', t('字體大小'),
    SIZES.map(function (s) { return [s[0], t(s[1])]; }), cur,
    function (v) {
      cur = v;
      try { localStorage.setItem('poker.fontScale', cur); } catch (e) {}
      apply(cur);
    });

  chip.wrap.id = 'fontChip';
  chip.sel.id = 'fontSel';

  /* 插在色系選單後面（語言 → 色系 → 字級） */
  var header = document.querySelector('.app-header');
  var themeChip = document.getElementById('themeChip');
  if (!header) return;
  if (themeChip && themeChip.nextSibling) header.insertBefore(chip.wrap, themeChip.nextSibling);
  else header.appendChild(chip.wrap);
})();
