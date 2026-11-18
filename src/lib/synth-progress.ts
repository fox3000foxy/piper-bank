// Shared loading component for in-browser synthesis (voice page, speaker
// comparison, Compare page). The engine reports `{ phase, loaded, total }`;
// a tracker turns that into a view state (bar, bytes, speed, time left, step)
// and a view patches the DOM without rebuilding it, so transitions stay smooth.

export type ProgressLabels = {
  engine: string; download: string; cached: string; init: string; phonemize: string; synth: string;
  remaining: string; bytes: string; stepModel: string; stepPrepare: string; stepAudio: string;
};
export type ProgressInfo = { phase?: string; loaded?: number; total?: number };

const STEP: Record<string, 'model' | 'prepare' | 'audio'> = {
  download: 'model', cached: 'model', engine: 'prepare', init: 'prepare', phonemize: 'audio', synth: 'audio',
};
const ORDER = ['model', 'prepare', 'audio'] as const;

export class ProgressTracker {
  phase = '';
  modelDone: boolean;
  pct: number | null = null;
  loaded = 0;
  total = 0;
  speed = 0;
  private lastT = 0;
  private lastLoaded = 0;

  constructor(modelCached = false) { this.modelDone = modelCached; }

  get step() { return STEP[this.phase] || 'prepare'; }

  /** Returns false when the update changes nothing visible. */
  update(info?: ProgressInfo): boolean {
    const p = info?.phase;
    if (!p) return false;
    // The engine loads in parallel with the download: keep showing the download.
    if (p === 'engine' && this.phase === 'download') return false;
    if (p === 'cached' || (this.phase === 'download' && p !== 'download')) this.modelDone = true;
    this.phase = p;
    if (p !== 'download' || !info!.total) { this.pct = null; return true; }
    const now = performance.now();
    const loaded = info!.loaded || 0;
    if (!this.lastT) { this.lastT = now; this.lastLoaded = loaded; }
    else if (now - this.lastT > 200) {
      const inst = (loaded - this.lastLoaded) / ((now - this.lastT) / 1000);
      this.speed = this.speed ? this.speed * 0.75 + inst * 0.25 : inst;
      this.lastT = now; this.lastLoaded = loaded;
    }
    this.loaded = loaded;
    this.total = info!.total!;
    this.pct = Math.min(100, Math.floor((loaded / this.total) * 100));
    return true;
  }
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

function formatters(lang: string) {
  const mb1 = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const mb0 = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
  let speed: { format(v: number): string }, sec: { format(v: number): string }, min: { format(v: number): string };
  try { speed = new Intl.NumberFormat(lang, { style: 'unit', unit: 'megabyte-per-second', unitDisplay: 'short', maximumFractionDigits: 1 }); } catch { speed = { format: (v) => v.toFixed(1) + ' MB/s' }; }
  try {
    sec = new Intl.NumberFormat(lang, { style: 'unit', unit: 'second', unitDisplay: 'short' });
    min = new Intl.NumberFormat(lang, { style: 'unit', unit: 'minute', unitDisplay: 'short' });
  } catch { sec = { format: (v) => v + ' s' }; min = { format: (v) => v + ' min' }; }
  const dur = (s: number) => (s < 60 ? sec.format(Math.max(1, Math.ceil(s))) : `${min.format(Math.floor(s / 60))} ${sec.format(Math.round(s % 60))}`);
  return { mb1, mb0, speed, dur };
}

/** Build the component inside `root` once; `apply` then patches it from a tracker. */
export function mountProgress(root: HTMLElement, labels: ProgressLabels, lang: string, opts: { steps?: boolean } = {}) {
  const steps = opts.steps !== false;
  root.innerHTML = `
    <div class="sp-top"><span class="sp-spinner" aria-hidden="true"></span><strong class="sp-phase" aria-live="polite"></strong><span class="sp-pct"></span></div>
    <div class="sp-bar is-indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>
    <div class="sp-meta"><span class="sp-bytes"></span><span class="sp-speed"></span><span class="sp-eta"></span></div>
    ${steps ? `<ol class="sp-steps">${ORDER.map((s) => `<li data-step="${s}"><span class="sp-dot" aria-hidden="true"></span><span></span></li>`).join('')}</ol>` : ''}`;
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  root.querySelectorAll<HTMLElement>('[data-step]').forEach((li) => {
    const key = li.dataset.step === 'model' ? 'stepModel' : li.dataset.step === 'prepare' ? 'stepPrepare' : 'stepAudio';
    li.lastElementChild!.textContent = labels[key];
  });
  const f = formatters(lang);
  const bar = q('.sp-bar');
  return {
    apply(t: ProgressTracker) {
      q('.sp-phase').textContent = (labels as Record<string, string>)[t.phase] || '';
      const i = ORDER.indexOf(t.step);
      root.querySelectorAll<HTMLElement>('[data-step]').forEach((li) => {
        const k = ORDER.indexOf(li.dataset.step as (typeof ORDER)[number]);
        li.classList.toggle('is-done', k < i || (li.dataset.step === 'model' && t.modelDone && t.step !== 'model'));
        li.classList.toggle('is-active', k === i);
      });
      if (t.pct === null) {
        bar.classList.add('is-indeterminate');
        bar.removeAttribute('aria-valuenow');
        q('.sp-pct').textContent = '';
        q('.sp-bytes').textContent = ''; q('.sp-speed').textContent = ''; q('.sp-eta').textContent = '';
        return;
      }
      bar.classList.remove('is-indeterminate');
      bar.setAttribute('aria-valuenow', String(t.pct));
      (bar.firstElementChild as HTMLElement).style.width = `${t.pct}%`;
      q('.sp-pct').textContent = `${t.pct} %`;
      q('.sp-bytes').textContent = fill(labels.bytes, { loaded: f.mb1.format(t.loaded / 1048576), total: f.mb0.format(t.total / 1048576) });
      q('.sp-speed').textContent = t.speed > 0 ? f.speed.format(t.speed / 1048576) : '';
      q('.sp-eta').textContent = t.speed > 0 ? fill(labels.remaining, { time: f.dur((t.total - t.loaded) / t.speed) }) : '';
    },
  };
}

// ---- Parallel downloads preference (Compare). Kept for the browser session. ----
const PARALLEL_KEY = 'piperhub-parallel-downloads';
export function getParallelDownloads(): boolean {
  try { return sessionStorage.getItem(PARALLEL_KEY) !== '0'; } catch { return true; }
}
export function setParallelDownloads(on: boolean) {
  try { sessionStorage.setItem(PARALLEL_KEY, on ? '1' : '0'); } catch {}
  window.dispatchEvent(new CustomEvent('piperhub:parallel', { detail: on }));
}
