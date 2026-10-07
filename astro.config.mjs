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
      // Locales préfixées (source de vérité : LOCALES dans src/i18n/ui.ts).
      // Les pages légales sont en noindex => hors sitemap.
      // (Plus aucune route /en/ : l'anglais canonique vit à la racine.)
      filter: (page) => {
        const path = new URL(page).pathname;
        return !/\/(privacy|terms|legal)\/?$/.test(path);
      },
      serialize(item) {
        const url = new URL(item.url);
        const base = (process.env.SITE_BASE || '/').replace(/\/$/, '');
        let rel = url.pathname;
        if (base && rel.startsWith(base + '/')) rel = rel.slice(base.length);
        const prefixes = 'fr|de|es|it|pt|ru|tr|ja|ko|zh|id|hi|ar|vi|th|en';
        const noLocale = rel.replace(new RegExp(`^/(${prefixes})(?=/|$)`), '') || '/';

        // hreflang : EN à la racine (canonical + x-default), les autres sous /<code>/.
        const en = url.origin + base + noLocale;
        item.links = [{ url: en, lang: 'en' }];
        for (const code of prefixes.split('|')) {
          if (code === 'en') continue;
          item.links.push({ url: url.origin + base + '/' + code + noLocale, lang: code });
        }
        item.links.push({ url: en, lang: 'x-default' });

        const hit = lastmod.get(noLocale);
        if (hit) item.lastmod = new Date(hit + 'T00:00:00Z').toISOString();
        return item;
      },
    }),
  ],
});
