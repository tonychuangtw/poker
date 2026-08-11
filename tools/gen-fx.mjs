/* 匯率表 data/fx.json —— App 端把賽程買入/保證換算成美金用。
   來源 open.er-api.com（免金鑰、每日更新就夠）。抓不到就保留舊檔，非致命。
   由 poker-tournaments-update.sh 每日呼叫；不用 AI。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'data', 'fx.json');
const WANT = ['USD', 'KRW', 'TWD', 'VND', 'PHP', 'JPY', 'EUR', 'GBP', 'CNY', 'HKD',
  'THB', 'MYR', 'SGD', 'AUD', 'CAD', 'KHR', 'INR', 'MOP', 'IDR', 'CZK', 'CHF'];

try {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (data.result !== 'success' || !data.rates) throw new Error('bad payload');
  const rates = {};
  for (const c of WANT) if (data.rates[c]) rates[c] = data.rates[c];
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), base: 'USD', rates }));
  console.log(`gen-fx: ${Object.keys(rates).length} currencies updated`);
} catch (e) {
  let old = null;
  try { old = JSON.parse(readFileSync(OUT, 'utf8')); } catch (e2) {}
  console.error(`gen-fx: fetch failed (${String(e).slice(0, 120)}), keeping ${old ? old.updated : 'nothing'}`);
}
