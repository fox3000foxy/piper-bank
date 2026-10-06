#!/usr/bin/env node
// Hachage du CSS post-build.
// Renomme dist/site.css en dist/site.<hash8>.css (SHA-256) puis reecrit
// toutes les references dans les HTML de dist. Echec si le hash est
// incalculable ou si une reference "site.css" subsiste apres reecriture.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const cssPath = join(distDir, 'site.css');

if (!existsSync(cssPath)) {
  console.error(`[hash-assets] CSS introuvable : ${cssPath}`);
  process.exit(1);
}

let hash;
try {
  hash = createHash('sha256').update(readFileSync(cssPath)).digest('hex').slice(0, 8);
} catch (err) {
  console.error(`[hash-assets] echec du calcul du hash : ${err.message}`);
  process.exit(1);
}

const hashedName = `site.${hash}.css`;
renameSync(cssPath, join(distDir, hashedName));

// Liste recursive des fichiers .html de dist.
function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.isFile() && extname(entry.name) === '.html') out.push(full);
  }
  return out;
}

let rewritten = 0;
for (const file of walkHtml(distDir)) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('site.css')) continue;
  // Remplace aussi les references prefixees par la base (/huggingface-crawler/site.css).
  writeFileSync(file, html.split('site.css').join(hashedName));
  rewritten += 1;
}

// Verification : plus aucune reference brute ne doit subsister.
const residual = [];
for (const file of walkHtml(distDir)) {
  if (readFileSync(file, 'utf8').includes('site.css')) residual.push(file);
}
if (residual.length > 0) {
  console.error('[hash-assets] references residuelles a site.css :');
  for (const file of residual) console.error(`  ${file}`);
  process.exit(1);
}

console.log(`[hash-assets] dist/${hashedName} (${rewritten} HTML reecrits)`);
