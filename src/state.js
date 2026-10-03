// One store for the whole page. Chapters read it; controls write it.
// Each chapter module declares its own keys in `defaults`; main.js merges them here.
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
