// Social preview image (1200×630) for each model page, rendered at build time.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import models from '../../data/models.json';
import { flagFor } from '../../lib/flags';

const PUBLIC = join(process.env.PIPERHUB_ROOT || process.cwd(), 'public');
const dataUri = (file: string, type: string) => `data:${type};base64,${readFileSync(file).toString('base64')}`;
const LOGO = dataUri(join(PUBLIC, 'brand', 'logo.png'), 'image/png');
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const QUALITY: Record<string, [string, string]> = { high: ['High quality', '#5fbf5a'], medium: ['Medium quality', '#f5c542'], low: ['Low quality', '#e5484d'] };
const FONT = "'Segoe UI', 'Helvetica Neue', 'DejaVu Sans', Arial, sans-serif";

export function getStaticPaths() {
  return models.filter((m) => m.usable || m.piperPlus).map((m) => ({ params: { slug: m.slug }, props: { m } }));
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].replace(/.{0,2}$/, '…'); }
  return lines;
}

export async function GET({ props }: { props: { m: any } }) {
  const m = props.m;
  const hue = m.avatar?.hue ?? 220;
  const name = m.name.replace(/\s+(?:x[_\s]?)?(?:high|medium|low|unknown)$/i, '');
  const lines = wrap(name, 26);
  const flag = flagFor(m.lang);
  const flagFile = flag ? join(PUBLIC, 'flags', `${flag}.svg`) : '';
  const icon = m.avatar?.icon && existsSync(join(PUBLIC, m.avatar.icon)) ? dataUri(join(PUBLIC, m.avatar.icon), 'image/svg+xml') : '';
  const [qLabel, qColor] = QUALITY[m.quality] || ['', ''];
  const speakers = m.voices > 1 ? `${m.voices} speakers` : '1 speaker';
  const langLabel = m.langName && m.langName.length > 3 ? m.langName : m.lang.toUpperCase();
  const titleY = lines.length > 1 ? 300 : 340;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="0.85" cy="0.15" r="0.9"><stop offset="0" stop-color="hsl(${hue},70%,45%)" stop-opacity=".35"/><stop offset="1" stop-color="#0a0a0a" stop-opacity="0"/></radialGradient>
    <clipPath id="av"><rect x="80" y="${titleY - 190}" width="120" height="120" rx="31"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="80" y="${titleY - 190}" width="120" height="120" rx="31" fill="hsl(${hue},45%,22%)"/>
  ${icon
    ? `<image href="${icon}" x="104" y="${titleY - 166}" width="72" height="72"/>`
    : `<g stroke="hsl(${hue},85%,78%)" stroke-width="8" stroke-linecap="round" transform="translate(110 ${titleY - 160}) scale(3)"><path d="M4 8.5v3M7 6v8M10 3.5v13M13 6.5v7M16 8.5v3" fill="none" transform="translate(-0.5 -0.5)" stroke-width="1.8"/></g>`}
  ${lines.map((l, i) => `<text x="80" y="${titleY + i * 74}" font-family="${FONT}" font-size="68" font-weight="700" fill="#fafafa" letter-spacing="-2">${esc(l)}</text>`).join('')}
  <text x="80" y="${titleY + (lines.length - 1) * 74 + 52}" font-family="${FONT}" font-size="28" fill="#a1a1aa">${esc(m.author)}</text>
  <g font-family="${FONT}" font-size="26" fill="#fafafa">
    <rect x="80" y="500" width="${flag ? 230 : 190}" height="56" rx="28" fill="#1c1c1f" stroke="#2e2e33"/>
    ${flag ? `<image href="${dataUri(flagFile, 'image/svg+xml')}" x="102" y="514" width="38" height="28" preserveAspectRatio="xMidYMid slice"/>` : ''}
    <text x="${flag ? 152 : 104}" y="537">${esc(langLabel.slice(0, 12))}</text>
    ${qLabel ? `<rect x="${flag ? 326 : 286}" y="500" width="252" height="56" rx="28" fill="#1c1c1f" stroke="#2e2e33"/>
    <circle cx="${flag ? 352 : 312}" cy="528" r="8" fill="${qColor}"/>
    <text x="${flag ? 372 : 332}" y="537">${esc(qLabel)}</text>` : ''}
    <rect x="${flag ? 594 : 554}" y="500" width="${speakers.length * 15 + 48}" height="56" rx="28" fill="#1c1c1f" stroke="#2e2e33"/>
    <text x="${flag ? 618 : 578}" y="537">${esc(speakers)}</text>
  </g>
  <image href="${LOGO}" x="940" y="60" width="64" height="64"/>
  <text x="1014" y="104" font-family="${FONT}" font-size="30" font-weight="700" fill="#fafafa" text-anchor="start" letter-spacing="-1">PiperHub</text>
  <text x="1120" y="570" font-family="${FONT}" font-size="22" fill="#71717a" text-anchor="end">piperhub.org</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
