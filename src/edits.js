// The ▲▼ buttons of the chapters whose text holds their calculations: the value one step from a
// measurement, the slider's place for a result, a flash on what changed, and a page that keeps a
// button under the pointer while the text above it changes height. Each chapter keeps its own
// inputs, formulas and grades; these helpers are the same in every one.
import { clamp } from './sketch.js';
import { reducedMotion } from './state.js';

/** x at d decimals, as a report gives it. */
export const round = (x, d) => Math.round(x * 10 ** d + 1e-7) / 10 ** d;

/** The value one step above (dir 1) or below (dir -1) x on the grid of I: { step, min, max, d }. */
export function stepOf(x, I, dir) {
  const n = dir > 0 ? Math.floor(x / I.step + 1e-6) + 1 : Math.ceil(x / I.step - 1e-6) - 1;
  return round(clamp(n * I.step, I.min, I.max), I.d ?? I.dp);
}

/**
 * The slider's place for result g: x if it lies in a band of g, else the middle of the nearest band
 * of g. bands: [{ a, b, g }] on 0 to 1, or a function that returns them (sev.js lazyBands); span:
 * the slider's value at 1; per: the slider's steps in 1.
 */
export function slideTo(x, g, bands, span = 1, per = 200) {
  const u = x / span, of = (typeof bands === 'function' ? bands() : bands).filter((b) => b.g === g);
  if (!of.length || of.some((b) => u >= b.a && (u < b.b || b.b === 1))) return x;
  const dist = (b) => (u < b.a ? b.a - u : u - b.b);
  const b = of.reduce((p, q) => (dist(q) < dist(p) ? q : p));
  return Math.round(((b.a + b.b) / 2) * span * per) / per;
}

/** The panel that scrolls el, if the layout gives it its own scroll; else null (the page scrolls). */
export const scroller = (el) => {
  const p = el.closest('.panel');
  return p && p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY !== 'visible' ? p : null;
};

/**
 * Run fn, which renders again, and keep btn where it was on screen: the live text (live, a
 * selector) keeps its tallest height, and the page or its panel scrolls by what btn moved.
 */
export function steady(live, btn, fn) {
  const el = document.querySelector(live);
  if (el) el.style.minHeight = `${Math.max(el.offsetHeight, parseFloat(el.style.minHeight) || 0)}px`;
  const y0 = btn?.getBoundingClientRect().top;
  fn();
  if (!btn || !btn.isConnected) return;
  const dy = btn.getBoundingClientRect().top - y0;
  if (Math.abs(dy) < 0.5) return;
  const p = scroller(btn);
  if (p) p.scrollTop += dy; else window.scrollBy(0, dy);
}

/** How long a flash shows (ms): the CSS animation of .is-flash and .is-cross. */
export const FLASH = 1200;
const timers = new WeakMap();
/** Run the CSS animation cls on el again from its start. */
export function flash(el, cls = 'is-flash') {
  if (!el || reducedMotion) return;
  el.classList.remove(cls);
  void el.offsetWidth;   // restart the animation
  el.classList.add(cls);
  const all = timers.get(el) || {};
  clearTimeout(all[cls]);
  all[cls] = setTimeout(() => el.classList.remove(cls), FLASH + 200);
  timers.set(el, all);
}
