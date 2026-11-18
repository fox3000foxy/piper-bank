// Header mega menus: hover intent with a mouse, caret button for keyboard and touch,
// Escape / outside click / scrim to close. Panels are inert while closed.
export function initMegaMenu(): void {
  const items = [...document.querySelectorAll<HTMLElement>('[data-mega-item]')];
  const scrim = document.querySelector<HTMLElement>('[data-mega-scrim]');
  const header = document.querySelector<HTMLElement>('.appbar');
  if (!items.length || !header) return;
  const panel = (id: string) => document.getElementById(`mega-${id}`);
  const caret = (id: string) => document.querySelector<HTMLButtonElement>(`[data-mega-toggle="${id}"]`);
  const desktop = matchMedia('(min-width: 921px)');
  let current: string | null = null;
  let openTimer = 0;
  let closeTimer = 0;

  const close = (focusBack = false) => {
    clearTimeout(openTimer);
    if (!current) return;
    const id = current;
    current = null;
    const p = panel(id);
    p?.classList.remove('is-open');
    p?.setAttribute('inert', '');
    caret(id)?.setAttribute('aria-expanded', 'false');
    document.querySelector(`[data-mega-item="${id}"]`)?.classList.remove('is-open');
    header.classList.remove('mega-open');
    scrim?.classList.remove('is-open');
    if (focusBack) caret(id)?.focus();
  };

  const open = (id: string, focusFirst = false) => {
    clearTimeout(closeTimer);
    if (current === id) return;
    const switching = current !== null;
    if (current) {
      // Switch panels without replaying the drop animation.
      const prev = current;
      current = null;
      panel(prev)?.classList.remove('is-open');
      panel(prev)?.setAttribute('inert', '');
      caret(prev)?.setAttribute('aria-expanded', 'false');
      document.querySelector(`[data-mega-item="${prev}"]`)?.classList.remove('is-open');
    }
    const p = panel(id);
    if (!p) return;
    p.classList.toggle('no-anim', switching);
    p.removeAttribute('inert');
    p.classList.add('is-open');
    caret(id)?.setAttribute('aria-expanded', 'true');
    document.querySelector(`[data-mega-item="${id}"]`)?.classList.add('is-open');
    header.classList.add('mega-open');
    scrim?.classList.add('is-open');
    current = id;
    if (focusFirst) p.querySelector<HTMLElement>('a')?.focus();
  };

  const scheduleClose = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => close(), 180);
  };

  for (const item of items) {
    const id = item.dataset.megaItem!;
    item.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !desktop.matches) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      // Already open: follow the pointer at once. Closed: wait a beat to ignore fly-overs.
      if (current) open(id);
      else openTimer = window.setTimeout(() => open(id), 90);
    });
    item.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') scheduleClose(); });
    caret(id)?.addEventListener('click', (e) => {
      if (current === id) close();
      else open(id, (e as MouseEvent).detail === 0);
    });
    caret(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); open(id, true); }
    });
    const p = panel(id);
    p?.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    p?.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') scheduleClose(); });
    // Leaving the panel with Tab closes it.
    p?.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && (p.contains(to) || item.contains(to))) return;
      close();
    });
  }

  scrim?.addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(true); });
  document.addEventListener('pointerdown', (e) => {
    if (current && !header.contains(e.target as Node)) close();
  });
  desktop.addEventListener('change', () => close());
}
