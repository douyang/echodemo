// The link-preview images in assets/og/ (1200 x 630 JPEG, with ffmpeg): home.jpg, and one for each
// chapter that has a README screenshot in docs/screenshots (1440 x 900): its top 1440 x 756, without
// the chapter bar, scaled to 1200 x 630. tools/crawlers.mjs names them in src/pages.js; a chapter
// without a screenshot takes home.jpg. The first chapter's address is /, so it takes home.jpg too.
// Archived chapters (hidden in index.html) get none.
//   node tools/og.mjs [key of the home image, default mr]
// Run it again after the screenshots change, then node tools/crawlers.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ORDER } from '../src/order.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const OUT = path.join(ROOT, 'assets', 'og');
const home = process.argv[2] || 'mr';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const keys = [...html.matchAll(/<article class="chapter[^"]*" id="ch-([a-z0-9]+)"([^>]*)>/g)].filter(([, k, a]) => k !== ORDER[0] && !/\shidden\b/.test(a)).map(([, k]) => k);
const card = (src, dst) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'crop=iw:iw*630/1200:0:0,scale=1200:630:flags=lanczos', '-q:v', '4', dst]);

fs.mkdirSync(OUT, { recursive: true });
const made = keys.filter((k) => fs.existsSync(path.join(SHOTS, `${k}.webp`)));
for (const k of made) card(path.join(SHOTS, `${k}.webp`), path.join(OUT, `${k}.jpg`));
card(path.join(SHOTS, `${home}.webp`), path.join(OUT, 'home.jpg'));
const kb = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) >> 10;
console.log(`wrote home.jpg (${home}) and ${made.length} chapter images, ${kb} KB; no screenshot: ${keys.filter((k) => !made.includes(k)).join(', ') || 'none'}`);
