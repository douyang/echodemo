// The video page (video/index.html) in headless Chromium, for tools/render-video.mjs and
// tools/storyboard.mjs. WebGL runs on SwiftShader; 2D canvases draw on the CPU.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { CUTS } from '../video/cuts.js';
import { SIZE } from '../video/timeline.js';

/** Playwright: a local install if there is one, else a global one. */
export async function playwright() {
  try { return await import('playwright'); } catch (e) { /* not installed here */ }
  const roots = [process.env.PLAYWRIGHT_ROOT, '/opt/node22/lib/node_modules/', '/usr/local/lib/node_modules/', '/usr/lib/node_modules/'].filter(Boolean);
  for (const r of roots) {
    try { return createRequire(r.endsWith('/') ? r : `${r}/`)('playwright'); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found: npm i playwright, or set PLAYWRIGHT_ROOT to the folder that holds it');
}

const EXE = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--disable-accelerated-2d-canvas', '--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'];

export async function launch() {
  const { chromium } = await playwright();
  return chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ARGS });
}

/**
 * Open a cut: { browser, page, info, frame(i), capture(format) , errors }. info comes from
 * window.__video.ready (frames, fps, duration, width, height, segs).
 */
export async function openCut({ cut, base, theme = '', browser = null }) {
  return openPage(`${base}/video/index.html?cut=${cut}${theme ? `&theme=${theme}` : ''}`, SIZE[CUTS[cut].aspect], browser);
}

/**
 * Open a chapter video (video/chapter.html?ch=key), 16:9: the same handles. Its frames come in
 * order (video/chapter.js): frame(i) runs the chapter's motion up to frame i first.
 */
export async function openChapter({ ch, base, browser = null }) {
  return openPage(`${base}/video/chapter.html?ch=${ch}`, SIZE['16:9'], browser);
}

async function openPage(url, [W, H], browser) {
  const own = !browser;
  browser = browser || await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  const info = await page.evaluate(() => window.__video.ready);
  const cdp = await page.context().newCDPSession(page);
  const capture = async (format = 'jpeg') => Buffer.from((await cdp.send('Page.captureScreenshot',
    format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 95, optimizeForSpeed: true })).data, 'base64');
  const frame = (k) => page.evaluate((i) => window.__video.frame(i), k);
  const close = () => (own ? browser.close() : page.close());
  return { browser, page, info, capture, frame, errors, close };
}
