import rss from '@astrojs/rss';
import modelsData from '../data/models.json';

const SITE = 'https://piperhub.org';

export function GET() {
  const items = modelsData
    .filter((m) => m.usable && m.updated)
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
    .slice(0, 30)
    .map((m) => ({
      title: `${m.name} (${m.voices} voix)`,
      link: `/model/${m.slug}/`,
      description: `${m.author} · ${m.langName} · qualité ${m.quality} · ${m.voices} voix. ${m.dataset ? 'Dataset : ' + m.dataset.name + '.' : ''}`,
      pubDate: new Date(m.updated + 'T00:00:00Z'),
    }));
  return rss({
    title: 'PiperHub · nouvelles voix',
    description: 'Les voix Piper TTS ajoutées ou mises à jour récemment.',
    site: SITE,
    items,
  });
}
