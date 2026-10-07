// The LV volumes of the stress echocardiography cases (src/ch/stress.js), measured on the heart
// mesh for every heart the header can show, into the table that the chapter reads (src/stresscal.js).
//   node tools/stress-volumes.mjs [--base=http://127.0.0.1:8790]           write src/stresscal.js
//   node tools/stress-volumes.mjs --check [--base=http://127.0.0.1:8790]   measure again and compare
// Serve the repository root first: python3 -m http.server 8790
//
// The chapter measures as before the table: the LV traced on the four- and two-chamber views cut
// from the mesh at end-diastole and at end-systole, and the biplane method of disks (its
// measureAll()). Run it again after a change to the mesh, the hearts, the cases or the tracing;
// --check fails when a value in the table differs from the measurement by more than its rounding.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from './video-page.mjs';
import { PHENOS } from '../src/pheno.js';
import { STRESS_VOLUMES } from '../src/stresscal.js';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const base = arg('base', 'http://127.0.0.1:8790');
const check = process.argv.includes('--check');
const OUT = fileURLToPath(new URL('../src/stresscal.js', import.meta.url));
const DP = 3;   // decimals kept: the chapter prints whole mL and %, and compares the LVEFs

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// a chapter without the heart model, so that the stress chapter measures nothing of its own
await page.goto(`${base}/index.html#pulse`, { waitUntil: 'load' });
const table = {};
for (const heart of Object.keys(PHENOS)) {
  const t0 = Date.now();
  const got = await page.evaluate(async (heart) => {
    const M = await import('/src/model3d.js');
    const S = await import('/src/ch/stress.js');
    const m = await M.loadModel();
    M.setPheno(heart);
    for (let i = 0; m.pheno.key !== heart; i++) {
      if (i > 1200) throw new Error(`the ${heart} heart did not load`);
      await new Promise((r) => setTimeout(r, 100));
    }
    return S.measureAll();
  }, heart);
  if (got.heart !== heart) throw new Error(`measured the ${got.heart} heart, not ${heart}`);
  table[heart] = got.volumes;
  console.log(`${heart}: ${Object.keys(got.volumes).length} cases in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
await browser.close();
if (errors.length) throw new Error(`page errors: ${errors.slice(0, 3).join(' | ')}`);

const r = (x) => Number(x.toFixed(DP));
if (check) {
  let bad = 0;
  for (const [heart, cases] of Object.entries(table)) {
    for (const [c, stages] of Object.entries(cases)) {
      for (const [stage, v] of Object.entries(stages)) {
        for (const q of ['edv', 'esv', 'ef']) {
          const want = STRESS_VOLUMES[heart]?.[c]?.[stage]?.[q];
          if (want === undefined || Math.abs(want - v[q]) > 0.6 * 10 ** -DP) {
            bad++;
            console.log(`differs: ${heart} ${c} ${stage} ${q}: table ${want}, measured ${r(v[q])}`);
          }
        }
      }
    }
  }
  console.log(bad ? `${bad} value(s) differ: run node tools/stress-volumes.mjs to write the table again` : 'ok: the table matches the mesh');
  process.exit(bad ? 1 : 0);
}

const lines = [];
for (const [heart, cases] of Object.entries(table)) {
  lines.push(`  ${heart}: {`);
  for (const [c, stages] of Object.entries(cases)) {
    lines.push(`    ${c}: {`);
    for (const [k, v] of Object.entries(stages)) lines.push(`      ${k}: { edv: ${r(v.edv)}, esv: ${r(v.esv)}, ef: ${r(v.ef)} },`);
    lines.push('    },');
  }
  lines.push('  },');
}
fs.writeFileSync(OUT, `// The LV volumes of the stress echocardiography cases (ch/stress.js), measured on the heart mesh
// as the chapter measures them: the LV traced on the four- and two-chamber views at end-diastole
// and at end-systole (meshtrace.js), and the biplane method of disks. By heart (pheno.js), case
// and stage: the end-diastolic and end-systolic volumes (mL) and the LVEF (%). The cuts take
// seconds on the page, so the chapter reads them here. Written by tools/stress-volumes.mjs;
// \`node tools/stress-volumes.mjs --check\` measures them again and fails when they differ.
export const STRESS_VOLUMES = {
${lines.join('\n')}
};
`);
console.log(`wrote ${OUT}`);
