// The page at a chapter's address (/tavr; _routes.json lists them, tools/crawlers.mjs writes it):
// the site's one page, index.html, with that chapter's title, description, canonical link,
// preview tags, structured data and date in its head, its article the only one not hidden, and
// its figure the one shown. A crawler that reads the HTML then sees the chapter; src/main.js opens
// it from the address. Any failure serves the plain page, which opens the chapter all the same.
import { PAGES, SITE, ld } from '../src/pages.js';

const longDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const set = (name, value) => ({ element(e) { e.setAttribute(name, value); } });

export async function onRequestGet({ request, params, env, next }) {
  const key = params.key;
  const p = Object.hasOwn(PAGES, key) ? PAGES[key] : null;
  if (!p || p.path === '/') return next();
  try {
    const page = await env.ASSETS.fetch(new URL('/', request.url));
    if (!page.ok) return next();
    const out = new HTMLRewriter()
      .on('html', set('data-ch', key))
      .on('title', { element(e) { e.setInnerContent(p.title); } })
      .on('meta[name="description"]', set('content', p.description))
      .on('link[rel="canonical"]', set('href', p.url))
      .on('meta[property="og:title"]', set('content', p.title))
      .on('meta[property="og:description"]', set('content', p.description))
      .on('meta[property="og:url"]', set('content', p.url))
      .on('meta[property="og:image"]', set('content', SITE + p.image))
      .on('script[type="application/ld+json"]', { element(e) { e.setInnerContent(JSON.stringify(ld(p)).replace(/</g, '\\u003c'), { html: true }); } })
      .on('time.updated', { element(e) { e.setAttribute('datetime', p.modified); e.setInnerContent(longDate(p.modified)); } })
      .on('article.chapter', {
        element(e) {
          const own = e.getAttribute('id') === `ch-${key}`;
          if (own) e.removeAttribute('hidden');
          else e.setAttribute('hidden', '');
          e.setAttribute('class', own ? 'chapter is-active' : 'chapter');
        },
      })
      .on('figure.fig', {
        element(e) {
          const cls = (e.getAttribute('class') || '').split(/\s+/).filter((c) => c && c !== 'is-active');
          if (e.getAttribute('id') === `fig-${key}`) cls.push('is-active');
          e.setAttribute('class', cls.join(' '));
        },
      })
      .transform(page);
    const headers = new Headers(out.headers);
    headers.delete('etag');   // the body is not index.html's
    return new Response(out.body, { status: 200, headers });
  } catch (err) {
    return next();
  }
}
