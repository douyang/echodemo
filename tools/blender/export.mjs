// Export the heart and the device of chapter M-TEER, T-TEER (--ch=tteer) or TAVR (--ch=tavr) for
// Blender (tools/blender/render.py).
//   node tools/blender/export.mjs --frames=video/out/mteer/frames.json --out=video/out/mteer/mesh
//   node tools/blender/export.mjs --ch=tteer --frames=video/out/tteer/frames.json --out=video/out/tteer/mesh
//   node tools/blender/export.mjs --ch=tavr --frames=stills --out=video/out/tavr/mesh_stills
// frames.json: [{ "name": "before", "s": 0, "t": 250 }, ...] (s: step position 0-7, t: ms in the
// beat). --frames=seq: the frames of the chapter videos (video/chapters.js MTEER_FRAMES), in
// systole, but in diastole while the clip crosses the open valve (s 3.15 to 3.35), and from
// systole to diastole as the arms close (s 4 to 5), so the double orifice shows open after it.
// --frames=stills: the chapter's stills (assets/<ch>/<step>.webp), one at each step: for the
// TEER chapters eight, in systole up to the grasp and in diastole from the assessment on; for
// TAVR six, in systole up to the check (its leaflets open) and in diastole after it (shut).
// Serve the repository root first: python3 -m http.server 8790. Writes, under --out, the
// topology (topo/), the positions of each frame (<name>/) and manifest.json, with the overlap
// check of each frame (export.js) that render.py reads before it renders.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ch = { tteer: 'tteer', tavr: 'tavr' }[arg('ch', 'mteer')] || 'mteer';
const framesFile = arg('frames', `video/out/${ch}/frames.json`), out = arg('out', `video/out/${ch}/mesh`);
const base = arg('base', 'http://127.0.0.1:8790');
const require = createRequire(process.env.PLAYWRIGHT_ROOT || import.meta.url);
const { chromium } = require('playwright');
/** The heart's time (ms) at step position s, for the video frames. */
function phase(s) {
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  if (s >= 3.15 && s <= 3.35) return 600;
  if (s <= 4) return 250;
  return Math.round(250 + 350 * smooth(Math.min(1, s - 4)));
}
const STILLS = {
  mteer: ['before', 'septum', 'steer', 'align', 'grasp', 'assess', 'release', 'after'],
  tteer: ['before', 'guide', 'steer', 'align', 'grasp', 'assess', 'release', 'after'],
  tavr: ['before', 'measure', 'cross', 'deploy', 'check', 'after'],
}[ch];
const seq = async () => {
  const F = (await import('../../video/chapters.js'))[`${ch.toUpperCase()}_FRAMES`];
  if (!F) throw new Error(`video/chapters.js has no ${ch.toUpperCase()}_FRAMES`);
  return F.at.map((s) => ({ name: `s${String(Math.round(s * 100)).padStart(3, '0')}`, s, t: phase(s) }));
};
const frames = framesFile === 'seq'
  ? await seq()
  : framesFile === 'stills'
    ? STILLS.map((name, s) => ({ name, s, t: s < 5 ? 250 : 600 }))
    : JSON.parse(fs.readFileSync(framesFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.exposeFunction('__save', (name, data) => {
  const f = path.join(out, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(data, 'base64'));
});
await page.goto(`${base}/tools/blender/export.html?ch=${ch}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const t0 = Date.now();
const res = await page.evaluate((f) => window.__run(f), frames);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(res, null, 1));
const hits = res.report.filter((r) => r.overlap.wallHits || r.overlap.leafHits);
console.log(`${res.report.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s; overlap hits in ${hits.length}`);
for (const r of hits) console.log(`  ${r.name}: wall ${r.overlap.wallHits} (min ${r.overlap.wallMin} cm), leaflets ${r.overlap.leafHits} (min ${r.overlap.leafMin} cm)`, JSON.stringify(r.overlap.parts));
await browser.close();
