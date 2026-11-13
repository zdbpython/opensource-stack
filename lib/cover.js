import { hashString, escapeXml, validColor } from './util.js';

const palettes = [
  ['#f0e8d8', '#203a35', '#c84b2f'],
  ['#e4ece7', '#1d3b4a', '#d9893c'],
  ['#eee6e8', '#493047', '#2f766b'],
  ['#e9e5dc', '#34352e', '#b85b32'],
  ['#e5e9ef', '#2a4059', '#c8784f'],
  ['#ede8df', '#3b3b32', '#527c6e'],
];

function numbers(seed) {
  const bytes = hashString(seed);
  return Array.from({ length: 12 }, (_, index) => bytes[index] / 255);
}

export function coverSvg(article, settings = {}, category = {}) {
  const n = numbers(`${article.id}:${article.title}`);
  const palette = palettes[Math.floor(n[0] * palettes.length)];
  const accent = validColor(settings.accent, palette[2]);
  const issue = String(1 + Math.floor(n[1] * 48)).padStart(2, '0');
  const label = escapeXml((category.name || '档案').slice(0, 8));
  const name = escapeXml((settings.siteName || '格物志').slice(0, 8));
  const x1 = 90 + Math.round(n[2] * 240);
  const x2 = 290 + Math.round(n[3] * 180);
  const y1 = 40 + Math.round(n[4] * 150);
  const y2 = 170 + Math.round(n[5] * 100);
  const rotate = Math.round(-18 + n[6] * 36);
  const radius = 70 + Math.round(n[7] * 90);
  const dash = 6 + Math.round(n[8] * 12);
  const block = 26 + Math.round(n[9] * 28);
  const opacity = (0.18 + n[10] * 0.22).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 405" role="img" aria-label="${label}抽象封面">
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="${palette[1]}" stroke-opacity="0.10" stroke-width="1"/>
    </pattern>
    <clipPath id="frame"><rect width="720" height="405" rx="2"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="720" height="405" fill="${palette[0]}"/>
    <rect width="720" height="405" fill="url(#grid)"/>
    <circle cx="${x1}" cy="${y1}" r="${radius}" fill="${accent}" fill-opacity="${opacity}"/>
    <circle cx="${x2}" cy="${y2}" r="${radius * 0.7}" fill="none" stroke="${palette[1]}" stroke-width="2" stroke-dasharray="${dash} ${dash + 4}"/>
    <g transform="rotate(${rotate} ${x1} ${y1 + 60})">
      <rect x="${x1 - 150}" y="${y1 + 10}" width="300" height="${block}" fill="${palette[1]}" fill-opacity="0.88"/>
      <rect x="${x1 - 105}" y="${y1 + 10 + block}" width="210" height="${block / 2}" fill="${accent}"/>
    </g>
    <path d="M 0 ${300 + Math.round(n[11] * 50)} Q 180 ${210 + Math.round(n[2] * 90)} 360 ${300} T 720 ${260}" fill="none" stroke="${palette[1]}" stroke-opacity="0.35" stroke-width="2"/>
    <rect x="24" y="24" width="672" height="357" fill="none" stroke="${palette[1]}" stroke-opacity="0.28"/>
    <text x="48" y="68" fill="${palette[1]}" font-family="Georgia, 'Songti SC', serif" font-size="19" letter-spacing="4">${name}</text>
    <text x="48" y="344" fill="${palette[1]}" font-family="Georgia, serif" font-size="58" font-weight="700" opacity="0.88">${issue}</text>
    <text x="48" y="370" fill="${palette[1]}" font-family="'Bahnschrift', sans-serif" font-size="13" letter-spacing="3" opacity="0.72">FIELD NOTE / ${label}</text>
    <text x="672" y="68" text-anchor="end" fill="${accent}" font-family="'Bahnschrift', sans-serif" font-size="14" font-weight="700" letter-spacing="2">ORIGINAL ARCHIVE</text>
  </g>
</svg>`;
}
