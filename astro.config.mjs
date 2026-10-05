import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// GH Pages (project site) => base '/huggingface-crawler/' via SITE_BASE env.
// Local/dev + static preview => base '/'.
const SITE = 'https://piper-bank.fox3000foxy.com';

// lastmod par page modèle depuis les données (dates de commit ONNX).
const rootDir = dirname(fileURLToPath(import.meta.url));
const lastmod = new Map();
try {
  const models = JSON.parse(readFileSync(join(rootDir, 'src/data/models.json'), 'utf8'));
  for (const m of models) {
    if (!m.slug || !m.updated) continue;
    lastmod.set(`/model/${m.slug}/`, m.updated);
  }
} catch {}

export default defineConfig({
  site: process.env.SITE_URL || SITE,
  base: process.env.SITE_BASE || '/',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      serialize(item) {
        const base = (process.env.SITE_BASE || '/').replace(/\/$/, '');
        let rel = new URL(item.url).pathname;
        if (base && rel.startsWith(base + '/')) rel = rel.slice(base.length);
        const noLocale = rel.replace(/^\/(fr|en)(?=\/|$)/, '') || '/';
        const hit = lastmod.get(noLocale);
        if (hit) item.lastmod = new Date(hit + 'T00:00:00Z').toISOString();
        return item;
      },
    }),
  ],
});
