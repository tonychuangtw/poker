/* 賽程表內容多語翻譯（事件名與 notes → 各語系），寫 data/schedules-i18n/<lang>.json。
   跟 gen-events-i18n.mjs 同一套路：haiku、增量、每次執行最多 3 個 claude 呼叫
   （每呼叫翻一組 3–4 個語言）、無缺漏 0 呼叫；跑 `--backfill` 則反覆跑到補完
   （首次建置用）。賽程原文多為英文，所以 zh-TW 也要翻；en 不建表（App 端
   查不到就 fallback 原文）。由 poker-tournaments-update.sh 在 sync-schedules
   之後呼叫（cwd = repo root）。 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { claudeChildEnv } from './claude-child-env.mjs';

const LANGS = ['zh-TW', 'zh-CN', 'ja', 'ko', 'es', 'pt-BR', 'fr', 'de', 'ru', 'vi', 'th'];
const GROUPS = [['zh-TW', 'zh-CN', 'ja', 'ko'], ['es', 'pt-BR', 'fr', 'de'], ['ru', 'vi', 'th']];
const BATCH = 120;          // 每輪最多翻的字串數（事件名很短，一次可以多塞）
const backfill = process.argv.includes('--backfill');

const SRC = 'data/schedules';
const OUTDIR = 'data/schedules-i18n';
mkdirSync(OUTDIR, { recursive: true });

/* 要翻的字串：全部賽程檔的事件名 + notes */
const wanted = new Set();
if (existsSync(SRC)) {
  for (const f of readdirSync(SRC).filter((x) => x.endsWith('.json'))) {
    const sc = JSON.parse(readFileSync(`${SRC}/${f}`, 'utf8'));
    for (const d of sc.days || []) for (const e of d.events || []) if (e.name) wanted.add(e.name);
    const notes = Array.isArray(sc.notes) ? sc.notes : (sc.notes ? [sc.notes] : []);
    for (const n of notes) if (typeof n === 'string') wanted.add(n);
  }
}

const db = {};
for (const l of LANGS) {
  try { db[l] = JSON.parse(readFileSync(`${OUTDIR}/${l}.json`, 'utf8')); } catch (e) { db[l] = {}; }
  for (const k of Object.keys(db[l])) if (!wanted.has(k)) delete db[l][k];  // 修剪過期 key
}

function save() { for (const l of LANGS) writeFileSync(`${OUTDIR}/${l}.json`, JSON.stringify(db[l])); }

function missingKeys() {
  return [...wanted].filter((k) => LANGS.some((l) => db[l][k] === undefined));
}

let round = 0;
do {
  const missing = missingKeys();
  if (!missing.length) break;
  const batch = missing.slice(0, BATCH);
  console.log(`schedules-i18n: round ${++round}, translating ${batch.length}/${missing.length} keys`);
  for (const group of GROUPS) {
    const groupMissing = batch.filter((k) => group.some((l) => db[l][k] === undefined));
    if (!groupMissing.length) continue;
    const prompt = `把下面 JSON 陣列裡的德州撲克賽程項目名稱（多為英文）翻譯成這些語言：${group.join(', ')}。
輸出純 JSON、不要 markdown code fence、不要任何其他文字：{"<語言代碼>": {"原文": "譯文", ...}, ...}
每個語言的表都要涵蓋陣列裡全部字串。規則：
- 編號（#12、#H3、Day 1A、Flight B 這類代碼）與金額數字保留原樣
- 品牌與專有名詞（WSOP、WPT、APT、NLH、PLO、Main Event 等撲克圈通用詞）依該語言撲克圈慣例，
  慣用英文就保留英文，有慣用譯名才翻（例：zh 的「主賽事」「豪客賽」「神秘賞金」）
- 一般字詞（Kick-Off、Ladies、Seniors、Turbo、Satellite…）翻成該語言的自然說法
- 若整串在該語言最自然的呈現就是原文，原樣返回即可
- zh-TW 用台灣撲克用語、zh-CN 用大陸用語；ja 術語用片假名；ko 用韓文外來語
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
      console.error(`schedules-i18n: group [${group.join(',')}] failed: ${String(e).slice(0, 200)}`);
    }
  }
  save();
} while (backfill && round < 40);

save();
console.log(`schedules-i18n: done, ${missingKeys().length} keys still missing${backfill ? '' : ' (picked up next run)'}`);
