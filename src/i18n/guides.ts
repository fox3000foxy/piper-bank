import fr from './guides/fr.json';
import en from './guides/en.json';
import de from './guides/de.json';
import es from './guides/es.json';
import it from './guides/it.json';
import pt from './guides/pt.json';
import ru from './guides/ru.json';
import tr from './guides/tr.json';
import ja from './guides/ja.json';
import ko from './guides/ko.json';
import zh from './guides/zh.json';
import id from './guides/id.json';
import hi from './guides/hi.json';
import ar from './guides/ar.json';
import vi from './guides/vi.json';
import th from './guides/th.json';
import type { Locale } from './ui';

const byLocale: Record<string, Record<string, unknown>> = { fr, en, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th };

/** Guide copy for a locale, with a per-key English fallback. */
export function guideCopy(locale: Locale) {
  const c = byLocale[locale] ?? en;
  const ref = en as Record<string, unknown>;
  const str = (k: string): string =>
    typeof c[k] === 'string' ? (c[k] as string) : typeof ref[k] === 'string' ? (ref[k] as string) : '';
  const list = (k: string): string[] => (Array.isArray(c[k]) ? (c[k] as string[]) : Array.isArray(ref[k]) ? (ref[k] as string[]) : []);
  return { str, list };
}
