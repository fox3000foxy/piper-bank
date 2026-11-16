// Favourite voices, stored in this browser only (no account).
const KEY = 'piperhub-favorites';
const EVT = 'piperhub:favorites';

export function getFavorites(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function isFavorite(slug: string): boolean {
  return getFavorites().includes(slug);
}

export function toggleFavorite(slug: string): boolean {
  const list = getFavorites();
  const i = list.indexOf(slug);
  if (i >= 0) list.splice(i, 1); else list.unshift(slug);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new CustomEvent(EVT));
  return i < 0;
}

export function onFavoritesChange(fn: () => void) {
  window.addEventListener(EVT, fn);
  window.addEventListener('storage', (e) => { if (e.key === KEY) fn(); });
}

/** Wire every `[data-fav="<slug>"]` button inside `root`. */
export function bindFavButtons(root: ParentNode = document) {
  const sync = () => {
    const favs = new Set(getFavorites());
    root.querySelectorAll<HTMLButtonElement>('[data-fav]').forEach((b) => b.setAttribute('aria-pressed', String(favs.has(b.dataset.fav!))));
    document.querySelectorAll<HTMLElement>('[data-fav-count]').forEach((el) => { el.textContent = String(favs.size); el.hidden = favs.size === 0; });
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-fav]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(b.dataset.fav!);
  });
  onFavoritesChange(sync);
  sync();
}
