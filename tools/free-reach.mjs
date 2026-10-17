// The free probe of Views (src/ch/windows.js) takes every view to every view the panel can name:
// for each heart, from each view, the controls that put the probe on each view with a plane of
// its own, and a check that they lie within the sliders' ranges (index.html), that the pose they
// give lies on that view, and that with each slider at its nearest step the panel still names
// the view: within 4 degrees and 0.4 cm (its 'on' is 5 and 0.5). The slides bring the probe's
// point of contact to where the view's beam enters the skin (Gauss-Newton on the two slides); the
// turns are the view's against the frame the slide carried, on whichever of the two sets of turns
// the ranges hold.
//   node tools/free-reach.mjs [--base=http://127.0.0.1:8790]
// Serve the repository root first: python3 -m http.server 8790
// Run it after a change to the views' planes (src/echo.js viewGeometry), the torso
// (src/torso.js), the free probe (src/freeprobe.js) or the sliders' ranges.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from './video-page.mjs';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const base = arg('base', 'http://127.0.0.1:8790');
const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
// each slider's [min, max, step]
const RANGE = Object.fromEntries(['wRot', 'wTilt', 'wRock', 'wSlide', 'wAcross'].map((k) => {
  const m = html.match(new RegExp(`id="${k}"[^>]*min="(-?[\\d.]+)" max="(-?[\\d.]+)" step="([\\d.]+)"`));
  if (!m) throw new Error(`index.html: no range for ${k}`);
  return [k, [Number(m[1]), Number(m[2]), Number(m[3])]];
}));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// a chapter without the heart model, so that nothing else loads it first
await page.goto(`${base}/index.html#pulse`, { waitUntil: 'load' });
const res = await page.evaluate(async (RANGE) => {
  const M3 = await import('/src/model3d.js');
  const { PHENOS } = await import('/src/pheno.js');
  const { VIEWS, PLANE_VIEWS } = await import('/src/views.js');
  const { viewGeometry } = await import('/src/echo.js');
  const F = await import('/src/freeprobe.js');
  const T = await import('/src/torso.js');
  const m3 = await M3.loadModel();
  const skin = new T.Skin(T.placeTorso(m3.heart.meshes.Myocardium, m3.anat.normal()));
  const deg = (x) => (x * 180) / Math.PI, cl = (x) => Math.max(-1, Math.min(1, x));
  const inside = (k, v) => v >= RANGE[k][0] - 1e-9 && v <= RANGE[k][1] + 1e-9;
  const out = {};
  for (const ph of Object.keys(PHENOS)) {
    M3.setPheno(ph);
    for (let i = 0; m3.pheno.key !== ph; i++) {
      if (i > 1200) throw new Error(`no ${ph} heart`);
      await new Promise((r) => setTimeout(r, 100));
    }
    const G = {};
    for (const k of Object.keys(VIEWS)) { const g = viewGeometry(m3.anat, k); if (g) G[k] = g; }
    const entry = new Map(Object.entries(G).map(([k, g]) => [k, F.entryOf(g, skin)]));
    const fails = [], most = { wRot: 0, wTilt: 0, wRock: 0, wSlide: 0, wAcross: 0 }, worst = { beam: 0, cm: 0 };
    let pairs = 0;
    for (const bk of Object.keys(G)) {
      const b = G[bk];
      // the panel's candidates and their depths (windows.js freeGeom)
      const views = [...new Set([bk, ...PLANE_VIEWS])].filter((k) => G[k]).map((k) => ({ g: G[k], s: entry.get(k).s }));
      const depth = (E, d, s0) => F.arrivalDepth(E, d, s0, views);
      const C0 = entry.get(bk).E, N = skin.normal(C0, C0.clone());
      const e1 = b.r.clone().addScaledVector(N, -b.r.dot(N)).normalize(), e2 = N.clone().cross(e1);
      if (e2.dot(b.n) < 0) e2.negate();
      for (const gk of PLANE_VIEWS) {
        if (gk === bk || !G[gk]) continue;
        pairs++;
        const g = G[gk], Eg = entry.get(gk).E;
        const miss = (s, a) => F.overSkin(b, s, a, skin).E.sub(Eg);
        // the slides: from the straight line between the two points, then Gauss-Newton
        const dv = Eg.clone().sub(C0);
        let s = dv.dot(e1), a = dv.dot(e2), m = miss(s, a);
        for (let it = 0; it < 60 && m.length() > 1e-4; it++) {
          const h = 0.02, ms = miss(s + h, a).sub(m).divideScalar(h), ma = miss(s, a + h).sub(m).divideScalar(h);
          const A = ms.dot(ms), B = ms.dot(ma), D = ma.dot(ma), u = -ms.dot(m), v = -ma.dot(m), det = A * D - B * B;
          if (Math.abs(det) < 1e-12) break;
          let ds = (D * u - B * v) / det, da = (A * v - B * u) / det;
          const l = Math.hypot(ds, da);
          if (l > 4) { ds *= 4 / l; da *= 4 / l; }
          s += ds;
          a += da;
          m = miss(s, a);
        }
        // the turns against the carried frame: rotate, tilt (within 90 degrees), rock; or the other
        // set (rotate + 180, 180 - tilt, rock + 180)
        const f = F.overSkin(b, s, a, skin);
        const t1 = deg(Math.asin(cl(-f.d.dot(g.n)))), r1 = deg(Math.atan2(f.r.dot(g.n), f.n.dot(g.n))), k1 = deg(-Math.atan2(f.d.dot(g.r), f.d.dot(g.d)));
        const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
        const sets = [[r1, t1, k1], [wrap(r1 + 180), t1 >= 0 ? 180 - t1 : -180 - t1, wrap(k1 + 180)]];
        const c = { wSlide: s, wAcross: a };
        const fit = sets.find(([r, t, k]) => inside('wRot', r) && inside('wTilt', t) && inside('wRock', k));
        const [rot, tilt, rock] = fit || sets[0];
        Object.assign(c, { wRot: rot, wTilt: tilt, wRock: rock });
        for (const k of Object.keys(most)) most[k] = Math.max(most[k], Math.abs(c[k]));
        const p = F.freePose(b, { rot, tilt, rock, slide: s, across: a }, skin, depth), q = F.poseGap(p, g);
        // the sliders at their nearest steps
        const st = (k, v) => Math.round(v / RANGE[k][2]) * RANGE[k][2];
        const pr = F.freePose(b, { rot: st('wRot', rot), tilt: st('wTilt', tilt), rock: st('wRock', rock), slide: st('wSlide', s), across: st('wAcross', a) }, skin, depth), qr = F.poseGap(pr, g);
        const ok = fit && inside('wSlide', s) && inside('wAcross', a) && q.beam < 0.5 && q.marker < 0.5 && q.cm < 0.05 && Math.abs(q.along) <= F.ALONG
          && qr.beam <= 4 && qr.marker <= 4 && qr.cm <= 0.4 && Math.abs(qr.along) <= F.ALONG;
        worst.beam = Math.max(worst.beam, qr.beam, qr.marker);
        worst.cm = Math.max(worst.cm, qr.cm);
        if (!ok) fails.push(`${bk} -> ${gk}: ${Object.entries(c).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}; beam ${q.beam.toFixed(2)}°, marker ${q.marker.toFixed(2)}°, ${q.cm.toFixed(2)} cm off its beam, ${q.along.toFixed(1)} cm along it; at the steps ${Math.max(qr.beam, qr.marker).toFixed(1)}°, ${qr.cm.toFixed(2)} cm`);
      }
    }
    out[ph] = { pairs, fails, most, worst };
  }
  M3.setPheno('normal');
  return out;
}, RANGE);
await browser.close();
if (errors.length) throw new Error(`page errors: ${errors.slice(0, 3).join(' | ')}`);

let bad = 0;
const fmt = (most) => Object.entries(most).map(([k, v]) => `${k} ${v.toFixed(1)} of ${Math.max(Math.abs(RANGE[k][0]), RANGE[k][1])}`).join(', ');
for (const [ph, r] of Object.entries(res)) {
  bad += r.fails.length;
  console.log(`${ph}: ${r.pairs - r.fails.length} of ${r.pairs} moves reach their view; largest ${fmt(r.most)}; at the sliders' steps, within ${r.worst.beam.toFixed(1)}° and ${r.worst.cm.toFixed(2)} cm`);
  for (const f of r.fails.slice(0, 10)) console.log(`  ${f}`);
}
console.log(bad ? `${bad} moves fail` : 'ok: every view reaches every view the panel names, in every heart');
process.exit(bad ? 1 : 0);
