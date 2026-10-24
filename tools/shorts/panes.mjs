// The echo panes of a chapter video, cropped for a vertical reel (tools/shorts/compose.py).
//   node tools/shorts/panes.mjs --ch=tteer --spec=video/out/shorts/tteer/panes.json --out=video/out/shorts/tteer/panes
// The chapter video (video/chapter.html) steps its frames in order (its motion runs forward only);
// at the frames that the spec asks for, the tool crops boxes of the chapter's figure (the chapter
// module's paneBoxes) and writes them as JPEG sequences, with the step position s of each frame.
// spec (compose.py plan writes it): { panes: [{ name, step, from: 'move' | 'hold', dur (s), show:
// ['b', 'c'] }] }. A clip starts at the move into its step ('move', the hold for step 0) and stops
// at the end of the step's hold; compose.py loops the hold's last heartbeats when a beat is longer.
// Serve the repository root first (port 8790).
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../video-page.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ch = arg('ch', 'tteer'), out = arg('out', `video/out/shorts/${ch}/panes`), base = arg('base', 'http://127.0.0.1:8790');
const spec = JSON.parse(fs.readFileSync(arg('spec', `video/out/shorts/${ch}/panes.json`), 'utf8'));
const DPR = Number(arg('dpr', '2')), Q = Number(arg('quality', '92'));
fs.mkdirSync(out, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${base}/video/chapter.html?ch=${ch}`, { waitUntil: 'load' });
const info = await page.evaluate(() => window.__video.ready);
const fps = info.fps;
const segs = await page.evaluate(() => window.__video.layout.segs.map((s) => ({ kind: s.kind, i: s.i ?? null, from: s.from ?? null, to: s.to ?? null, t0: s.t0, t1: s.t1 })));
const holds = segs.filter((s) => s.kind === 'hold'), moves = segs.filter((s) => s.kind === 'move');
// the figure canvas's place on the page (CSS px), and the chapter's boxes in it
const geo = await page.evaluate(async (key) => {
  const c = document.querySelector('canvas.fig-canvas') || document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const m = await import(`/src/ch/${key}.js`);
  return { x: r.x, y: r.y, w: r.width, h: r.height, boxes: m.paneBoxes(r.width, r.height) };
}, ch);
console.log(`video ${info.frames} frames at ${fps} fps; figure ${geo.w.toFixed(0)} x ${geo.h.toFixed(0)} px at ${geo.x.toFixed(0)},${geo.y.toFixed(0)}`);
/** The step position at video time u (s): the hold's step, or eased across a move (video/chapter.js scriptAt). */
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
function sAt(u) {
  const s = segs.find((g) => u >= g.t0 - 1e-9 && u < g.t1 - 1e-9) || segs[segs.length - 1];
  if (s.kind === 'hold') return s.i;
  if (s.kind === 'move') return s.from + ease((u - s.t0) / (s.t1 - s.t0));
  return s.kind === 'title' ? 0 : holds.length - 1;
}
// every frame to capture, by frame number
const want = new Map(), clips = [];
for (const s of spec.panes) {
  const h = holds[s.step];
  if (!h) throw new Error(`no step ${s.step}`);
  const t0 = s.from === 'move' && s.step > 0 ? moves[s.step - 1].t0 : h.t0;
  const i0 = Math.round(t0 * fps), i1 = Math.min(Math.round((t0 + s.dur) * fps), Math.round(h.t1 * fps));
  clips.push({ ...s, t0, i0, n: i1 - i0, s: [...Array(i1 - i0).keys()].map((k) => Number(sAt((i0 + k) / fps).toFixed(4))), holdFrom: Math.round(h.t0 * fps) - i0 });
  for (let i = i0; i < i1; i++) {
    if (!want.has(i)) want.set(i, []);
    want.get(i).push({ s, k: i - i0 });
  }
  for (const p of s.show) fs.mkdirSync(path.join(out, `${s.name}_${p}`), { recursive: true });
}
const last = Math.max(...want.keys());
const t0 = Date.now();
for (let i = 0; i <= last; i++) {
  await page.evaluate((k) => window.__video.frame(k), i);
  const jobs = want.get(i);
  if (!jobs) continue;
  for (const { s, k } of jobs) {
    for (const p of s.show) {
      const b = geo.boxes[p];
      await page.screenshot({ path: path.join(out, `${s.name}_${p}`, `${String(k + 1).padStart(4, '0')}.jpg`), type: 'jpeg', quality: Q, clip: { x: geo.x + b.x, y: geo.y + b.y, width: b.w, height: b.h } });
    }
  }
  if (i % 150 === 0) console.log(`frame ${i}/${last} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
fs.writeFileSync(path.join(out, 'panes.json'), JSON.stringify({ fps, dpr: DPR, boxes: geo.boxes, segs, clips }, null, 1));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
