import rss from '@astrojs/rss';
import { LOCALES } from '../../i18n/ui';
import { feedFor } from '../../lib/rss-feed.js';

const SITE = 'https://piperhub.org';

export function getStaticPaths() {
  return LOCALES.filter((l) => l.prefixed).map((l) => ({ params: { locale: l.code } }));
}

export function GET({ params }) {
  const feed = feedFor(params.locale);
  return rss({
    title: feed.title,
    description: feed.description,
    site: SITE,
    items: feed.items,
  });
}
