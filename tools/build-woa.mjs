/* 由 tools/woa-src/guide.json 產生 woa.html（WizardOfAhhs CAP 指南）。
   英文內容直接嵌在頁面裡；其他語系放 data/woa/<lang>.json，切語言時才抓，
   所以第一次載入不會被 12 份翻譯拖慢。改內容或改版型都是改這支再重跑：
     node tools/build-woa.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const blocks = JSON.parse(readFileSync(join(root, 'tools/woa-src/guide.json'), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const CHARTS = [
  ['OverallPreflop.png', 'Overall Preflop'],
  ['PreflopRaisingRange.png', 'Preflop Raising Range'],
  ['HandRanges.png', 'Hand Ranges'],
  ['3betRanges.png', '3bet Ranges'],
  ['ShoveIt.png', 'Shove It'],
  ['SBOpenShove.png', 'SB Open Shove'],
  ['BBOpenShove.png', 'BB Open Shove']
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let html = '';
let toc = '';
let openList = false;
let openSection = false;

function closeList() { if (openList) { html += '  </ul>\n'; openList = false; } }
function closeSection() { closeList(); if (openSection) { html += '</div>\n\n'; openSection = false; } }

blocks.forEach((b, i) => {
  if (b.t === 'h2') {
    closeSection();
    const id = slug(b.x);
    toc += `    <a href="#${id}">${esc(b.x)}</a>\n`;
    html += `<div class="card sec" id="${id}">\n  <h2 data-i="${i}">${esc(b.x)}</h2>\n`;
    openSection = true;
    return;
  }
  if (!openSection) { html += '<div class="card sec">\n'; openSection = true; }
  if (b.t === 'h3') { closeList(); html += `  <h3 data-i="${i}">${esc(b.x)}</h3>\n`; return; }
  if (b.t === 'li') {
    if (!openList) { html += '  <ul class="woa-list">\n'; openList = true; }
    html += `    <li data-i="${i}">${esc(b.x)}</li>\n`;
    return;
  }
  if (b.t === 'p') { closeList(); html += `  <p data-i="${i}">${esc(b.x)}</p>\n`; return; }
  if (b.t === 'img') {
    closeList();
    html += `  <figure class="woa-shot"><img src="assets/woa/${b.src}" alt="" loading="lazy"></figure>\n`;
    return;
  }
  if (b.t === 'table') {
    closeList();
    html += '  <div class="stats-table-wrap">\n    <table class="stats-table woa-table">\n';
    b.rows.forEach((row, r) => {
      html += '      <tr>' + row.map((c) => (r === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('') + '</tr>\n';
    });
    html += '    </table>\n  </div>\n';
  }
});
closeSection();

/* 圖表獨立一段，內文提到檔名的地方由前端自動連過來 */
toc += '    <a href="#charts">Charts</a>\n';
html += '<div class="card sec" id="charts">\n  <h2>Charts</h2>\n';
CHARTS.forEach(([file, name]) => {
  html += `  <figure class="woa-chart" id="chart-${file.replace('.png', '')}">\n` +
          `    <figcaption>${esc(name)}</figcaption>\n` +
          `    <a href="assets/woa/${file}" target="_blank" rel="noopener">` +
          `<img src="assets/woa/${file}" alt="${esc(name)}" loading="lazy"></a>\n  </figure>\n`;
});
html += '</div>\n';

