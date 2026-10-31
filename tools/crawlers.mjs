// What search engines, AI crawlers and link previews read, from index.html and src/order.js:
//   src/pages.js   each address's title, description, preview image, date and structured data:
//                  main.js sets the title and the date as a chapter opens, and functions/[key].js
//                  puts all of it in the head of the chapter's address (/tavr)
//   index.html     the block in its head (canonical link, preview tags, structured data) and the
//                  date under the text, both for the site's root, which shows the first chapter
//   sitemap.xml    every address with its date; llms.txt, the site for language models (llmstxt.org)
//   _routes.json   the addresses that run functions/[key].js; _redirects, /pulse to /
// A chapter's date is the day its text last changed. src/pages.js keeps a hash of each chapter's
// text, and the date moves to today when the hash changes. --from-git takes the dates from the
// history instead: the last commit that changed each chapter's text.
//   node tools/crawlers.mjs              write the files
//   node tools/crawlers.mjs --check      fail when a file is out of date, or a chapter's text changed
//   node tools/crawlers.mjs --from-git   write the files, with the dates from the git history
// Run it after a change to a chapter's text, title or kicker, the order, the title or the description.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ORDER, BONUS_PAGE, BONUS, numOf } from '../src/order.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://intro2echo.com/';
const KEYS = [...ORDER, BONUS_PAGE, ...BONUS];
const at = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(at(p), 'utf8');
const CHECK = process.argv.includes('--check');
const FROM_GIT = process.argv.includes('--from-git');
const TODAY = new Date().toISOString().slice(0, 10);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
/** Markup to plain text: no tags, the entities written out, one space between words. */
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENT[e]).replace(/\s+/g, ' ').trim();
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const need = (m, what) => { if (!m) throw new Error(`index.html: no ${what}`); return m; };
const longDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** A chapter's article in the markup, or null. */
const articleOf = (html, k) => html.match(new RegExp(`<article class="chapter[^"]*" id="ch-${k}"[^>]*>([\\s\\S]*?)</article>`))?.[1] ?? null;
/**
 * The hash of a chapter's text. It leaves out what the tools and the page write into the
 * markup (the citation numbers, the chapter number, the addresses of links), so that only an edit
 * to the chapter changes its date.
 */
