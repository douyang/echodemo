// The load time of each chapter in headless Chromium: the time to the chapter's first image and
// to its ready(), the main thread blocked before then, and the bytes downloaded.
//   node tools/loadtime.mjs [--base=http://127.0.0.1:8790] [--net=none|fast|slow] [--warm]
//        [--fonts] [--json=out.json] [chapter keys...]   (all chapters when no key is given)
// Serve the repository root first: python3 -m http.server 8790
//   --net   fast: 20 Mb/s down, 40 ms round trip; slow: 9 Mb/s, 150 ms (a phone on 4G); none: as
//           the server gives it
//   --warm  load each chapter a second time in the same browser, from its cache
//   --fonts load the web fonts from Google (blocked by default: they are not the site's files)
// First image: the chapter's figure drew no "loading the heart model" note for 400 ms. Ready: the
// chapter's ready() holds as well, if it has one (stress: every case's volumes). Blocked: the sum
// over long tasks (over 50 ms) of their time beyond 50 ms, before ready. The CPU here is not a
// phone's: compare runs on one machine, not with a phone.
import fs from 'node:fs';
import { launch } from './video-page.mjs';
import { CHAPTERS } from '../src/chapters.js';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const base = arg('base', 'http://127.0.0.1:8790');
const net = arg('net', 'none');
const warm = process.argv.includes('--warm');
const fonts = process.argv.includes('--fonts');
const json = arg('json', '');
const NETS = {
  none: null,
  fast: { offline: false, latency: 40, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 },
  slow: { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 2e6 / 8 },
};
if (!(net in NETS)) throw new Error(`--net: none, fast or slow, not ${net}`);
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const keys = asked.length ? asked : CHAPTERS.map((c) => c.key);

// in the page before its own scripts: the loading notes drawn on each figure, and the long tasks
const INIT = () => {
  window.__lt = { notes: [], long: [] };
  const draw = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
    if (typeof text === 'string' && text.includes('loading the heart model')) {
      const fig = this.canvas && this.canvas.closest ? this.canvas.closest('figure') : null;
      window.__lt.notes.push([performance.now(), fig ? fig.id : '']);
    }
    return draw.call(this, text, ...rest);
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  } catch (e) { /* no long-task timing */ }
};

async function load(page, cdp, key) {
  let bytes = 0, requests = 0;
  const done = (e) => { bytes += e.encodedDataLength; requests++; };
  cdp.on('Network.loadingFinished', done);
  await page.goto('about:blank');
  await page.goto(`${base}/index.html#${key}`, { waitUntil: 'load', timeout: 120000 });
  const r = await page.evaluate(async (key) => {
    const { CHAPTERS } = await import('/src/chapters.js');
    const c = CHAPTERS.find((x) => x.key === key);
    const art = document.getElementById(`ch-${key}`);
    let shown = null, ready = null;
    for (let i = 0; i < 1200 && ready === null; i++) {
      const now = performance.now();
      const mine = window.__lt.notes.filter((n) => n[1] === `fig-${key}`);
      const last = mine.length ? mine[mine.length - 1][0] : 0;
      if (shown === null && art.classList.contains('is-active') && now - last > 400) shown = last || now;
      let ok = true;
      if (c.ready) { try { ok = !!c.ready(); } catch (e) { ok = false; } }
      if (shown !== null && ok) ready = now;
      else await new Promise((res) => setTimeout(res, 50));
    }
    const until = ready ?? performance.now();
    const blocked = window.__lt.long.filter(([s]) => s < until).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return { shown, ready, blocked };
  }, key);
  cdp.off('Network.loadingFinished', done);
  return { shown: r.shown, ready: r.ready, blocked: Math.round(r.blocked), kb: Math.round(bytes / 1024), requests };
}

const browser = await launch();
const rows = [];
const s = (ms) => (ms === null || ms === undefined ? '  –  ' : (ms / 1000).toFixed(2).padStart(5));
console.log(`${base} · network ${net}${warm ? ' · then from the cache' : ''}`);
console.log('chapter        first image  ready  blocked      KB  requests');
for (const key of keys) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // the fonts are blocked through CDP: a Playwright route would turn the HTTP cache off
  if (!fonts) {
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*fonts.googleapis.com*' }, { urlPattern: '*fonts.gstatic.com*' }] });
    cdp.on('Fetch.requestPaused', (e) => cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' }).catch(() => {}));
  }
  if (NETS[net]) await cdp.send('Network.emulateNetworkConditions', NETS[net]);
  for (const pass of warm ? ['cold', 'warm'] : ['cold']) {
    const r = { key, pass, net, ...(await load(page, cdp, key)) };
    rows.push(r);
    console.log(`${(pass === 'warm' ? `  ${key} (cache)` : key).padEnd(15)}${s(r.shown)}      ${s(r.ready)}  ${String(r.blocked).padStart(6)} ms ${String(r.kb).padStart(7)}  ${String(r.requests).padStart(5)}`);
  }
  if (errors.length) console.log(`  page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();
if (json) fs.writeFileSync(json, JSON.stringify(rows, null, 1));
