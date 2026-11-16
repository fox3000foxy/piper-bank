// Small, dependency-free search helpers shared by the palette and the catalogs.

/** Lowercase, strip diacritics, unify separators. "Élodie_FR-high" → "elodie fr high". */
export function fold(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-./·,()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(q: string): string[] {
  return fold(q).split(' ').filter(Boolean);
}

/**
 * Score a document for a query. Every token must appear somewhere in `hay`
 * (AND semantics). Matches in `title`, at word starts, and full-title prefixes
 * rank higher. Returns 0 when the document does not match.
 */
export function scoreItem(hay: string, title: string, toks: string[]): number {
  if (!toks.length) return 1;
  let score = 0;
  const h = ' ' + hay;
  const tt = ' ' + title;
  for (const tok of toks) {
    const inHay = h.indexOf(tok);
    if (inHay < 0) return 0;
    score += 1;
    if (h.includes(' ' + tok)) score += 1;
    const inTitle = tt.indexOf(tok);
    if (inTitle >= 0) {
      score += 3;
      if (tt.includes(' ' + tok)) score += 2;
    }
  }
  if (title.startsWith(toks.join(' '))) score += 6;
  if (title === toks.join(' ')) score += 6;
  return score;
}
