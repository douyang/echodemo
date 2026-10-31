// llms.txt, the site for language models (llmstxt.org): the title, the description and the note
// on sources from index.html, then every chapter in the order of src/order.js, with its number,
// title, kicker and address.
//   node tools/llms.mjs           write llms.txt
//   node tools/llms.mjs --check   fail when llms.txt differs from the order and the page
// Run it again after a change to the order, a chapter's title or kicker, the description or the note.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORDER, BONUS, numOf } from '../src/order.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'llms.txt');
const SITE = 'https://intro2echo.com/';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
/** Markup to plain text: no tags, the entities written out, one space between words. */
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENT[e]).replace(/\s+/g, ' ').trim();
const need = (m, what) => { if (!m) throw new Error(`index.html: no ${what}`); return m; };

const title = text(need(html.match(/<title>([^<]*)<\/title>/), '<title>')[1]);
const description = text(need(html.match(/<meta name="description" content="([^"]*)"/), 'description')[1]);
const about = [...need(html.match(/<div class="about">([\s\S]*?)<\/div>/), 'note on sources')[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
const entry = (k) => {
  const re = new RegExp(`<article class="chapter[^"]*" id="ch-${k}">[\\s\\S]*?<h2 class="ch-title">([\\s\\S]*?)</h2>(?:<p class="ch-kicker">([\\s\\S]*?)</p>)?`);
  const m = need(html.match(re), `chapter ${k}`);
  return `- [${numOf(k)} ${text(m[1])}](${SITE}#${k})${m[2] ? `: ${text(m[2])}` : ''}`;
};

const doc = [
  `# ${title}`,
  '',
  `> ${description}`,
  '',
  ...about.flatMap((p) => [p, '']),
  `Each chapter opens by its key in the address, for example ${SITE}#${ORDER[0]}.`,
  '',
  '## Chapters',
  '',
  ...ORDER.map(entry),
  '',
  '## Bonus chapters',
  '',
  ...BONUS.map(entry),
  '',
].join('\n');

if (process.argv.includes('--check')) {
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (old !== doc) { console.error('llms.txt is out of date: run node tools/llms.mjs'); process.exit(1); }
  console.log(`ok: llms.txt lists ${ORDER.length} chapters and ${BONUS.length} bonus chapters`);
} else {
  fs.writeFileSync(OUT, doc);
  console.log(`wrote llms.txt: ${ORDER.length} chapters, ${BONUS.length} bonus chapters`);
}
