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

// ---------------------------------------------------------------- typed measurements
// A chapter that holds its calculations shows each measurement as a field: a number can be typed
// there as well as stepped with ▲▼. The chapter applies it as it applies a step.

/**
 * The field of measurement k: an input that shows the number, `w` characters wide. label: its
 * name for a screen reader, with the unit.
 */
export const field = (k, label, w = 4) => `<input class="ase-in" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" spellcheck="false" data-k="${k}" aria-label="${label}" style="--w:${w}">`;

/** The characters that the widest number of limits I ({ min, max, d }) takes. */
export const fieldWidth = (I) => Math.max(2, String(Math.trunc(Math.max(Math.abs(I.max), Math.abs(I.min)))).length + (I.d ? I.d + 1 : 0) + (I.min < 0 ? 1 : 0));

/** Show s in field f, unless a number is being typed there. */
export function showField(f, s) {
  if (f && !(document.activeElement === f && f.dataset.dirty) && f.value !== s) f.value = s;
}

/**
 * A typed number for limits L ({ min, max, d }): rounded to d decimals and held within the limits.
 * null for no number. limit: 'upper' or 'lower' when the number lay beyond that limit.
 */
export function typedValue(text, L) {
  const s = String(text).trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)/.test(s)) return null;
  const x = parseFloat(s);
  if (!Number.isFinite(x)) return null;
  const to = round(clamp(x, L.min, L.max), L.d);
  return { to, limit: x > L.max + 1e-9 ? 'upper' : x < L.min - 1e-9 ? 'lower' : '' };
}

/**
 * The fields of a diagram in host. A typed number applies on Enter or when its field loses the
 * focus: apply(k, text, field). Escape restores the number. ↑ and ↓ step it as ▲▼ do:
 * step(k, dir, field).
 */
export function bindFields(host, { apply, step }) {
  const of = (e) => e.target.closest?.('input.ase-in');
  host.addEventListener('focusin', (e) => {
    const f = of(e);
    if (!f) return;
    f.dataset.was = f.value;
    requestAnimationFrame(() => { if (document.activeElement === f) f.select(); });
  });
  // a field is being typed in from the first key: a keystroke can stop the chapter's own sequence
  // (main.js hold, on input), and the page that renders then must not write over the field
  for (const type of ['beforeinput', 'input']) host.addEventListener(type, (e) => { const f = of(e); if (f) f.dataset.dirty = '1'; });
  host.addEventListener('keydown', (e) => {
    const f = of(e);
    if (!f) return;
    if (e.key === 'Enter') { e.preventDefault(); f.blur(); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      delete f.dataset.dirty;
      f.value = f.dataset.was ?? f.value;
      f.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (f.dataset.dirty) { delete f.dataset.dirty; apply(f.dataset.k, f.value, f); }
      else step(f.dataset.k, e.key === 'ArrowUp' ? 1 : -1, f);
    }
  });
  host.addEventListener('focusout', (e) => {
    const f = of(e);
    if (!f || !f.dataset.dirty) return;
    delete f.dataset.dirty;
    apply(f.dataset.k, f.value, f);
  });
}
