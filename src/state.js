// One store for the whole page. Chapters read it; controls write it.
// Each chapter module declares its own keys in `defaults`; main.js merges them here.
// A chapter's sliders, buttons and Play write its own keys, and no other chapter reads them, so a
// setting in one chapter does not change another. Each disease page is a one-slider model that
// keeps its numbers in their guideline grades; no model here computes two lesions together.
// SHARED names the keys that several chapters read: the open chapter, the two Play states and
// the heart of the Heart menu (every chapter shows it and opens at its values, pheno.js).
// tools/check-state.mjs fails when a chapter reads another chapter's key that SHARED does not name.
export const SHARED = ['chapter', 'playing', 'anim', 'pheno'];

const listeners = new Set();

export const state = {
  chapter: 0,
  playing: false,   // the tour through all chapters is running
  anim: false,      // the open chapter plays its own sequence (main.js), with the tour paused
};

export function declare(defaults) {
  for (const [k, v] of Object.entries(defaults)) if (!(k in state)) state[k] = v;
}

export function set(patch) {
  const changed = {};
  let any = false;
  for (const k in patch) {
    if (state[k] !== patch[k]) { state[k] = patch[k]; changed[k] = patch[k]; any = true; }
  }
  if (!any) return;
  for (const fn of listeners) fn(state, changed);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
