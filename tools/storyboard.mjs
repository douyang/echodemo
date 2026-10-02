// A storyboard of a cut: the title card, one frame of each view and the end card, on one sheet.
//   node tools/storyboard.mjs --cut=A [--base=http://127.0.0.1:8790] [--out=video/out]
//   node tools/storyboard.mjs --ch=as       a chapter video: one frame of each step
//        [--video=video/out/echo-views-A.mp4]   take the frames from a rendered cut instead
//        [--moves]                              add the middle of each move between windows
//        [--theme=light|dark]
// Without --video the frames come straight from the page (each frame is a function of its time
// alone), so a cut can be boarded before it is rendered. Each view is shown late in its hold,
// once its tags are in. The sheet is laid out and captured in the same headless Chromium.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CUTS } from '../video/cuts.js';
import { VIDEOS, chapterLayout } from '../video/chapters.js';
import { layout, FPS, BEAT } from '../video/timeline.js';
import { CODE } from '../src/views.js';
import { launch, openCut, openChapter } from './video-page.mjs';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const cut = arg('cut', 'A').toUpperCase();
const base = arg('base', 'http://127.0.0.1:8790');
const out = arg('out', 'video/out');
const video = arg('video', '');
const theme = arg('theme', '');
const moves = process.argv.includes('--moves');
const ch = arg('ch', '').toLowerCase();
const V = ch ? VIDEOS[ch] : null;
if (ch && !V) throw new Error(`no chapter video ${ch}`);
const C = ch ? { aspect: '16:9', theme: 'dark', name: ch } : CUTS[cut];
if (!C) throw new Error(`no cut ${cut}`);
const L = ch ? chapterLayout(V) : layout(C);
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// the moments: the title, late in each hold, the middle of each move between windows, the end
const shots = [];
for (const s of L.segs) {
  if (s.kind === 'title') shots.push({ t: s.t0 + 0.75 * (s.t1 - s.t0), label: 'Title card' });
  if (s.kind === 'hold') shots.push({ t: s.t0 + Math.max(0.8, 0.72 * (s.t1 - s.t0)), label: `${String(s.i + 1).padStart(2, '0')}  ${ch ? '' : CODE[s.view]}`, step: ch ? s.i : null });
  if (s.kind === 'move' && s.cross && moves) shots.push({ t: (s.t0 + s.t1) / 2, label: `${CODE[s.from]} → ${CODE[s.to]}`, move: true });
  if (s.kind === 'end') shots.push({ t: s.t1 - 0.4, label: 'End card' });
}
for (const s of shots) s.i = Math.min(L.frames - 1, Math.round(s.t * FPS));

const browser = await launch();
const pngs = [];
if (video) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'story-'));
  for (const [k, s] of shots.entries()) {
    const f = path.join(tmp, `f${k}.png`);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (s.i / FPS).toFixed(3), '-i', video, '-frames:v', '1', f], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    pngs.push(fs.readFileSync(f));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
} else {
  const { info, frame, capture, errors, close } = ch ? await openChapter({ ch, base, browser }) : await openCut({ cut, base, theme, browser });
  if (info.capScale < 1) console.log(`captions scaled to ${(info.capScale * 100).toFixed(0)}% so the longest one fits its box`);
  if (ch) {
    // a step without a name of its own on the progress line goes by its caption
    C.title = `${info.num} · ${info.name}`;
    for (const s of shots) if (s.step != null) s.label = `${String(s.step + 1).padStart(2, '0')}  ${V.steps[s.step].track || info.caps[s.step].name}`;
  }
  for (const s of shots) {
    if (s.i > 0) await frame(s.i - 1);
    await frame(s.i);
    pngs.push(await capture('png'));
  }
  await close();
  if (errors.length) console.log(errors.join('\n'));
}

// the sheet
const vertical = C.aspect === '9:16';
const cols = Number(arg('cols', vertical ? 7 : 5));
const tw = vertical ? 232 : 360, th = vertical ? Math.round((tw * 16) / 9) : Math.round((tw * 9) / 16);
const gap = 14, pad = 36;
const sheetW = pad * 2 + cols * tw + (cols - 1) * gap;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wins = C.winMove != null ? `, ${C.winHold ?? C.hold} + ${C.winMove} across windows` : '';
const head = ch ? `Chapter ${C.title}` : `Cut ${cut} · ${C.name}`;
const sub = ch ? `16:9 · dark · ${V.steps.length} steps · ${mmss(L.duration)} (${L.duration.toFixed(1)} s, ${L.beats} beats at 70/min)`
  : `${C.aspect} · ${theme || C.theme} · ${C.views.length} views · ${mmss(L.duration)} (${L.duration.toFixed(1)} s, ${L.beats} beats at 70/min) · hold + move ${C.hold} + ${C.move} beats${wins} · captions ${C.caption}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Plex"; src: url("${base}/video/fonts/IBMPlexSans-400.woff2"); font-weight: 400; }
@font-face { font-family: "Plex"; src: url("${base}/video/fonts/IBMPlexSans-600.woff2"); font-weight: 600; }
body { margin: 0; background: #14181b; color: #e4e7e3; font: 400 14px/1.3 Plex, sans-serif; }
.sheet { width: ${sheetW}px; padding: ${pad - 8}px ${pad}px ${pad}px; box-sizing: border-box; }
h1 { margin: 0; font: 600 24px/1.2 Plex, sans-serif; }
p.sub { margin: 6px 0 22px; color: #9aa6ad; font-size: 15px; }
.grid { display: grid; grid-template-columns: repeat(${cols}, ${tw}px); gap: ${gap + 6}px ${gap}px; }
figure { margin: 0; }
img { display: block; width: ${tw}px; height: ${th}px; border-radius: 6px; box-shadow: 0 0 0 1px #2b343a; }
figcaption { margin-top: 6px; display: flex; justify-content: space-between; color: #b1bcc1; font-size: 13px; white-space: nowrap; }
figcaption b { font-weight: 600; color: #e4e7e3; }
.move figcaption b { color: #86b4e0; }
</style></head><body><div class="sheet"><h1>${esc(head)}</h1><p class="sub">${esc(sub)}</p><div class="grid">${shots.map((s, k) =>
  `<figure class="${s.move ? 'move' : ''}"><img src="data:image/png;base64,${pngs[k].toString('base64')}"><figcaption><b>${esc(s.label)}</b><span>${mmss(s.t)} · beat ${Math.floor(s.t / BEAT) + 1}</span></figcaption></figure>`).join('')}</div></div></body></html>`;
const page = await browser.newPage({ viewport: { width: sheetW, height: 600 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, ch ? `storyboard-chapter-${ch}.jpg` : `storyboard-${cut}${theme ? `-${theme}` : ''}.jpg`);
await page.screenshot({ path: file, type: 'jpeg', quality: 88, fullPage: true });
await browser.close();
console.log(`wrote ${file}: ${shots.length} frames`);
