/* 每日增量補翻賽事資料（city/note → 11 語），寫 data/tournaments-i18n.json。
   由 poker-tournaments-update.sh 在改寫 tournaments.json 之後呼叫（cwd = repo root）。
   省額度：haiku、最多 3 個 claude 呼叫（每呼叫翻 3–4 個語言）、無缺漏時 0 呼叫、
   單次最多補 60 條（其餘隔日輪到）。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { claudeChildEnv } from './claude-child-env.mjs';

const LANGS = ['zh-CN', 'en', 'ja', 'ko', 'es', 'pt-BR', 'fr', 'de', 'ru', 'vi', 'th'];
const GROUPS = [['zh-CN', 'en', 'ja', 'ko'], ['es', 'pt-BR', 'fr', 'de'], ['ru', 'vi', 'th']];

const data = JSON.parse(readFileSync('data/tournaments.json', 'utf8'));
const wanted = new Set();
data.events.forEach((e) => { if (e.city) wanted.add(e.city); if (e.note) wanted.add(e.note); });

let db = {};
try { db = JSON.parse(readFileSync('data/tournaments-i18n.json', 'utf8')); } catch (e) {}
for (const l of LANGS) db[l] = db[l] || {};

/* 修剪已不在資料檔裡的 key，避免檔案無限長大 */
for (const l of LANGS) {
  for (const k of Object.keys(db[l])) if (!wanted.has(k)) delete db[l][k];
}

const missing = [...wanted].filter((k) => LANGS.some((l) => db[l][k] === undefined));
if (!missing.length) {
  writeFileSync('data/tournaments-i18n.json', JSON.stringify(db));
  console.log('events-i18n: no missing keys');
  process.exit(0);
}

const batch = missing.slice(0, 60);
console.log(`events-i18n: translating ${batch.length}/${missing.length} missing keys`);

for (const group of GROUPS) {
  const groupMissing = batch.filter((k) => group.some((l) => db[l][k] === undefined));
  if (!groupMissing.length) continue;
  const prompt = `把下面 JSON 陣列裡的繁體中文字串（德州撲克賽事的城市名與賽事說明）翻譯成這些語言：${group.join(', ')}。
輸出純 JSON、不要 markdown code fence、不要任何其他文字：{"<語言代碼>": {"原文": "譯文", ...}, ...}
每個語言的表都要涵蓋陣列裡全部字串。系列名/場館名/Main Event 等專有名詞與數字金額保留原樣；
zh-CN 用大陸撲克用語；ja 撲克術語用片假名；ko 用韓文外來語；th 用泰文。
${JSON.stringify(groupMissing)}`;
  try {
    const out = execFileSync('claude',
      ['--print', '--model', 'haiku', '--dangerously-skip-permissions', prompt],
      // env: 見 claude-child-env.mjs —— 不清掉 TELEGRAM_STATE_DIR 會搶走該線的 bot token
      { encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024, env: claudeChildEnv() });
    const jsonStr = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
    const res = JSON.parse(jsonStr);
    for (const l of group) {
      if (!res[l]) continue;
      for (const [k, v] of Object.entries(res[l])) {
        if (wanted.has(k) && typeof v === 'string' && v) db[l][k] = v;
      }
    }
  } catch (e) {
    console.error(`events-i18n: group [${group.join(',')}] failed: ${String(e).slice(0, 200)}`);
  }
}

writeFileSync('data/tournaments-i18n.json', JSON.stringify(db));
const left = [...wanted].filter((k) => LANGS.some((l) => db[l][k] === undefined)).length;
console.log(`events-i18n: done, ${left} keys still missing (picked up next run)`);
