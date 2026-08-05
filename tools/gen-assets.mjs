/* 產 app icon / splash 源圖（SVG → PNG，sharp 渲染），輸出到 assets/ 給 @capacitor/assets 用，
   並同步更新 PWA 的 icons/icon-192.png、icon-512.png，讓兩邊品牌一致。 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
mkdirSync(join(root, 'assets'), { recursive: true });

/* 金色黑桃，同 app 的 --gold-grad；背景同 --bg + 牌桌綠 radial glow */
const spadePath = `M512 200
  C 570 310, 792 424, 792 590
  C 792 686, 716 732, 650 732
  C 597 732, 557 700, 539 652
  C 545 742, 566 792, 606 838
  L 418 838
  C 458 792, 479 742, 485 652
  C 467 700, 427 732, 374 732
  C 308 732, 232 686, 232 590
  C 232 424, 454 310, 512 200 Z`;

function svg(size, { pad = 0, glowScale = 1 } = {}) {
  const s = size / 1024;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4e3b2"/>
      <stop offset="0.45" stop-color="#e8c87e"/>
      <stop offset="0.75" stop-color="#d4af6a"/>
      <stop offset="1" stop-color="#9c7a3e"/>
    </linearGradient>
    <radialGradient id="felt" cx="0.5" cy="0.28" r="${0.9 * glowScale}">
      <stop offset="0" stop-color="#184230" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#184230" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="#0b0e0d"/>
  <rect width="1024" height="1024" fill="url(#felt)"/>
  <g transform="translate(512 512) scale(${1 - pad}) translate(-512 -512)">
    <path d="${spadePath}" fill="url(#gold)"/>
    <path d="${spadePath}" fill="none" stroke="#f4e3b2" stroke-opacity="0.35" stroke-width="6"/>
  </g>
</svg>`);
}

/* icon：滿版；splash：置中小 logo（外圍大量深色留白） */
await sharp(svg(1024)).png().toFile(join(root, 'assets', 'icon-only.png'));
await sharp(svg(1024)).png().toFile(join(root, 'assets', 'icon-foreground.png'));
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#0b0e0d' } })
  .composite([{ input: await sharp(svg(760, { glowScale: 1.6 })).png().toBuffer(), gravity: 'centre' }])
  .png().toFile(join(root, 'assets', 'splash-dark.png'));
await sharp(join(root, 'assets', 'splash-dark.png')).toFile(join(root, 'assets', 'splash.png'));

/* PWA icons 同步換裝 */
await sharp(svg(512)).png().toFile(join(root, 'icons', 'icon-512.png'));
await sharp(svg(192)).png().toFile(join(root, 'icons', 'icon-192.png'));

console.log('assets generated');
