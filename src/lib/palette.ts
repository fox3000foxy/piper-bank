// Global search palette (Ctrl/⌘ K, "/" outside inputs).
// Searches pages, docs, languages, voices and datasets. The voice/dataset index
// is fetched once, lazily, the first time the palette opens.
import { fold, scoreItem, tokens } from './search';

type StaticEntry = { t: string; d: string; u: string; i: string; g: string };
type ModelEntry = { s: string; n: string; l: string; ln: string; q: string; a: string; v: number; h: number; i: string; c: number; p: number; k: string };
type DatasetEntry = { s: string; n: string; l: string; ln: string; src: string; cls: string; m: number };
type Hit = { group: string; title: string; sub: string; url: string; icon?: string; hue?: number; img?: string; badge?: string; score: number };

const ICONS: Record<string, string> = {
  mic: '<rect x="7.25" y="2.75" width="5.5" height="9" rx="2.75"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>',
  database: '<ellipse cx="10" cy="5" rx="6" ry="2.25"/><path d="M4 5v10c0 1.25 2.7 2.25 6 2.25s6-1 6-2.25V5M4 10c0 1.25 2.7 2.25 6 2.25S16 11.25 16 10"/>',
  book: '<path d="M3.5 4.5c2.3-.9 4.5-.7 6.5.75v11c-2-1.45-4.2-1.65-6.5-.75v-11ZM16.5 4.5c-2.3-.9-4.5-.7-6.5.75v11c2-1.45 4.2-1.65 6.5-.75v-11Z"/>',
  gauge: '<path d="M3.2 14a7.25 7.25 0 1 1 13.6 0"/><path d="m10 11 3.2-3.2"/>',
  terminal: '<rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2"/><path d="m6 8 2.5 2L6 12M10.5 12.5H14"/>',
  code: '<path d="m7 6-4 4 4 4M13 6l4 4-4 4"/>',
  layers: '<path d="m10 3 7 3.75-7 3.75-7-3.75L10 3Z"/><path d="m3 10.25 7 3.75 7-3.75M3 13.75l7 3.75 7-3.75"/>',
  doc: '<path d="M5 2.75h6.5L15.25 6.5v10a.75.75 0 0 1-.75.75H5a.75.75 0 0 1-.75-.75V3.5A.75.75 0 0 1 5 2.75Z"/><path d="M11.25 2.75V6.75h4"/>',
  globe: '<circle cx="10" cy="10" r="7.25"/><path d="M2.75 10h14.5M10 2.75c2 2 3 4.4 3 7.25s-1 5.25-3 7.25c-2-2-3-4.4-3-7.25s1-5.25 3-7.25Z"/>',
  wave: '<path d="M4 8.5v3M7 6v8M10 3.5v13M13 6.5v7M16 8.5v3"/>',
  search: '<circle cx="8.75" cy="8.75" r="5.75"/><path d="m13 13 4.5 4.5"/>',
};
const svg = (name: string) => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.doc}</svg>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function initPalette() {
  const dialog = document.getElementById('palette') as HTMLDialogElement | null;
  const input = document.getElementById('palette-q') as HTMLInputElement | null;
  const list = document.getElementById('palette-list') as HTMLElement | null;
  if (!dialog || !input || !list) return;
  const statics: StaticEntry[] = JSON.parse(document.getElementById('palette-static')!.textContent || '[]');
  const ui = JSON.parse(document.getElementById('palette-ui')!.textContent || '{}');
  const home: string = ui.home;
  const link = (p: string) => home.replace(/\/$/, '') + p;
  const fmt = new Intl.NumberFormat(ui.tag);
  const plural = new Intl.PluralRules(ui.tag);
  let langName: (c: string) => string = (c) => c;
  try { const dn = new Intl.DisplayNames([ui.tag], { type: 'language' }); langName = (c) => { try { const n = dn.of(c) || c; return n.charAt(0).toLocaleUpperCase(ui.tag) + n.slice(1); } catch { return c; } }; } catch {}

  let index: { m: ModelEntry[]; d: DatasetEntry[] } | null = null;
  let loading: Promise<void> | null = null;
  let modelHay: string[] = [];
  let langs: { code: string; label: string; hay: string; count: number }[] = [];
  const load = () => loading ??= fetch(ui.base.replace(/\/?$/, '/') + 'search-index.json')
    .then((r) => r.json())
    .then((data) => {
      index = data;
      modelHay = data.m.map((m: ModelEntry) => fold(`${m.n} ${m.a} ${m.l} ${m.ln} ${langName(m.l)} ${m.k}`));
      const counts = new Map<string, number>();
      for (const m of data.m as ModelEntry[]) counts.set(m.l, (counts.get(m.l) || 0) + 1);
      langs = [...counts].map(([code, count]) => {
        const label = langName(code);
        return { code, label, count, hay: fold(`${label} ${code} ${data.m.find((m: ModelEntry) => m.l === code)?.ln || ''}`) };
      });
      render();
    })
    .catch(() => {});

  let hits: Hit[] = [];
  let active = 0;

  function search(q: string): Hit[] {
    const toks = tokens(q);
    const out: Hit[] = [];
    if (!toks.length) {
      statics.forEach((s, i) => out.push({ group: ui.pages, title: s.t, sub: s.d, url: s.u, icon: s.i, score: 100 - i }));
      return out;
    }
    for (const s of statics) {
      const sc = scoreItem(fold(`${s.t} ${s.d}`), fold(s.t), toks);
      if (sc > 0) out.push({ group: ui.pages, title: s.t, sub: s.d, url: s.u, icon: s.i, score: sc });
    }
    for (const l of langs) {
      const sc = scoreItem(l.hay, fold(l.label), toks);
      if (sc > 0) out.push({ group: ui.languages, title: l.label, sub: `${fmt.format(l.count)} ${ui.models}`, url: link(`/voices/?lang=${encodeURIComponent(l.code)}`), icon: 'globe', score: sc + 5 });
    }
    if (index) {
      const ms: Hit[] = [];
      index.m.forEach((m, i) => {
        const sc = scoreItem(modelHay[i], fold(m.n), toks);
        if (sc > 0) ms.push({
          group: ui.voices, title: m.n, url: link(`/model/${m.s}/`), hue: m.h, img: m.i ? ui.base.replace(/\/?$/, '/') + m.i : '',
          sub: `${langName(m.l)} · ${m.a} · ${m.v > 1 ? (ui.speakers[plural.select(m.v)] ?? ui.speakers.other).replace('{count}', fmt.format(m.v)) : ui.one}`,
          badge: ui.q[m.q] || '', score: sc + (m.c ? 0.5 : 0),
        });
      });
      ms.sort((a, b) => b.score - a.score);
      out.push(...ms.slice(0, 8));
      const ds: Hit[] = [];
      for (const d of index.d) {
        const sc = scoreItem(fold(`${d.n} ${d.src} ${d.cls} ${d.l} ${d.ln}`), fold(d.n), toks);
        if (sc > 0) ds.push({ group: ui.datasets, title: d.n, sub: [d.src, langName(d.l)].filter(Boolean).join(' · '), url: link(`/dataset/${d.s}/`), icon: 'database', score: sc });
      }
      ds.sort((a, b) => b.score - a.score);
      out.push(...ds.slice(0, 5));
    }
    // Group order: best group first, by top score.
    const order = new Map<string, number>();
    for (const h of out) order.set(h.group, Math.max(order.get(h.group) ?? 0, h.score));
    const groups = [...order.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const sorted: Hit[] = [];
    for (const g of groups) sorted.push(...out.filter((h) => h.group === g).sort((a, b) => b.score - a.score).slice(0, g === ui.voices ? 8 : 5));
    sorted.push({ group: '', title: ui.all, sub: `“${q.trim()}”`, url: link(`/voices/?q=${encodeURIComponent(q.trim())}`), icon: 'search', score: 0 });
    return sorted;
  }

  function render() {
    const q = input!.value;
    hits = search(q);
    active = Math.min(active, Math.max(0, hits.length - 1));
    if (q.trim() && hits.length <= 1 && index) {
      list!.innerHTML = `<p class="palette-empty">${esc(ui.empty.replace('{q}', q.trim()))}</p>`;
    }
    let html = '';
    let last = '';
    hits.forEach((h, i) => {
      if (h.group !== last) { html += h.group ? `<div class="palette-group" role="presentation">${esc(h.group)}</div>` : '<div class="palette-sep" role="presentation"></div>'; last = h.group; }
      const lead = h.hue !== undefined
        ? `<span class="palette-avatar" style="--h:${h.hue}">${h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy">` : svg('wave')}</span>`
        : `<span class="palette-icon">${svg(h.icon || 'doc')}</span>`;
      html += `<a class="palette-item" role="option" id="pi-${i}" href="${esc(h.url)}" aria-selected="${i === active}" data-i="${i}">${lead}<span class="palette-text"><span class="palette-title">${esc(h.title)}</span><span class="palette-sub">${esc(h.sub)}</span></span>${h.badge ? `<span class="palette-badge">${esc(h.badge)}</span>` : ''}<span class="palette-enter" aria-hidden="true">↵</span></a>`;
    });
    if (!(q.trim() && hits.length <= 1 && index)) list!.innerHTML = html;
    else list!.insertAdjacentHTML('beforeend', html);
    input!.setAttribute('aria-activedescendant', `pi-${active}`);
  }

  function move(delta: number) {
    if (!hits.length) return;
    active = (active + delta + hits.length) % hits.length;
    list!.querySelectorAll('.palette-item').forEach((el) => el.setAttribute('aria-selected', String(Number((el as HTMLElement).dataset.i) === active)));
    list!.querySelector(`#pi-${active}`)?.scrollIntoView({ block: 'nearest' });
    input!.setAttribute('aria-activedescendant', `pi-${active}`);
  }

  function open(initial = '') {
    if (dialog!.open) return;
    input!.value = initial;
    active = 0;
    render();
    dialog!.showModal();
    input!.focus();
    load();
  }

  document.querySelectorAll('[data-palette-open]').forEach((b) => b.addEventListener('click', () => open()));
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable="true"]');
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); dialog!.open ? dialog!.close() : open(); }
    else if (e.key === '/' && !typing && !document.querySelector('[data-local-search]')) { e.preventDefault(); open(); }
  });
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = hits[active]; if (h) location.href = h.url; }
  });
  list.addEventListener('mousemove', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.palette-item');
    if (el && Number(el.dataset.i) !== active) { active = Number(el.dataset.i); move(0); }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