const hashOf = (inner) => crypto.createHash('sha256').update(inner
  .replace(/(<span class="cite" data-ref="[^"]*">)[\s\S]*?<\/span>/g, '$1</span>')
  .replace(/(<span class="ch-num"[^>]*>)[^<]*/g, '$1')
  .replace(/ href="[^"]*"(?= data-go=)/g, '')
  .replace(/\s+/g, ' ')).digest('hex').slice(0, 12);
/** Text cut at a word near 157 characters when it is longer than 200. */
const clip = (t) => (t.length > 200 ? `${t.slice(0, 157).replace(/\s+\S*$/, '')}…` : t);
/** The first sentence of a paragraph, clipped. */
const firstSentence = (s) => clip(s.split(/(?<=[.!?])\s+(?=[A-Z(])/)[0]);

const html = read('index.html');
const siteTitle = text(need(html.match(/<title>([^<]*)<\/title>/), '<title>')[1]);
const NAME = siteTitle.split(':')[0].trim();
const siteDescription = text(need(html.match(/<meta name="description" content="([^"]*)"/), 'description')[1]);
const [authorName, authorSuffix] = text(need(html.match(/<p class="credit">By <span class="author">([^<]*)<\/span>/), 'author in the credit line')[1]).split(/,\s*/);
const about = [...need(html.match(/<div class="about">([\s\S]*?)<\/div>/), 'note on sources')[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));

// every article that the order leaves out is hidden in the markup too, so that a crawler that
// reads the HTML does not take an archived chapter for one of the site's
const archived = [...html.matchAll(/<article class="chapter[^"]*" id="ch-([a-z0-9]+)"([^>]*)>/g)].filter(([, k, a]) => !KEYS.includes(k) && !/\shidden\b/.test(a)).map(([, k]) => k);
if (archived.length) throw new Error(`index.html: an archived chapter is not hidden: ${archived.join(', ')}`);

// the dates: from the last run's hashes, or from the history
let old = {};
const pagesPath = at('src/pages.js');
if (fs.existsSync(pagesPath)) old = (await import(`${pathToFileURL(pagesPath).href}?t=${Date.now()}`)).PAGES || {};
const hashes = Object.fromEntries(KEYS.map((k) => [k, hashOf(need(articleOf(html, k), `chapter ${k}`))]));
const dates = {};
if (FROM_GIT) {
  const log = execFileSync('git', ['log', '--reverse', '--format=%H %ct', '--', 'index.html'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  const last = {};
  for (const line of log) {
    const [sha, ct] = line.split(' ');
    const day = new Date(ct * 1000).toISOString().slice(0, 10);   // the commit's day in UTC, as TODAY
    const h = execFileSync('git', ['show', `${sha}:index.html`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    for (const k of KEYS) {
      const inner = articleOf(h, k);
      if (inner === null) continue;
      const x = hashOf(inner);
      if (!last[k] || last[k].hash !== x) last[k] = { hash: x, day };
    }
  }
  for (const k of KEYS) dates[k] = last[k] && last[k].hash === hashes[k] ? last[k].day : TODAY;
} else {
  for (const k of KEYS) dates[k] = old[k] && old[k].text === hashes[k] ? old[k].modified : TODAY;
}

// the pages
const image = (k) => (fs.existsSync(at(`assets/og/${k}.jpg`)) ? `assets/og/${k}.jpg` : 'assets/og/home.jpg');
if (!fs.existsSync(at('assets/og/home.jpg'))) throw new Error('no assets/og/home.jpg (tools/og.mjs)');
const PAGES = {};
KEYS.forEach((k, i) => {
  const a = articleOf(html, k);
  const title = text(need(a.match(/<h2 class="ch-title">([\s\S]*?)<\/h2>/), `title of ${k}`)[1]);
  const kicker = a.match(/<p class="ch-kicker">([\s\S]*?)<\/p>/);
  const dek = a.match(/<p class="dek"[^>]*>([\s\S]*?)<\/p>/);
  const home = i === 0;
  const p = home ? '/' : `/${k}`;
  PAGES[k] = {
    path: p,
    url: home ? SITE : `${SITE}${k}`,
    num: numOf(k),
    name: title,
    kicker: kicker ? text(kicker[1]) : '',
    title: home ? siteTitle : `${title} · ${NAME}`,
    description: home ? siteDescription : dek ? firstSentence(text(dek[1])) : clip(`${title}: ${BONUS.map((b) => text(articleOf(html, b).match(/<h2 class="ch-title">([\s\S]*?)<\/h2>/)[1])).join(', ')}.`),
    image: home ? 'assets/og/home.jpg' : image(k),
    modified: dates[k],
    text: hashes[k],
  };
});

const pagesSrc = `// The title, description, preview image and date of each address on the site, and its structured
// data. tools/crawlers.mjs writes this file from index.html and src/order.js: do not edit it.
// main.js sets the title and the date as a chapter opens; functions/[key].js puts all of it in the
// head of the chapter's address. A page's date is the day its text last changed; text is a hash
// of that text, by which the tool sees a change.
export const SITE = ${JSON.stringify(SITE)};
export const NAME = ${JSON.stringify(NAME)};
export const AUTHOR = ${JSON.stringify({ name: authorName, suffix: authorSuffix || '' })};
export const PAGES = {
${KEYS.map((k) => `  ${k}: ${JSON.stringify(PAGES[k])},`).join('\n')}
};

/** The structured data (schema.org, JSON-LD) of page p: the site, its author and the page. */
export function ld(p) {
  const author = { '@type': 'Person', '@id': \`\${SITE}#author\`, name: AUTHOR.name, ...(AUTHOR.suffix ? { honorificSuffix: AUTHOR.suffix } : {}) };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': \`\${SITE}#website\`, url: SITE, name: NAME, inLanguage: 'en', author: { '@id': author['@id'] } },
      author,
      {
        '@type': 'MedicalWebPage', '@id': p.url, url: p.url, name: p.path === '/' ? NAME : p.name, description: p.description,
        inLanguage: 'en', isPartOf: { '@id': \`\${SITE}#website\` }, author: { '@id': author['@id'] }, dateModified: p.modified,
        image: SITE + p.image, specialty: 'https://schema.org/Cardiovascular', audience: { '@type': 'MedicalAudience', audienceType: 'Clinician' },
      },
    ],
  };
}
`;

// the head block and the date of the root page
const tmp = at('src/.pages.tmp.mjs');
fs.writeFileSync(tmp, pagesSrc);
const { ld } = await import(`${pathToFileURL(tmp).href}?t=${Date.now()}`);
fs.unlinkSync(tmp);
const home = PAGES[KEYS[0]];
const block = [
  '<!-- crawlers: tools/crawlers.mjs writes this block, and functions/[key].js changes it at each chapter\'s address -->',
  `<link rel="canonical" href="${home.url}">`,
  '<meta property="og:type" content="website">',
  `<meta property="og:site_name" content="${attr(NAME)}">`,
  `<meta property="og:title" content="${attr(home.title)}">`,
  `<meta property="og:description" content="${attr(home.description)}">`,
  `<meta property="og:url" content="${home.url}">`,
  `<meta property="og:image" content="${SITE}${home.image}">`,
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
  `<script type="application/ld+json">${JSON.stringify(ld(home)).replace(/</g, '\\u003c')}</script>`,
  '<!-- /crawlers -->',
].join('\n');
const newHtml = html
  .replace(/<!-- crawlers:[^\n]*-->\n[\s\S]*?<!-- \/crawlers -->/, block)
  .replace(/<time class="updated" datetime="[^"]*">[^<]*<\/time>/, `<time class="updated" datetime="${home.modified}">${longDate(home.modified)}</time>`);

const list = (keys) => keys.map((k) => `- [${PAGES[k].num} ${PAGES[k].name}](${PAGES[k].url})${PAGES[k].kicker ? `: ${PAGES[k].kicker}` : ''}`);
const llms = [
  `# ${siteTitle}`, '', `> ${siteDescription}`, '', ...about.flatMap((p) => [p, '']),
  `The site's root shows the first chapter, and every other chapter has an address of its own, for example ${PAGES[ORDER[1]].url}. By ${authorName}${authorSuffix ? `, ${authorSuffix}` : ''}.`, '',
  '## Chapters', '', ...list(ORDER), '', '## Bonus chapters', '', ...list(BONUS), '',
].join('\n');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...KEYS.map((k) => `  <url><loc>${PAGES[k].url}</loc><lastmod>${PAGES[k].modified}</lastmod></url>`),
  '</urlset>', '',
].join('\n');
const routes = `${JSON.stringify({ version: 1, description: 'The chapter addresses run functions/[key].js (tools/crawlers.mjs)', include: KEYS.slice(1).map((k) => `/${k}`), exclude: [] }, null, 2)}\n`;
const redirects = [
  '# The first chapter\'s key goes to the site\'s root, which shows it (tools/crawlers.mjs writes this file).',
  '# functions/[key].js sends /tavr/ to /tavr: a rule here does not apply to an address that a Function serves.',
  `/${KEYS[0]} / 301`, `/${KEYS[0]}/ / 301`, '',
].join('\n');

const out = { 'src/pages.js': pagesSrc, 'index.html': newHtml, 'llms.txt': llms, 'sitemap.xml': sitemap, '_routes.json': routes, '_redirects': redirects };
if (CHECK) {
  const stale = Object.entries(out).filter(([f, s]) => !fs.existsSync(at(f)) || read(f) !== s).map(([f]) => f);
  const moved = KEYS.filter((k) => old[k] && old[k].text !== hashes[k]);
  if (moved.length) console.error(`the text of ${moved.join(', ')} changed: run node tools/crawlers.mjs to move its date`);
  if (stale.length) console.error(`out of date: ${stale.join(', ')}: run node tools/crawlers.mjs`);
  if (stale.length || moved.length) process.exit(1);
  console.log(`ok: ${KEYS.length} addresses; llms.txt, sitemap.xml, src/pages.js, _routes.json, _redirects and the head of index.html are current`);
} else {
  for (const [f, s] of Object.entries(out)) fs.writeFileSync(at(f), s);
  const changed = KEYS.filter((k) => !old[k] || old[k].modified !== dates[k]);
  console.log(`wrote ${Object.keys(out).join(', ')}: ${KEYS.length} addresses; ${changed.length} dates set${FROM_GIT ? ' from the git history' : ''}`);
}
