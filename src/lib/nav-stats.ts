// Figures shown in the header mega menus. Computed once per build, not per page.
import models from '../data/models.json';
import datasets from '../data/datasets.json';
import { modelTraits } from './traits';
import { flagFor } from './flags';

const listed = models.filter((m) => m.usable || m.piperPlus);
const freshCutoff = Date.now() - 14 * 864e5;

const byLang = new Map<string, { n: number; name: string }>();
for (const m of listed) {
  const cur = byLang.get(m.lang) || { n: 0, name: m.langName };
  cur.n++;
  byLang.set(m.lang, cur);
}

const traitCount = new Map<string, number>();
for (const m of listed) for (const tr of modelTraits(m as any).traits) traitCount.set(tr, (traitCount.get(tr) || 0) + 1);

const dsLang = new Map<string, { n: number; name: string }>();
// Some datasets carry non-standard codes ("ge", "sp"): only list recognised languages.
for (const d of datasets) {
  if (!d.lang || !flagFor(d.lang)) continue;
  const cur = dsLang.get(d.lang) || { n: 0, name: d.langName || d.lang };
  cur.n++;
  dsLang.set(d.lang, cur);
}

const top = (m: Map<string, { n: number; name: string }>, k: number) =>
  [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, k).map(([code, v]) => ({ code, name: v.name, n: v.n }));

export const navStats = {
  models: listed.length,
  languages: byLang.size,
  recent: listed.filter((m) => m.updated && new Date(m.updated + 'T00:00:00Z').getTime() >= freshCutoff).length,
  topLanguages: top(byLang, 8),
  traits: (['female', 'male', 'expressive', 'character', 'narration'] as const)
    .map((id) => ({ id, n: traitCount.get(id) || 0 }))
    .filter((x) => x.n > 0),
  datasets: datasets.length,
  datasetsWithModel: datasets.filter((d) => d.modelSlug).length,
  datasetLanguages: top(dsLang, 6),
  featured: listed.find((m) => m.slug === 'glados-french-medium-voice') || listed[0],
};