const LANGS = [
  ['en', 'English'], ['zh-TW', '繁體中文'], ['zh-CN', '简体中文'], ['ja', '日本語'],
  ['ko', '한국어'], ['es', 'Español'], ['pt-BR', 'Português'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['ru', 'Русский'], ['vi', 'Tiếng Việt'], ['th', 'ไทย']
];

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0b0e0d">
<meta name="robots" content="noindex, nofollow">
<title>WizardOfAhhs CAP Guide</title>
<link rel="stylesheet" href="css/style.css">
<style>
  main { max-width: 820px; padding-bottom: 60px; }
  .lead { color: var(--muted); font-size: .86rem; line-height: 1.7; }
  .toc { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .toc a {
    padding: 6px 11px; border-radius: 999px; text-decoration: none; font-size: .74rem;
    background: rgba(var(--accent-rgb), .07); color: var(--accent2);
    border: 1px solid rgba(var(--accent-rgb), .28);
  }
  .toc a:hover { background: rgba(var(--accent-rgb), .16); }
  .sec h2 { font-size: .82rem; }
  .sec h3 {
    margin: 18px 0 6px; font-size: .88rem; color: var(--accent2); font-weight: 700;
  }
  .sec p { font-size: .89rem; line-height: 1.75; margin: 8px 0; }
  .woa-list { margin: 8px 0; padding-left: 0; list-style: none; }
  .woa-list li {
    position: relative; padding: 4px 0 4px 18px;
    font-size: .89rem; line-height: 1.7;
  }
  .woa-list li::before {
    content: ""; position: absolute; left: 4px; top: 13px;
    width: 5px; height: 5px; border-radius: 50%; background: rgba(var(--accent-rgb), .65);
  }
  .woa-shot, .woa-chart { margin: 14px 0; text-align: center; }
  .woa-shot img, .woa-chart img {
    max-width: 100%; height: auto; border-radius: 10px;
    border: 1px solid var(--border-soft); background: #fff;
  }
  .woa-chart figcaption {
    margin-bottom: 6px; color: var(--accent); font-size: .78rem;
    letter-spacing: .1em; font-weight: 600;
  }
  .woa-table th { font-size: .78rem; }
  .woa-table td { font-size: .82rem; }
  .lang-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .lang-bar button {
    padding: 6px 12px; border-radius: 999px; cursor: pointer; font-family: inherit; font-size: .76rem;
    background: rgba(var(--accent-rgb), .07); color: var(--accent2);
    border: 1px solid rgba(var(--accent-rgb), .28);
  }
  .lang-bar button.on { background: var(--gold-grad); color: var(--on-accent); border-color: transparent; }
  .lang-bar button[disabled] { opacity: .45; cursor: default; }
  .tr-note {
    margin-top: 10px; padding: 8px 11px; border-radius: var(--radius-sm);
    background: rgba(var(--accent-rgb), .07); color: var(--muted);
    font-size: .78rem; line-height: 1.6;
  }
  .doc-foot { text-align: center; color: var(--muted); font-size: .76rem; margin-top: 24px; }
  .doc-foot a { color: var(--accent2); }
  a.chart-link { color: var(--accent2); text-decoration: none; border-bottom: 1px dotted currentColor; }
</style>
</head>
<body>
<header class="app-header">
  <h1>♠ WizardOfAhhs CAP Guide</h1>
</header>

<main>
<div class="card">
  <p class="lead" id="intro">
    2011 年的 PokerStars CAP（封頂）現金桌打法指南，作者 Wizard of Ahhs（themortalnuts.com）。
    這頁只是把原始 Word 檔重新排版並附上原檔的圖表，內容與數字沒有更動。
  </p>
  <div class="lang-bar" id="langBar">
${LANGS.map(([c, n]) => `    <button type="button" data-lang="${c}">${n}</button>`).join('\n')}
  </div>
  <p class="tr-note" id="trNote"></p>
  <div class="toc">
${toc}  </div>
</div>

${html}
<p class="doc-foot">
  Content © Wizard of Ahhs (2011) · 排版整理：撲克工具箱<br>
  <a href="./">← 回到撲克工具箱</a>
</p>
</main>

<script>
(function () {
  var NOTE = {
    en: '',
    'zh-TW': '中文為機器翻譯，專有名詞保留英文；有疑義請對照 English 原文。',
    'zh-CN': '中文为机器翻译，专有名词保留英文；有疑义请对照 English 原文。',
    other: 'Machine translation — poker terms kept in English. Check the English original if in doubt.'
  };
  var cache = {}, cur = 'en';
  var base = {};
  document.querySelectorAll('[data-i]').forEach(function (el) { base[el.dataset.i] = el.textContent; });

  /* 內文提到圖表檔名時，自動連到下面的圖 */
  function linkCharts(el) {
    if (el.children.length) return;
    var t = el.textContent;
    if (!/[A-Za-z0-9]+\\.png/.test(t)) return;
    el.innerHTML = t.replace(/([A-Za-z0-9]+)\\.png/g, function (m, name) {
      return '<a class="chart-link" href="#chart-' + name + '">' + m + '</a>';
    });
  }

  function apply(dict) {
    document.querySelectorAll('[data-i]').forEach(function (el) {
      var v = dict && dict[el.dataset.i];
      el.textContent = v || base[el.dataset.i];
      linkCharts(el);
    });
  }

  function note(lang) {
    var n = NOTE[lang] !== undefined ? NOTE[lang] : NOTE.other;
    var box = document.getElementById('trNote');
    box.textContent = n;
    box.style.display = n ? '' : 'none';
  }

  function setLang(lang) {
    document.querySelectorAll('#langBar button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.lang === lang);
    });
    document.documentElement.lang = lang;
    cur = lang;
    try { localStorage.setItem('poker.woaLang', lang); } catch (e) {}
    if (lang === 'en') { apply(null); note('en'); return; }
    if (cache[lang]) { apply(cache[lang]); note(lang); return; }
    fetch('data/woa/' + lang + '.json')
      .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
      .then(function (d) { cache[lang] = d; if (cur === lang) { apply(d); note(lang); } })
      .catch(function () {
        var b = document.querySelector('#langBar button[data-lang="' + lang + '"]');
        if (b) { b.disabled = true; b.title = 'not translated yet'; }
        setLang('en');
      });
  }

  document.querySelectorAll('#langBar button').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.dataset.lang); });
  });

  var start = 'en';
  try { start = localStorage.getItem('poker.woaLang') || localStorage.getItem('poker.lang') || navigator.language || 'en'; } catch (e) {}
  if (!document.querySelector('#langBar button[data-lang="' + start + '"]')) {
    start = /^zh/i.test(start) ? 'zh-TW' : (start || 'en').slice(0, 2);
    if (!document.querySelector('#langBar button[data-lang="' + start + '"]')) start = 'en';
  }
  apply(null);
  setLang(start);
})();
</script>
</body>
</html>
`;

writeFileSync(join(root, 'woa.html'), page);
console.log('woa.html written —', blocks.length, 'blocks,',
  blocks.filter((b) => b.x).length, 'translatable strings');
