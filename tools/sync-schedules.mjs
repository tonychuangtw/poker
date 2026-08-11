/* 把 scout 抓的逐場賽程（claude-shared/projects/poker/data/schedules/*.json）
   同步進本 repo data/schedules/，並在 data/tournaments.json 的對應賽事寫入
   "schedule": "<slug>" 讓 App 端點卡片開賽程表。純比對邏輯，不用 AI。

   配對規則：賽程檔的日期範圍必須跟賽事的 start/end 重疊（±3 天），再取
   系列名 token 重疊分數最高者 —— 這樣過期的舊系列檔（如 tmt-20）不會誤連
   到同名的新一屆賽事。沒配到的賽程檔不同步（多半是已結束的系列）。

   由 poker-tournaments-update.sh 在每日改寫 tournaments.json 之後呼叫
   （haiku 重寫會丟掉 schedule 欄位，所以這支要排在它後面重新補上）。 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = process.env.SCHEDULES_SRC ||
  join(process.env.HOME || '/home/tony', 'TelegramClaude/claude-shared/projects/poker/data/schedules');
const OUT = join(root, 'data', 'schedules');

function tokens(s) {
  return new Set(String(s || '').toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w && w !== '2026' && w !== '2027'));
}
/* Jaccard：分母用聯集，讓「WSOP Circuit Estonia」對「WSOP Circuit Slovakia」
   這種只差站名的組合拿不到高分（2/4=0.5 < 門檻） */
function overlapScore(a, b) {
  const ta = tokens(a), tb = tokens(b);
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.max(1, ta.size + tb.size - hit);
}
function shift(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const tourPath = join(root, 'data', 'tournaments.json');
const tour = JSON.parse(readFileSync(tourPath, 'utf8'));

const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith('.json')) : [];
mkdirSync(OUT, { recursive: true });

const kept = new Set();
let linked = 0;
for (const ev of tour.events) delete ev.schedule;

/* 先收集所有候選 (檔, 賽事, 分數)，再全域由高分到低分貪婪配對 ——
   避免先處理到的檔案搶走別人的賽事（estonia 檔搶 slovakia 賽事事故） */
const cands = [];
const parsed = new Map();
for (const f of files) {
  let sc;
  try { sc = JSON.parse(readFileSync(join(SRC, f), 'utf8')); } catch (e) { continue; }
  const days = (sc.days || []).filter((d) => d.date && (d.events || []).length);
  const total = days.reduce((n, d) => n + d.events.length, 0);
  if (total < 3 || sc.status === 'schedule-unpublished') continue;
  parsed.set(f, { sc, days });

  const dates = days.map((d) => d.date).sort();
  const first = dates[0], last = dates[dates.length - 1];
  for (const ev of tour.events) {
    if (!ev.start) continue;
    if (shift(ev.start, -3) > last || (ev.end && shift(ev.end, 3) < first)) continue;
    const s = overlapScore(sc.series, ev.series);
    if (s >= 0.6) cands.push({ f, ev, s });
  }
}
cands.sort((a, b) => b.s - a.s);
const usedFile = new Set(), usedEv = new Set();
for (const c of cands) {
  if (usedFile.has(c.f) || usedEv.has(c.ev)) continue;
  usedFile.add(c.f); usedEv.add(c.ev);
  const { sc, days } = parsed.get(c.f);
  const slug = basename(c.f, '.json');
  c.ev.schedule = slug;
  linked++;
  kept.add(slug + '.json');
  /* source 是給機器看的英文長文，App 用不到，不帶進站台 */
  writeFileSync(join(OUT, slug + '.json'), JSON.stringify({
    series: sc.series, venue: sc.venue, currency: sc.currency,
    updated: sc.updated, notes: sc.notes || undefined, days
  }));
}
for (const f of parsed.keys()) {
  if (!usedFile.has(f)) console.log(`sync-schedules: no match for ${f} (${parsed.get(f).sc.series})`);
}

/* 清掉已經沒有賽事對到的舊賽程檔 */
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.json') && !kept.has(f)) unlinkSync(join(OUT, f));
}

writeFileSync(tourPath, JSON.stringify(tour, null, 2) + '\n');
console.log(`sync-schedules: linked ${linked}/${files.length} schedule files`);
