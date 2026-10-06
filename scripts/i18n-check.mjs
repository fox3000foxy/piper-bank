#!/usr/bin/env node
// Valide les fichiers src/i18n/locales/*.json : parité des clés avec fr,
// valeurs non vides, placeholders conservés, aucun tiret cadratin.
// Sortie != 0 au premier problème. Référence : fr.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');
const ref = JSON.parse(readFileSync(join(dir, 'fr.json'), 'utf8'));
const refKeys = Object.keys(ref);
const refTokens = {};
for (const [k, v] of Object.entries(ref)) {
  refTokens[k] = new Set((v.match(/\{(\w+)\}/g) || []).sort());
}

const tokensOf = (v) => new Set(((v || '').match(/\{(\w+)\}/g) || []).sort());
let fail = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const loc = file.slice(0, -5);
  const d = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const errs = [];
  const keys = Object.keys(d);
  if (keys.length !== refKeys.length || !refKeys.every((k) => k in d)) {
    errs.push(`clés: ${keys.length} vs ${refKeys.length} (fr)`);
  }
  for (const k of refKeys) {
    if (!(k in d)) { errs.push(`clé manquante: ${k}`); break; }
    const v = d[k];
    if (!v || !v.trim()) { errs.push(`vide: ${k}`); break; }
    const a = [...tokensOf(v)].join(','), b = [...refTokens[k]].join(',');
    if (a !== b) { errs.push(`tokens ${k}: [${a}] vs [${b}]`); break; }
    if (v.includes('—')) { errs.push(`tiret cadratin: ${k}`); break; }
  }
  if (loc !== 'fr') {
    for (const k of keys) {
      if (!refKeys.includes(k)) { errs.push(`clé inconnue: ${k}`); break; }
    }
  }
  if (errs.length) { fail += 1; console.error(`[i18n] ${loc}: ${errs.join('; ')}`); }
  else console.log(`[i18n] ${loc}: OK (${keys.length} clés)`);
}
if (fail) process.exit(1);
console.log('[i18n] toutes les locales sont valides');
