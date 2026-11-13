import { hashString, escapeXml, validColor } from './util.js';

const palettes = [
  ['#06110f', '#0d2a24', '#4ef2c2'],
  ['#050d13', '#10283e', '#53b9ff'],
  ['#0b0a14', '#282045', '#a98bff'],
  ['#080f10', '#163c3b', '#ffb65c'],
  ['#07100c', '#17351f', '#a6ff6e'],
  ['#0d0a0a', '#3b211e', '#ff8a6b'],
];

function numbers(seed) {
  const bytes = hashString(seed);
  return Array.from({ length: 12 }, (_, index) => bytes[index] / 255);
}

export function coverSvg(article, settings = {}, category = {}) {
  const n = numbers(`${article.id}:${article.title}`);
  const palette = palettes[Math.floor(n[0] * palettes.length)];
  const accent = validColor(settings.accent, palette[2]);
  const issue = String(1 + Math.floor(n[1] * 96)).padStart(2, '0');
  const label = escapeXml((category.name || '档案').slice(0, 8));
  const name = escapeXml((settings.siteName || '开源栈').slice(0, 8));
  const x1 = 90 + Math.round(n[2] * 240);
  const x2 = 290 + Math.round(n[3] * 180);
  const y1 = 40 + Math.round(n[4] * 150);
  const y2 = 170 + Math.round(n[5] * 100);
  const rotate = Math.round(-18 + n[6] * 36);
  const radius = 70 + Math.round(n[7] * 90);
  const dash = 6 + Math.round(n[8] * 12);
  const block = 26 + Math.round(n[9] * 28);
  const opacity = (0.12 + n[10] * 0.18).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 405" role="img" aria-label="${label}抽象封面">
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="${accent}" stroke-opacity="0.12" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="30%" cy="28%" r="72%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${palette[0]}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="frame"><rect width="720" height="405" rx="2"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="720" height="405" fill="${palette[0]}"/>
    <rect width="720" height="405" fill="url(#glow)"/>
    <rect width="720" height="405" fill="url(#grid)"/>
    <circle cx="${x1}" cy="${y1}" r="${radius}" fill="${accent}" fill-opacity="${opacity}"/>
    <circle cx="${x1}" cy="${y1}" r="${radius * 0.54}" fill="none" stroke="${accent}" stroke-width="1" stroke-opacity="0.45"/>
    <circle cx="${x2}" cy="${y2}" r="${radius * 0.7}" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="${dash} ${dash + 4}" stroke-opacity="0.55"/>
    <g transform="rotate(${rotate} ${x1} ${y1 + 60})">
      <rect x="${x1 - 150}" y="${y1 + 10}" width="300" height="${block}" fill="${palette[1]}" fill-opacity="0.92"/>
      <rect x="${x1 - 105}" y="${y1 + 10 + block}" width="210" height="${block / 2}" fill="${accent}" fill-opacity="0.78"/>
    </g>
    <path d="M 0 ${300 + Math.round(n[11] * 50)} Q 180 ${210 + Math.round(n[2] * 90)} 360 ${300} T 720 ${260}" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="2"/>
    <rect x="24" y="24" width="672" height="357" fill="none" stroke="${accent}" stroke-opacity="0.22"/>
    <text x="48" y="68" fill="${accent}" font-family="'Cascadia Mono', Consolas, monospace" font-size="14" letter-spacing="4">${name}</text>
    <text x="48" y="344" fill="${accent}" font-family="Georgia, serif" font-size="58" font-weight="700" opacity="0.92">${issue}</text>
    <text x="48" y="370" fill="${palette[2]}" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" letter-spacing="3" opacity="0.82">FIELD NOTE / ${label}</text>
    <text x="672" y="68" text-anchor="end" fill="${palette[2]}" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" font-weight="700" letter-spacing="2">OPEN SOURCE ARCHIVE</text>
  </g>
</svg>`;
}
