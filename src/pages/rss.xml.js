import rss from '@astrojs/rss';
import { feedFor } from '../lib/rss-feed.js';

const SITE = 'https://piperhub.org';

export function GET() {
  const feed = feedFor('en');
  return rss({
    title: feed.title,
    description: feed.description,
    site: SITE,
    items: feed.items,
  });
}
