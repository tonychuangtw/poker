/* 把 WizardOfAhhs CAP 指南翻成各語系 → data/woa/<lang>.json
   用 haiku（省額度鐵律：這種大量機械翻譯不要用 opus）。
   逐 chunk 呼叫，已存在的語系檔會跳過，可以中斷後再跑。
     node tools/woa-translate.mjs zh-TW ja        # 指定語系
     node tools/woa-translate.mjs                 # 全部 11 種 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeChildEnv } from './claude-child-env.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const blocks = JSON.parse(readFileSync(join(root, 'tools/woa-src/guide.json'), 'utf8'));
const strings = blocks.map((b, i) => (b.x ? { i, x: b.x } : null)).filter(Boolean);

const NAMES = {
  'zh-TW': '繁體中文', 'zh-CN': '简体中文', ja: '日本語', ko: '한국어', es: 'Español',
  'pt-BR': 'Português do Brasil', fr: 'Français', de: 'Deutsch', ru: 'Русский',
  vi: 'Tiếng Việt', th: 'ไทย'
};
const CHUNK = 30;
const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(NAMES);

function translate(lang, items) {
  const payload = items.map((s) => `${s.i}\t${s.x}`).join('\n');
  const prompt = `Translate this poker strategy guide into ${NAMES[lang]}.

Rules:
- Input is one item per line: an ID, a TAB, then English text.
- Output one item per line in the same format: the SAME ID, a TAB, then the translation. Nothing else.
- Keep every ID and keep the original order. Do not merge, split, drop or add lines.
- Keep poker jargon and abbreviations in English: 3bet, 4bet, cbet, CO, BTN, SB, BB, HJ, UTG, VPIP, PFR, HUD, NIT, TAG, LAG, ISO, SPR, EV, bb/100, hand notation like AQ+, KJs, 22-99, and all chart file names.
- Keep numbers, percentages and stack sizes exactly as written.
- Natural, concise wording a poker player would use. No commentary.

${payload}`;
  // env 一定要用 claudeChildEnv()：不清掉 TELEGRAM_STATE_DIR 的話，這個子程序會
  // 把 telegram plugin 叫起來搶同一顆 bot token，整條線變聾（見 claude-child-env.mjs）
  const out = execFileSync('claude', ['--print', '--model', 'haiku'], {
    input: prompt, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, env: claudeChildEnv()
  });
  const map = {};
  out.split('\n').forEach((line) => {
    const m = line.match(/^\s*(\d+)\t([\s\S]*)$/);
    if (m) map[+m[1]] = m[2].trim();
  });
  return map;
}

mkdirSync(join(root, 'data/woa'), { recursive: true });
for (const lang of langs) {
  const file = join(root, 'data/woa', lang + '.json');
  if (existsSync(file)) { console.log(lang, '已存在，跳過'); continue; }
  const result = {};
  for (let i = 0; i < strings.length; i += CHUNK) {
    const part = strings.slice(i, i + CHUNK);
    let got = {};
    for (let attempt = 0; attempt < 2 && Object.keys(got).length < part.length; attempt++) {
      try { got = translate(lang, part); } catch (e) { console.error(lang, 'chunk', i, e.message); }
    }
    Object.assign(result, got);
    console.log(`${lang}  ${Object.keys(result).length}/${strings.length}`);
  }
  const missing = strings.filter((s) => !result[s.i]).length;
  writeFileSync(file, JSON.stringify(result));
  console.log(`${lang} 完成，缺 ${missing} 條`);
}
