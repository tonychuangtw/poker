/* header 圖示 chip：外框只露一個字元（🌐/🎨/A），原生 <select> 透明疊在上面。
   手機頂欄空間有限，收合成圖示才不會被右邊的登入鈕擠掉字。 */
(function () {
  'use strict';
  /* items: [[value, label], ...]；回傳 { wrap, sel } */
  window.makeIconChip = function (glyph, ariaLabel, items, current, onChange) {
    var wrap = document.createElement('span');
    wrap.className = 'icon-chip';

    var g = document.createElement('span');
    g.className = 'icon-chip-glyph';
    g.textContent = glyph;
    g.setAttribute('aria-hidden', 'true');
    wrap.appendChild(g);

    var sel = document.createElement('select');
    sel.setAttribute('aria-label', ariaLabel);
    sel.title = ariaLabel;
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it[0];
      o.textContent = it[1];
      if (it[0] === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    wrap.appendChild(sel);

    return { wrap: wrap, sel: sel };
  };
})();
