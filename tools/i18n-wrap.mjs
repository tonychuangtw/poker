/* codemod：把 js 檔裡含 CJK 的字串常值包進 t(...)。
   跳過已包裹的、物件常值 key（後面緊跟冒號且前面是 { 或 ,）。跑完需人工 audit 比較運算。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CJK = /[　-ヿ一-鿿＀-￯]/;
const files = ['app.js', 'training.js', 'pushfold.js', 'postflop.js', 'hands.js',
  'tracker-stats.js', 'ranges.js', 'native.js', 'equity.js', 'evaluator.js', 'icm.js'];

for (const f of files) {
  const p = join(root, 'js', f);
  const src = readFileSync(p, 'utf8');
  let count = 0;
  const out = src.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, (lit, off) => {
    if (!CJK.test(lit)) return lit;
    const before = src.slice(Math.max(0, off - 2), off);
    if (before.endsWith('t(')) return lit;                    /* 已包裹 */
    const after = src.slice(off + lit.length).match(/^\s*:/); /* 可能是物件 key 或三元 */
    const prevCh = src.slice(0, off).trimEnd().slice(-1);
    if (after && (prevCh === '{' || prevCh === ',')) return lit; /* 物件 key，跳過 */
    count++;
    return 't(' + lit + ')';
  });
  writeFileSync(p, out);
  console.log(f, 'wrapped', count);
}
