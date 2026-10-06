// Contenu des flux RSS par locale (partagé entre /rss.xml et /<locale>/rss.xml).
// Les chaînes viennent des locales UI existantes : aucun nouveau texte à traduire.
import modelsData from '../data/models.json';
import { formatNumber, t } from '../i18n/ui';

function qualityKey(q) {
  return q === 'high' ? 'quality.high' : q === 'medium' ? 'quality.medium' : q === 'low' ? 'quality.low' : 'quality.unknown';
}

export function feedFor(locale) {
  const visible = modelsData.filter((m) => m.usable || m.piperPlus);
  const langs = new Set(visible.map((m) => m.lang)).size;
  const voices = visible.reduce((sum, m) => sum + m.voices, 0);
  const items = visible
    .filter((m) => m.updated)
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
    .slice(0, 30)
    .map((m) => ({
      title: `${m.name} (${formatNumber(locale, m.voices)} ${t(locale, 'common.voicesUnit')})`,
      link: `${locale === 'en' ? '' : '/' + locale}/model/${m.slug}/`,
      description: `${m.author} · ${m.langName} · ${t(locale, qualityKey(m.quality))} · ${formatNumber(locale, m.voices)} ${t(locale, 'common.voicesUnit')}${m.dataset ? ' · ' + m.dataset.name : ''}`,
      pubDate: new Date(m.updated + 'T00:00:00Z'),
    }));
  return {
    title: `PiperHub · ${t(locale, 'footer.rss')}`,
    description: t(locale, 'home.metaDescription', {
      models: formatNumber(locale, visible.length),
      langs: formatNumber(locale, langs),
      voices: formatNumber(locale, voices),
    }),
    items,
  };
}
