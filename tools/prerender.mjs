// The citation numbers, the list of sources and the tables of normal values, written into
// index.html as the page draws them (src/main.js: numberCitations, fillNorms), so that a crawler
// that reads the HTML and runs no script sees the source of each value. main.js draws the same
// numbers when the page opens. Chromium opens the page from a local server.
//   node tools/prerender.mjs           write them into index.html
//   node tools/prerender.mjs --check   fail when index.html differs from what the page draws
// Run it again after a change to a citation, a source or a table of normal values.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './video-page.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const CITE = /(<span class="cite" data-ref="[^"]*">)[\s\S]*?(<\/span>)/g;
const BLOCK = (id) => new RegExp(`(id="${id}"><!-- tools/prerender.mjs -->)[\\s\\S]*?(<!-- /tools/prerender.mjs -->)`);
// the normal values hold markers of their own, which fillNorms draws: the pass over the markers skips them
const NORMS = BLOCK('norms-body'), PARKED = '<!-- norms -->';
const park = (s) => { let kept = ''; return [s.replace(NORMS, (m) => { kept = m; return PARKED; }), kept]; };

// the repository on a free port, as the site serves it; in index.html each citation marker carries
// its place in the markup (data-pr), since scripts add markers of their own (diagrams, tables)
const html = fs.readFileSync(INDEX, 'utf8');
const [body, norms] = park(html);
let k = 0;
const tagged = body.replace(CITE, (m, a, b) => `${a.replace('<span ', `<span data-pr="${k++}" `)}${b}`).replace(PARKED, norms);
const n = k;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  if (file === INDEX) { res.writeHead(200, { 'content-type': 'text/html' }).end(tagged); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await launch();
let drawn;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#reflist li') && document.querySelector('#norms-body table'), null, { timeout: 60000 });
  drawn = await page.evaluate(() => ({
    cites: Object.fromEntries([...document.querySelectorAll('.cite[data-pr]')].map((el) => [el.dataset.pr, el.innerHTML])),
    reflist: document.getElementById('reflist').innerHTML,
    norms: document.getElementById('norms-body').innerHTML,
  }));
  if (errors.length) throw new Error(`the page failed: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

// a marker that a script took out of the page keeps what it has
const kept = n - Object.keys(drawn.cites).length;
let i = 0;
const out = body
  .replace(CITE, (m, a, b) => { const c = drawn.cites[i++]; return c === undefined ? m : `${a}${c}${b}`; })
  .replace(BLOCK('reflist'), (m, a, b) => `${a}${drawn.reflist}${b}`)
  .replace(PARKED, norms)
  .replace(NORMS, (m, a, b) => `${a}${drawn.norms}${b}`);
const sources = (drawn.reflist.match(/<li /g) || []).length, numbered = Object.values(drawn.cites).filter(Boolean).length;
if (kept) console.warn(`${kept} citation markers are not in the drawn page and keep their markup`);
if (process.argv.includes('--check')) {
  if (out !== html) { console.error('index.html is out of date: run node tools/prerender.mjs'); process.exit(1); }
  console.log(`ok: ${numbered} of ${n} citation markers numbered, ${sources} sources, the normal values in index.html`);
} else {
  fs.writeFileSync(INDEX, out);
  console.log(`wrote index.html: ${numbered} of ${n} citation markers numbered, ${sources} sources, the normal values`);
}
