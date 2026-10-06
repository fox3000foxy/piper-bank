import ar from './locales/ar.json';
import de from './locales/de.json';
import enJson from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

export type Locale =
  | 'fr' | 'en' | 'de' | 'es' | 'it' | 'pt' | 'ru' | 'tr'
  | 'ja' | 'ko' | 'zh' | 'id' | 'hi' | 'ar' | 'vi' | 'th';

export type MessageKey = keyof typeof fr;

type Messages = Record<MessageKey, string>;
const en: Messages = enJson;
const deMsg: Messages = de;
const esMsg: Messages = es;
const itMsg: Messages = it;
const ptMsg: Messages = pt;
const ruMsg: Messages = ru;
const trMsg: Messages = tr;
const jaMsg: Messages = ja;
const koMsg: Messages = ko;
const zhMsg: Messages = zh;
const idMsg: Messages = id;
const hiMsg: Messages = hi;
const arMsg: Messages = ar;
const viMsg: Messages = vi;
const thMsg: Messages = th;

export const messages: Record<Locale, Messages> = {
  fr, en, de: deMsg, es: esMsg, it: itMsg, pt: ptMsg, ru: ruMsg, tr: trMsg,
  ja: jaMsg, ko: koMsg, zh: zhMsg, id: idMsg, hi: hiMsg, ar: arMsg,
  vi: viMsg, th: thMsg,
};

export interface LocaleMeta {
  code: Locale;
  tag: string;
  dir: 'ltr' | 'rtl';
  name: string;
  prefixed: boolean;
}

// Anglais = canonique à la racine, les autres sous /<code>/.
export const LOCALES: LocaleMeta[] = [
  { code: 'en', tag: 'en-US', dir: 'ltr', name: 'English', prefixed: false },
  { code: 'fr', tag: 'fr-FR', dir: 'ltr', name: 'Français', prefixed: true },
  { code: 'de', tag: 'de-DE', dir: 'ltr', name: 'Deutsch', prefixed: true },
  { code: 'es', tag: 'es-ES', dir: 'ltr', name: 'Español', prefixed: true },
  { code: 'it', tag: 'it-IT', dir: 'ltr', name: 'Italiano', prefixed: true },
  { code: 'pt', tag: 'pt-PT', dir: 'ltr', name: 'Português', prefixed: true },
  { code: 'ru', tag: 'ru-RU', dir: 'ltr', name: 'Русский', prefixed: true },
  { code: 'tr', tag: 'tr-TR', dir: 'ltr', name: 'Türkçe', prefixed: true },
  { code: 'ja', tag: 'ja-JP', dir: 'ltr', name: '日本語', prefixed: true },
  { code: 'ko', tag: 'ko-KR', dir: 'ltr', name: '한국어', prefixed: true },
  { code: 'zh', tag: 'zh-CN', dir: 'ltr', name: '中文', prefixed: true },
  { code: 'id', tag: 'id-ID', dir: 'ltr', name: 'Bahasa Indonesia', prefixed: true },
  { code: 'hi', tag: 'hi-IN', dir: 'ltr', name: 'हिन्दी', prefixed: true },
  { code: 'ar', tag: 'ar-SA', dir: 'rtl', name: 'العربية', prefixed: true },
  { code: 'vi', tag: 'vi-VN', dir: 'ltr', name: 'Tiếng Việt', prefixed: true },
  { code: 'th', tag: 'th-TH', dir: 'ltr', name: 'ไทย', prefixed: true },
];

export function localeMeta(locale: Locale): LocaleMeta {
  return LOCALES.find((l) => l.code === locale) || LOCALES[0];
}

// og:locale au format fr_FR à partir du tag BCP47.
export function ogLocale(locale: Locale): string {
  return localeMeta(locale).tag.replace(/-(.*)/, (_, r: string) => '_' + r.toUpperCase());
}

export function t(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(localeMeta(locale).tag).format(value);
}

const LOCALE_PREFIX = new RegExp('^/(' + LOCALES.filter((l) => l.prefixed).map((l) => l.code).join('|') + ')(?=/|$)');

export function localeFromPath(pathname: string): Locale {
  const m = LOCALE_PREFIX.exec(pathname);
  return (m ? (m[1] as Locale) : 'en');
}

export function localizedPath(base: string, locale: Locale, path: string): string {
  const cleanBase = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`;
  const cleanPath = `/${path.replace(/^\/+/, '')}`;
  const withoutLocale = cleanPath.replace(LOCALE_PREFIX, '') || '/';
  const localePath = localeMeta(locale).prefixed
    ? `/${locale}${withoutLocale === '/' ? '/' : withoutLocale}`
    : withoutLocale;
  return `${cleanBase}${localePath}` || '/';
}

export function languageLabel(code: string, fallback: string, locale: Locale): string {
  try {
    const displayName = new Intl.DisplayNames([localeMeta(locale).tag], { type: 'language' }).of(code);
    if (displayName && displayName.toLowerCase() !== code.toLowerCase()) return displayName;
  } catch {
    // Unknown or nonstandard source language tags keep their supplied display name.
  }
  return fallback;
}
