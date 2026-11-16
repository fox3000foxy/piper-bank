// One shared audio element for "play sample" buttons in lists.
// Buttons: <button data-play="<sample url>">; their closest [data-play-row] gets
// .is-playing / .is-loading so the row can reflect the state.
export function bindQuickPlay(root: ParentNode = document) {
  const audio = new Audio();
  audio.preload = 'none';
  let current: HTMLButtonElement | null = null;

  const setState = (btn: HTMLButtonElement | null, state: 'idle' | 'loading' | 'playing' | 'error') => {
    if (!btn) return;
    const row = btn.closest<HTMLElement>('[data-play-row]') || btn;
    row.classList.toggle('is-loading', state === 'loading');
    row.classList.toggle('is-playing', state === 'playing');
    row.classList.toggle('is-error', state === 'error');
    btn.setAttribute('aria-pressed', String(state === 'playing' || state === 'loading'));
    const label = state === 'playing' || state === 'loading' ? btn.dataset.pauseLabel : btn.dataset.playLabel;
    if (label) btn.setAttribute('aria-label', label);
  };

  root.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-play]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (current === btn && !audio.paused) { audio.pause(); return; }
    if (current && current !== btn) setState(current, 'idle');
    current = btn;
    if (audio.src !== btn.dataset.play) audio.src = btn.dataset.play!;
    setState(btn, 'loading');
    audio.play().catch(() => setState(btn, 'error'));
  });
  audio.addEventListener('playing', () => setState(current, 'playing'));
  audio.addEventListener('waiting', () => setState(current, 'loading'));
  audio.addEventListener('pause', () => setState(current, 'idle'));
  audio.addEventListener('ended', () => setState(current, 'idle'));
  audio.addEventListener('error', () => setState(current, 'error'));
  return audio;
}
