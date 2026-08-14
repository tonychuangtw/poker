/* 抽出所有含 CJK 的使用者可見字串：
   - index.html 的文字節點片段（> 與 < 之間）與 placeholder/title 屬性
   - js/*.js 的字串常值（'…' 與 "…"）
   輸出去重清單 JSON（zh-TW 為 canonical key）。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CJK = /[　-ヿ一-鿿＀-￯]/;
const keys = new Set();

/* ---- HTML ---- */
/* inline <script> 的程式碼不是使用者可見字串，先剝掉再掃文字節點 */
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '<script></script>');
for (const m of html.matchAll(/>([^<]+)</g)) {
  const norm = m[1].replace(/\s+/g, ' ').trim();
  if (norm && CJK.test(norm)) keys.add(norm);
}
for (const m of html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) {
  if (CJK.test(m[1])) keys.add(m[1]);
}
const title = html.match(/<title>([^<]+)<\/title>/);
if (title) keys.add(title[1]);

/* ---- JS ---- */
const files = ['app.js', 'training.js', 'pushfold.js', 'postflop.js', 'hands.js',
  'tracker-stats.js', 'ranges.js', 'native.js', 'equity.js', 'evaluator.js', 'icm.js', 'sync.js'];
for (const f of files) {
  const src = readFileSync(join(root, 'js', f), 'utf8');
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    if (!raw || !CJK.test(raw)) continue;
    keys.add(raw.replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
}

const list = [...keys].sort();
writeFileSync(join(root, 'tools', 'i18n-keys.json'), JSON.stringify(list, null, 1) + '\n');
console.log('keys:', list.length);
