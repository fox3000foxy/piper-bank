// Synthesis history, stored in this browser only (no account): the voice, the text
// and the speaker of the latest syntheses, so they can be replayed from the library.
const KEY = 'piperhub-history';
const EVT = 'piperhub:history';
const MAX = 50;

export type HistoryEntry = { s: string; t: string; sid?: number; at: number };

export function getHistory(): HistoryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.s === 'string' && typeof e.t === 'string') : [];
  } catch { return []; }
}

function save(list: HistoryEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch {}
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Newest first; the same voice + text + speaker moves to the top instead of repeating. */
export function addHistory(entry: Omit<HistoryEntry, 'at'>) {
  const text = entry.t.trim().slice(0, 1000);
  if (!text) return;
  const same = (e: HistoryEntry) => e.s === entry.s && e.t === text && (e.sid ?? null) === (entry.sid ?? null);
  save([{ ...entry, t: text, at: Date.now() }, ...getHistory().filter((e) => !same(e))]);
}

export function removeHistory(at: number) { save(getHistory().filter((e) => e.at !== at)); }
export function clearHistory() { save([]); }

/** Merge imported entries (deduplicated on timestamp), newest first. */
export function mergeHistory(entries: HistoryEntry[]) {
  const seen = new Set<number>();
  save([...getHistory(), ...entries]
    .filter((e) => e && typeof e.s === 'string' && typeof e.t === 'string' && Number.isFinite(e.at) && !seen.has(e.at) && seen.add(e.at))
    .sort((a, b) => b.at - a.at));
}

export function onHistoryChange(fn: () => void) {
  window.addEventListener(EVT, fn);
  window.addEventListener('storage', (e) => { if (e.key === KEY) fn(); });
}
