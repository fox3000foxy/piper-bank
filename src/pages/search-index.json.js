// Shared, locale-agnostic index for the global search palette (Ctrl+K).
// Pages and docs entries are localized in the layout; this file only holds data.
import models from '../data/models.json';
import datasets from '../data/datasets.json';
import { flagFor } from '../lib/flags';

export function GET() {
  const m = models
    .filter((x) => x.usable || x.piperPlus)
    .map((x) => ({
      s: x.slug,
      r: x.repo,
      o: x.onnx,
      fl: flagFor(x.lang),
      u: x.updated || '',
      n: x.name,
      l: x.lang,
      ln: x.langName,
      q: x.quality,
      a: x.author,
      v: x.voices,
      h: x.avatar?.hue ?? 220,
      i: x.avatar?.icon || '',
      c: x.avatar?.certified ? 1 : 0,
      p: x.piperPlus ? 1 : 0,
      k: (x.voiceNames || []).slice(0, 40).filter((v) => !/^voice-\d+$/.test(v)).join(' '),
    }));
  const d = datasets.map((x) => ({ s: x.slug, n: x.name, l: x.lang, ln: x.langName, src: x.source || '', cls: x.class || '', m: x.modelSlug ? 1 : 0 }));
  return new Response(JSON.stringify({ m, d }), { headers: { 'Content-Type': 'application/json' } });
}
