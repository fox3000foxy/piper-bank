import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// GH Pages (project site) => base '/huggingface-crawler/' via SITE_BASE env.
// Local/dev + static preview => base '/'.
const SITE = 'https://piperhub.org';

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
      // - /en/... duplique la version racine (canonical = racine) => hors sitemap
      // - pages légales en noindex => hors sitemap
      filter: (page) => {
        const path = new URL(page).pathname;
        return !/^\/en(\/|$)/.test(path) && !/\/(privacy|terms|legal)\/?$/.test(path);
      },
      serialize(item) {
        const url = new URL(item.url);
        const base = (process.env.SITE_BASE || '/').replace(/\/$/, '');
        let rel = url.pathname;
        if (base && rel.startsWith(base + '/')) rel = rel.slice(base.length);
        const noLocale = rel.replace(/^\/(fr|en)(?=\/|$)/, '') || '/';

        // hreflang : EN à la racine, FR sous /fr/
        const en = url.origin + base + noLocale;
        const fr = url.origin + base + '/fr' + noLocale;
        item.links = [
          { url: en, lang: 'en' },
          { url: fr, lang: 'fr' },
          { url: en, lang: 'x-default' },
        ];

        const hit = lastmod.get(noLocale);
        if (hit) item.lastmod = new Date(hit + 'T00:00:00Z').toISOString();
        return item;
      },
    }),
  ],
});
