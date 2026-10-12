// Does every step's name fit its part of the progress line, in every chapter video?
//   node tools/track-fit.mjs [--ch=mi,tee] [--base=http://127.0.0.1:8790] [--jobs=2]
//        [--names]                       also list each name, its scrollWidth and its part
// For each chapter video (video/chapters.js: the main and the bonus chapters), the tool opens
// video/chapter.html?ch=<key> and waits for the page as the render does (window.__video.ready:
// the fonts are in, the names are set and the parts are sized, video/chapter.js). Then it
// measures each step's name on the progress line. A name whose scrollWidth is larger than its
// part runs past it, toward the next name, and the check fails. The check also fails if the
// face of the names (IBM Plex Sans 500, video/fonts) did not load, or if the parts overlap or
// leave the line.
// Serve the repository root first: python3 -m http.server 8790
import { KEYS, VIDEOS } from '../video/chapters.js';
import { launch, openChapter } from './video-page.mjs';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const base = arg('base', 'http://127.0.0.1:8790');
const jobs = Math.max(1, Number(arg('jobs', '2')));
const list = arg('ch', 'all');
const names = process.argv.includes('--names');
const keys = list === 'all' ? KEYS : list.split(',').map((k) => k.trim().toLowerCase());
for (const k of keys) if (!VIDEOS[k]) throw new Error(`no chapter video ${k} (video/chapters.js)`);

/** In the page: the face of the names, and each part of the progress line (px from its left) with its name. */
async function measure() {
  await document.fonts.ready;
  const face = [...document.fonts].find((f) => f.family.replace(/"/g, '') === 'IBM Plex Sans' && String(f.weight) === '500');
  const track = document.getElementById('track'), box = track.getBoundingClientRect();
  return {
    face: face ? face.status : 'not declared',
    width: box.width,
    parts: [...track.querySelectorAll('.win')].map((el) => {
      const r = el.getBoundingClientRect(), lab = el.querySelector('.lab');
      return { name: lab.textContent, x: r.left - box.left, w: r.width, sw: lab.scrollWidth, tw: lab.getBoundingClientRect().width };
    }),
  };
}

const px = (v) => `${Number(v.toFixed(1))} px`;
const browser = await launch();
const results = [];
let next = 0;
const lane = async () => {
  while (next < keys.length) {
    const k = keys[next++];
    const res = { k, problems: [] };
    results.push(res);
    try {
      const { page, info, errors, close } = await openChapter({ ch: k, base, browser });
      const m = await page.evaluate(measure);
      await close();
      Object.assign(res, { num: info.num, name: info.name, ...m, warnings: errors.length });
      if (m.face !== 'loaded') res.problems.push(`the face of the names is ${m.face}, not loaded`);
      if (m.parts.length !== VIDEOS[k].steps.length) res.problems.push(`${m.parts.length} parts for ${VIDEOS[k].steps.length} steps`);
      m.parts.forEach((p, i) => {
        if (p.sw > p.w) res.problems.push(`"${p.name}" ${p.sw} px > ${px(p.w)}`);
        const q = m.parts[i + 1];
        if (q && q.x < p.x + p.w - 0.05) res.problems.push(`the parts of "${p.name}" and "${q.name}" overlap`);
        if (p.x < -0.05 || p.x + p.w > m.width + 0.05) res.problems.push(`the part of "${p.name}" leaves the line`);
      });
    } catch (e) {
      res.problems.push(`the page failed: ${e.message.split('\n')[0]}`);
    }
    const P = res.parts || [], ws = P.map((p) => p.w);
    const sizing = !ws.length ? '' : Math.max(...ws) - Math.min(...ws) < 0.05 ? `parts ${px(ws[0])} (equal)` : `parts ${px(Math.min(...ws))} to ${px(Math.max(...ws))} (by name)`;
    // the space from the end of a name to the start of the next (its letter-spacing counts as name)
    const clear = P.slice(0, -1).map((p, i) => P[i + 1].x - (p.x + p.tw));
    const wide = P.reduce((a, p) => (!a || p.sw > a.sw ? p : a), null);
    console.log(`${res.k.padEnd(12)} ${String(res.num ?? '').padEnd(3)}`
      + (P.length ? ` ${String(P.length).padStart(2)} steps · ${sizing} · widest "${wide.name}" ${wide.sw} px` : '')
      + (clear.length ? ` · least space between names ${px(Math.min(...clear))}` : '')
      + (res.warnings ? ` · ${res.warnings} console warning(s)` : '')
      + (names && P.length ? `\n  ${P.map((p) => `"${p.name}" ${p.sw}/${Number(p.w.toFixed(1))}`).join(' · ')}` : '')
      + (res.problems.length ? `\n  FAIL: ${res.problems.join('; ')}` : ''));
  }
};
await Promise.all(Array.from({ length: Math.min(jobs, keys.length) }, lane));
await browser.close();

const bad = results.filter((r) => r.problems.length);
const wider = bad.reduce((a, r) => a + r.problems.filter((p) => p.startsWith('"')).length, 0);
console.log(bad.length ? `${bad.length} of ${results.length} chapter videos fail: ${bad.map((r) => r.k).join(', ')}; ${wider} step name(s) wider than their part`
  : `ok: every step name fits its part in the ${results.length} chapter videos`);
process.exit(bad.length ? 1 : 0);
