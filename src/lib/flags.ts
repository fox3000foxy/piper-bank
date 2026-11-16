// Language code -> flag (flag-icons, MIT, SVGs copied to public/flags/).
// A flag stands for the region where the language is mainly spoken; languages
// without a clear country (Kurdish, multilingual) get no flag.
const MAP: Record<string, string> = {
  ar: 'sa', ary: 'ma', bem: 'zm', bg: 'bg', bn: 'bd', brx: 'in', ca: 'es-ct', cs: 'cz', cy: 'gb-wls',
  da: 'dk', de: 'de', el: 'gr', en: 'us', 'en-us': 'us', 'en-gb': 'gb', es: 'es', 'es-mx': 'mx',
  et: 'ee', eu: 'es-pv', fa: 'ir', fi: 'fi', fr: 'fr', gu: 'in', ha: 'ng', he: 'il', hi: 'in',
  hu: 'hu', hy: 'am', id: 'id', is: 'is', it: 'it', ja: 'jp', ka: 'ge', kk: 'kz', kn: 'in', ko: 'kr',
  lb: 'lu', lt: 'lt', lv: 'lv', ml: 'in', mr: 'in', ms: 'my', ne: 'np', nl: 'nl', no: 'no', nb: 'no',
  nya: 'mw', or: 'in', pl: 'pl', pt: 'pt', 'pt-br': 'br', ro: 'ro', ru: 'ru', sat: 'in', si: 'lk',
  sk: 'sk', sl: 'si', sq: 'al', sr: 'rs', sv: 'se', sw: 'tz', ta: 'in', tdt: 'tl', tet: 'tl', te: 'in',
  th: 'th', tl: 'ph', toi: 'zm', tr: 'tr', uk: 'ua', ur: 'pk', vi: 'vn', zh: 'cn',
};

export const FLAG_CODES = [...new Set(Object.values(MAP))];

/** Flag file name (without extension) for a language code, or '' when none fits. */
export function flagFor(lang: string): string {
  const code = (lang || '').toLowerCase();
  if (MAP[code]) return MAP[code];
  const region = code.split(/[-_]/)[1];
  if (region && region.length === 2) return region;
  return MAP[code.split(/[-_]/)[0]] || '';
}
