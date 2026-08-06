/* 版本戳：把 index.html / sw.js 內的靜態資源 URL 都掛上 ?v=<n>，並同步 SW cache 名稱。
   GitHub Pages 對 css/js 送 cache-control: max-age=600，沒有版本戳時剛部署完重整
   會拿到「新 JS + 舊 CSS」的混版畫面（2026-08-06 踩過）。每次要上線就跑一次：
     node tools/bump-version.mjs        # 自動 +1
     node tools/bump-version.mjs 30     # 指定版號 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const swPath = join(root, 'sw.js');
const htmlPath = join(root, 'index.html');

let sw = readFileSync(swPath, 'utf8');
const cur = Number((sw.match(/var CACHE = 'poker-v(\d+)'/) || [])[1]);
if (!cur) throw new Error('sw.js 找不到 CACHE 版號');
const next = Number(process.argv[2]) || cur + 1;

/* sw.js：cache 名稱 + ASSETS 內的相對路徑 */
sw = sw.replace(/var CACHE = 'poker-v\d+'/, `var CACHE = 'poker-v${next}'`);
sw = sw.replace(/'\.\/((?:css|js)\/[^'?]+|manifest\.json)(?:\?v=\d+)?'/g,
  (m, p) => `'./${p}?v=${next}'`);
writeFileSync(swPath, sw);

/* index.html：<link href> / <script src> */
let html = readFileSync(htmlPath, 'utf8');
html = html.replace(/(href|src)="((?:css|js)\/[^"?]+|manifest\.json)(?:\?v=\d+)?"/g,
  (m, attr, p) => `${attr}="${p}?v=${next}"`);
writeFileSync(htmlPath, html);

console.log(`版本戳 v${cur} → v${next}（index.html + sw.js 已更新）`);
