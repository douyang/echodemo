// The preload block in the head of index.html: a <link rel="modulepreload"> for every module that
// src/main.js imports, so that the browser asks for them all at once and not one import level at
// a time, and a script that starts the heart model's files and modules at once on a chapter whose
// figure needs them (the chapter's `model: true`).
//   node tools/preload.mjs           write the block into index.html
//   node tools/preload.mjs --check   fail when the block differs from the imports and the chapters
// Run it again after a change to the imports or to a chapter's `model` flag. A stale block costs
// load time only: a module it leaves out loads when its importer asks for it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from '../src/chapters.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const STATIC = /^\s*(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const list = (xs) => `[${xs.map((x) => `'${x}'`).join(', ')}]`;
const importsOf = (file, re) => {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(re)].map((m) => m[1]).filter((s) => s.startsWith('.')).map((s) => path.resolve(path.dirname(file), s));
};
/** Every module that files import, the files first, in the order a browser finds them. */
function closure(files, skip = new Set()) {
  const seen = new Set(skip), out = [], queue = [...files];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
    queue.push(...importsOf(f, STATIC));
  }
  return out;
}

const page = closure([path.join(ROOT, 'src/main.js')]);
// the modules that the heart model's loader and the offscreen views import when they first run
const model = closure(['src/model3d.js', 'src/scanner.js'].flatMap((f) => importsOf(path.join(ROOT, f), DYNAMIC)), new Set(page));
const chapters = CHAPTERS.filter((c) => c.model).map((c) => c.key);
const FILES = ['assets/anatomy.json', 'assets/heart.json', 'assets/valves.json', 'assets/hinges.json'];

const START = '<!-- preload: tools/preload.mjs writes this block -->';
const END = '<!-- /preload -->';
const block = [
  START,
  ...page.map((f) => `<link rel="modulepreload" href="${rel(f)}">`),
  '<script>',
  '// a chapter whose figure needs the heart model at once: its files and modules load from the start',
  '(() => {',
  `  const MODEL = ${list(chapters)};`,
  '  if (!MODEL.includes(location.hash.slice(1))) return;',
  '  const add = (rel, href, as) => {',
  "    const l = document.createElement('link');",
  '    l.rel = rel;',
  '    l.href = href;',
  "    if (as) { l.as = as; l.crossOrigin = 'anonymous'; }",
  '    document.head.appendChild(l);',
  '  };',
  `  for (const f of ${list(FILES)}) add('preload', f, 'fetch');`,
  `  for (const f of ${list(model.map(rel))}) add('modulepreload', f);`,
  '})();',
  '</script>',
  END,
].join('\n');

const html = fs.readFileSync(INDEX, 'utf8');
const a = html.indexOf(START), b = html.indexOf(END);
// the block goes before the font links: a script after a style sheet waits for the sheet
const ANCHOR = '<link rel="preconnect" href="https://fonts.googleapis.com">';
let next;
if (a >= 0 && b > a) next = html.slice(0, a) + block + html.slice(b + END.length);
else if (html.includes(ANCHOR)) next = html.replace(ANCHOR, `${block}\n${ANCHOR}`);
else throw new Error(`index.html: no preload block and no ${ANCHOR}`);

if (process.argv.includes('--check')) {
  const ok = next === html;
  console.log(ok ? `ok: ${page.length} modules, ${model.length} model modules, ${chapters.length} model chapters` : 'the preload block in index.html is stale: run node tools/preload.mjs');
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(INDEX, next);
console.log(`index.html: ${page.length} modules, ${model.length} model modules, ${chapters.length} model chapters`);
