// The valve hinges on the wall (src/gl/skirts.js), found once on the heart model and kept in
// assets/hinges.json, which the model loader (src/model3d.js) reads: the page then does not find
// them again (a few tenths of a second).
//   node tools/hinges.mjs [--base=http://127.0.0.1:8790]           write assets/hinges.json
//   node tools/hinges.mjs --check [--base=http://127.0.0.1:8790]   find them again and compare
// Serve the repository root first: python3 -m http.server 8790
//
// Run it again after a change to the heart or valve model, to the loader's changes to them
// (model3d.js prepare) or to skirts.js. The asset keeps a check of the meshes it was found on:
// on other meshes the loader finds the hinges again and warns in the console.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from './video-page.mjs';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const base = arg('base', 'http://127.0.0.1:8790');
const check = process.argv.includes('--check');
const OUT = fileURLToPath(new URL('../assets/hinges.json', import.meta.url));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// the loader finds the hinges again and does not read the asset
await page.addInitScript(() => { globalThis.__hingesCompute = true; });
// a chapter without the heart model, so that nothing else loads it first
await page.goto(`${base}/index.html#pulse`, { waitUntil: 'load' });
const data = await page.evaluate(async () => (await (await import('/src/model3d.js')).loadModel()).heart.hingeData);
await browser.close();
if (errors.length) throw new Error(`page errors: ${errors.slice(0, 3).join(' | ')}`);
if (!data || !data.skirts) throw new Error('the model returned no valve hinges');

const text = `${JSON.stringify(data)}\n`;
const sum = `${data.skirts.length} skirts, the tricuspid fit ${data.tricuspid ? `on ${data.tricuspid.moved} stations` : 'not needed'}, ${(text.length / 1024).toFixed(0)} KiB`;
if (check) {
  const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text;
  console.log(ok ? `ok: assets/hinges.json matches the model (${sum})` : 'assets/hinges.json differs from the model: run node tools/hinges.mjs');
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(OUT, text);
console.log(`wrote ${OUT}: ${sum}`);
