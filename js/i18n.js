/* i18n runtime — zh-TW 為 canonical key，字典在 js/i18n-dict.js（window.I18N_DICT）。
   動態字串由各 js 檔的 t() 於 render 時翻；靜態 DOM 由此檔開機時走訪翻譯。
   切換語言 = 存偏好 + reload，避免追蹤已渲染內容。 */
(function () {
  'use strict';
  var LANGS = [
    ['zh-TW', '繁體中文'],
    ['zh-CN', '简体中文'],
    ['en', 'English'],
    ['ja', '日本語'],
    ['ko', '한국어'],
    ['es', 'Español'],
    ['pt-BR', 'Português'],
    ['fr', 'Français'],
    ['de', 'Deutsch'],
    ['ru', 'Русский'],
    ['vi', 'Tiếng Việt'],
    ['th', 'ไทย']
  ];

  var lang = null;
  try { lang = localStorage.getItem('poker.lang'); } catch (e) {}
  if (!lang || !LANGS.some(function (l) { return l[0] === lang; })) {
    var nav = navigator.language || 'zh-TW';
    if (/^zh(-TW|-HK|-Hant)/i.test(nav)) lang = 'zh-TW';
    else if (/^zh/i.test(nav)) lang = 'zh-CN';
    else if (/^pt/i.test(nav)) lang = 'pt-BR';
    else {
      var p2 = nav.slice(0, 2).toLowerCase();
      lang = LANGS.some(function (l) { return l[0] === p2; }) ? p2 : 'zh-TW';
    }
  }

  var dict = (window.I18N_DICT && window.I18N_DICT[lang]) || null;

  window.I18N_LANG = lang;
  window.t = function (s) {
    if (!dict) return s;
    var v = dict[s];
    return v === undefined ? s : v;
  };

  /* 靜態 DOM 翻譯：文字節點（空白正規化後查表）＋ placeholder/title/aria-label ＋ <title> */
  function translateDom() {
    if (!dict) return;
    document.documentElement.lang = lang;
    if (dict[document.title]) document.title = dict[document.title];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var norm = raw.replace(/\s+/g, ' ').trim();
      if (!norm) continue;
      var tr = dict[norm];
      if (tr === undefined) continue;
      var m = raw.match(/^(\s*)[\s\S]*?(\s*)$/);
      node.nodeValue = m[1] + tr + m[2];
    }
    ['placeholder', 'title', 'aria-label'].forEach(function (attr) {
      var els = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < els.length; i++) {
        var v = els[i].getAttribute(attr);
        if (v && dict[v] !== undefined) els[i].setAttribute(attr, dict[v]);
      }
    });
  }

  /* 語言切換器（header 右側） */
  function addPicker() {
    var header = document.querySelector('.app-header');
    if (!header) return;
    var sel = document.createElement('select');
    sel.id = 'langSel';
    sel.className = 'lang-sel';
    sel.setAttribute('aria-label', 'Language');
    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l[0];
      o.textContent = l[1];
      if (l[0] === lang) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      try { localStorage.setItem('poker.lang', sel.value); } catch (e) {}
      location.reload();
    });
    header.appendChild(sel);
  }

  translateDom();
  addPicker();
})();
