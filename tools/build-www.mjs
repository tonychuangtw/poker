/* 把 PWA 靜態檔複製到 www/（Capacitor webDir）。
   sw.js 刻意不複製：原生殼內離線由 app bundle 本身負責，SW 只留給瀏覽器版。 */
import { cpSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const dir of ['css', 'js', 'data', 'icons']) {
  cpSync(join(root, dir), join(out, dir), { recursive: true });
}
for (const f of ['index.html', 'manifest.json']) {
  copyFileSync(join(root, f), join(out, f));
}

console.log('www/ built');
