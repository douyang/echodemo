// Which state keys each chapter reads and writes, and whether any of them is another chapter's.
//   node tools/check-state.mjs
// A chapter owns the keys of its `defaults`. It may also use the keys that src/state.js shares
// (SHARED). The check reads each chapter's `watch` list and its source: `s.key`, `st.key` and
// `state.key` are reads, and the keys of `set({ ... })` are writes. A chapter that reads or writes
// a key that another chapter owns, and that SHARED does not name, fails the check: a setting in
// one chapter would then change another.
import { readdirSync, readFileSync } from 'node:fs';
import { SHARED } from '../src/state.js';

const dir = new URL('../src/ch/', import.meta.url);
const chapters = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  const m = (await import(new URL(f, dir))).default;
  const own = Object.keys(m.defaults || {});
  chapters.push({ file: f, key: m.key, own, watch: m.watch || own, src: readFileSync(new URL(f, dir), 'utf8') });
}
const owner = new Map();
for (const c of chapters) for (const k of c.own) owner.set(k, c.key);

let failed = 0;
for (const c of chapters) {
  const reads = new Set(c.watch.filter((k) => typeof k === 'string'));
  for (const [, k] of c.src.matchAll(/(?<![\w$.])(?:s|st|state)\.([A-Za-z_$][\w$]*)/g)) reads.add(k);
  const writes = new Set();
  for (const [, body] of c.src.matchAll(/\bset\(\{([^{}]*)\}/g)) {
    for (const [, k] of body.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) writes.add(k);
  }
  const foreign = (keys) => [...keys].filter((k) => owner.has(k) && owner.get(k) !== c.key);
  const used = [...new Set([...foreign(reads), ...foreign(writes)])];
  const wrong = used.filter((k) => !SHARED.includes(k));
  const shared = used.filter((k) => SHARED.includes(k)).map((k) => `${k} (${owner.get(k)})`);
  failed += wrong.length;
  console.log(`${c.key.padEnd(9)} ${String(c.own.length).padStart(2)} own keys`
    + (shared.length ? ` · shared: ${shared.join(', ')}` : '')
    + (wrong.length ? ` · ANOTHER CHAPTER'S: ${wrong.map((k) => `${k} (${owner.get(k)})`).join(', ')}` : ''));
}
console.log(failed ? `${failed} key(s) of another chapter: add them to SHARED in src/state.js, or keep them in their chapter` : 'ok: no chapter uses another chapter\'s key beyond SHARED');
process.exit(failed ? 1 : 0);
