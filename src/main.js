// The page engine: chapters, controls, readouts, live sentences, citations, dialogs, tour.
import { state, set, subscribe, declare, reducedMotion } from './state.js';
import { REFS } from './refs.js';
import { CHAPTERS, PARTS } from './chapters.js';
import { NORM_TABLES } from './norms.js';
import { QUIZ } from './quiz.js';
import { PHENOS, PHENO_STORE, presetsFor, PRESET_KEYS } from './pheno.js';
import { setPheno, onPheno, onPhenoBusy } from './model3d.js';
import { setHeart } from './echo2d.js';
import { JETS } from './jets.js';
import { canPlay, setMusic, follow, cue } from './music.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEYS = CHAPTERS.map((c) => c.key);
// old addresses: 08 Planes is archived (chapters.js), and #views names 07 Views (key windows)
const ALIAS = { planes: 'windows', views: 'windows' };
/** The chapter index of an address's #key, or -1. */
const chapterOf = (hash) => { const h = (hash || '').slice(1); return KEYS.indexOf(ALIAS[h] || h); };
const CH = Object.fromEntries(KEYS.map((k, i) => [k, i]));

// a chapter article left out of CHAPTERS (the report, chapters.js) stays hidden, its citations unnumbered
for (const a of $$('article.chapter')) a.hidden = !KEYS.includes(a.id.replace(/^ch-/, ''));
for (const c of CHAPTERS) if (c.defaults) declare(c.defaults);
declare({ pheno: 'normal' });   // the heart every chapter shows (pheno.js)

// ---------------------------------------------------------------- theme
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
};
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
const sheets = {};
function applyTheme(mode) {
  if (mode) document.documentElement.dataset.theme = mode;
  $('#theme-label').textContent = currentTheme() === 'dark' ? 'Paper' : 'Slate';
  for (const sh of Object.values(sheets)) sh?.retheme?.();   // a 3D chapter's figure() returns null
  for (const c of CHAPTERS) c.retheme?.();
  dirtyAll();
}
$('#btn-theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  store.set('heart-in-sound-theme', next);
  applyTheme(next);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

// ---------------------------------------------------------------- sound (music.js): off until clicked
const musicBtn = $('#btn-music');
if (!canPlay) musicBtn.hidden = true;
musicBtn.addEventListener('click', async () => {
  const want = musicBtn.getAttribute('aria-pressed') !== 'true';
  musicBtn.setAttribute('aria-pressed', String(want));
  const on = await setMusic(want);
  if (on !== want) musicBtn.setAttribute('aria-pressed', String(on));
});
// cues for changes on screen: a new chapter; a new view, set of views or heart, or any switch or
// tick box (bindControls adds their keys; the grades of a playing severity page ring from sev.js)
const BELL_KEYS = new Set(['view', 'pfocus', 'pviews', 'pheno']);
subscribe((s, ch) => {
  if ('chapter' in ch) cue('chapter');
  else if (Object.keys(ch).some((k) => BELL_KEYS.has(k))) cue('bell');
});

// ---------------------------------------------------------------- citations
function numberCitations() {
  const order = [];
  const index = new Map();
  for (const sup of $$('.cite[data-ref]')) {
    if (sup.closest('[hidden]')) continue;
    const ids = sup.dataset.ref.split(',').map((s) => s.trim());
    const nums = ids.map((id) => {
      if (!REFS[id]) console.warn('missing reference', id);
      if (!index.has(id)) { index.set(id, order.length + 1); order.push(id); }
      return index.get(id);
    });
    sup.innerHTML = nums.map((n) => `<a href="#ref-${n}" data-refn="${n}" aria-label="Source ${n}">${n}</a>`).join(',');
  }
  $('#reflist').innerHTML = order.map((id, i) => {
    const r = REFS[id] || { text: id };
    const links = [];
    if (r.doi) links.push(`<a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">doi:${esc(r.doi)}</a>`);
    if (r.pmid) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(r.pmid)}/" target="_blank" rel="noopener">PMID ${esc(r.pmid)}</a>`);
    if (r.url) links.push(`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(new URL(r.url).hostname.replace(/^www\./, ''))}</a>`);
    return `<li id="ref-${i + 1}">${esc(r.text)} <span class="ids">${links.join(' · ')}</span></li>`;
  }).join('');
  return index;
}
let refIndex = new Map();
/** Citation markup for text built at run time (live sentences, report). */
export function cite(ids) {
  const nums = ids.split(',').map((id) => refIndex.get(id.trim())).filter(Boolean);
  if (!nums.length) return '';
  return `<sup class="cite">${nums.map((n) => `<a href="#ref-${n}" data-refn="${n}" aria-label="Source ${n}">${n}</a>`).join(',')}</sup>`;
}

function openDialog(id) {
  const d = document.getElementById(id);
  set({ playing: false });
  if (!d.open) d.showModal();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-refn]');
  if (a) {
    e.preventDefault();
    openDialog('dlg-refs');
    const li = document.getElementById(`ref-${a.dataset.refn}`);
    if (li) {
      li.scrollIntoView({ block: 'center' });
      li.style.background = 'color-mix(in srgb, var(--accent) 14%, transparent)';
      setTimeout(() => { li.style.background = ''; }, 1600);
    }
    return;
  }
  const dl = e.target.closest('button[data-dialog]');
  if (dl) { openDialog(dl.dataset.dialog); return; }
  const go = e.target.closest('a[data-go]');
  if (go) { e.preventDefault(); goChapter(CH[go.dataset.go] ?? Number(go.dataset.go)); return; }
  if (e.target.matches('[data-close]')) e.target.closest('dialog').close();
});
for (const d of $$('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
$('#btn-refs').addEventListener('click', () => openDialog('dlg-refs'));
$('#btn-norms').addEventListener('click', () => openDialog('dlg-norms'));   // hidden; the report chapter opens it
$('#btn-about')?.addEventListener('click', () => openDialog('dlg-about'));

// ---------------------------------------------------------------- the heart shown
// The note under the title that described the chosen heart is off: the Heart menu names it, and
// the menu is busy while a heart is built. The note's code and markup stay (#pheno-note).
const SHOW_HEART_NOTE = false;
const phenoSel = $('#pheno');
let building = false;   // a disease heart is being built (model3d.js)
/** The chapters' starting values for heart k: its presets, and every other preset key back at its default. */
function phenoPatch(k) {
  const patch = {};
  for (const name of PRESET_KEYS) {
    const c = CHAPTERS.find((ch) => ch.defaults && name in ch.defaults);
    if (c) patch[name] = c.defaults[name];
  }
  return { ...patch, ...presetsFor(k) };
}
function choosePheno(k) {
  if (!PHENOS[k]) k = 'normal';
  store.set(PHENO_STORE, k);
  set({ pheno: k, ...phenoPatch(k), playing: false, anim: false });
}
function showPheno() {
  const k = state.pheno, P = PHENOS[k];
  phenoSel.value = k;
  const pick = phenoSel.closest('.heart-pick');
  pick.classList.toggle('is-disease', k !== 'normal');
  pick.setAttribute('aria-busy', String(building));
  const note = $('#pheno-note');
  note.hidden = !SHOW_HEART_NOTE || k === 'normal';
  if (!note.hidden) note.innerHTML = `<b>${esc(P.long)}.</b> ${esc(P.note || '')} ${building ? '<span class="pheno-busy">Building the heart…</span>' : 'Each chapter opens at this heart\'s values.'}`;
}
onPhenoBusy((b) => { building = b; showPheno(); });
phenoSel.addEventListener('change', () => choosePheno(phenoSel.value));
// the 3D heart and the echo views take a new heart when it is built: draw them again
onPheno(() => dirtyAll());

function fillNorms() {
  $('#norms-body').innerHTML = NORM_TABLES.map((t) => `
    <div class="table-wrap"><table class="vt">
      <caption>${esc(t.title)}</caption>
      <thead><tr>${t.head.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table><p class="note">${esc(t.note || '')} <span class="cite" data-ref="${t.ref}"></span></p></div>`).join('');
}

// ---------------------------------------------------------------- controls
// Generic bindings, declared in the markup:
//   <input type="range" data-key="freq">          number
//   <div class="seg" data-key="mode"><button data-val="pw">  value (numbers parse)
//   <input type="checkbox" data-key="cine">       boolean
//   <input type="number" data-key="E">            number (calculator fields)
//   <output data-for="freq" data-dp="1">           formatted value
const parse = (v) => (v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
function bindControls() {
  // controls of one color Doppler format (jets.js) show only in that format
  for (const el of $$('[data-jets]')) el.hidden = el.dataset.jets !== JETS;
  for (const el of $$('input[type="range"][data-key]')) {
    el.addEventListener('input', () => set({ [el.dataset.key]: Number(el.value), playing: false, anim: false }));
  }
  for (const g of $$('.seg[data-key]')) {
    BELL_KEYS.add(g.dataset.key);
    g.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (b) set({ [g.dataset.key]: parse(b.dataset.val), playing: false, anim: false });
    });
  }
  for (const el of $$('input[type="checkbox"][data-key]')) {
    BELL_KEYS.add(el.dataset.key);
    el.addEventListener('change', () => set({ [el.dataset.key]: el.checked, playing: false, anim: false }));
  }
  for (const el of $$('input[type="number"][data-key]')) {
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (Number.isFinite(v)) set({ [el.dataset.key]: v, playing: false, anim: false });
    });
  }
  // the Play button of a severity page shows whether the page moves (its own sequence or the
  // tour), and toggles it. Pause stops both and holds the page. Play continues the sequence,
  // from tourAt after a control (takeUp).
  for (const b of $$('button[data-anim]')) {
    b.addEventListener('click', () => {
      const on = state.playing || state.anim;
      held = on;
      if (!on) takeUp(CHAPTERS[state.chapter]);
      set(on ? { playing: false, anim: false } : { anim: true });
    });
  }
}
function syncControls(changed) {
  const has = (k) => !changed || k in changed;
  for (const el of $$('input[type="range"][data-key]')) {
    const k = el.dataset.key;
    if (!has(k)) continue;
    const v = state[k];
    if (Number(el.value) !== v) el.value = v;
    const min = Number(el.min), max = Number(el.max);
    el.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
  }
  for (const g of $$('.seg[data-key]')) {
    const k = g.dataset.key;
    if (!has(k)) continue;
    for (const b of $$('button[data-val]', g)) b.setAttribute('aria-pressed', String(String(parse(b.dataset.val)) === String(state[k])));
  }
  for (const el of $$('input[type="checkbox"][data-key]')) if (has(el.dataset.key)) el.checked = !!state[el.dataset.key];
  if (has('anim') || has('playing')) {
    const on = !!(state.anim || state.playing);
    for (const b of $$('button[data-anim]')) { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Pause' : 'Play the progression'); }
  }
  for (const el of $$('input[type="number"][data-key]')) {
    const k = el.dataset.key;
    if (!has(k) || document.activeElement === el) continue;
    const dp = Number(el.dataset.dp ?? 1);
    el.value = Number.isFinite(state[k]) ? Number(state[k].toFixed(dp)) : '';
  }
  for (const o of $$('output[data-for]')) {
    const k = o.dataset.for;
    if (!has(k)) continue;
    const c = CHAPTERS.find((ch) => ch.format && ch.format[k]);
    const t = c ? c.format[k](state[k], state) : String(state[k]);
    if (o.textContent !== t) o.textContent = t;   // a step often keeps the text (a grade name)
  }
  // conditional controls: data-show-<key>="value1 value2"
  for (const el of $$('[data-show-view],[data-show-side]')) {
    for (const a of el.attributes) {
      if (!a.name.startsWith('data-show-')) continue;
      const k = a.name.slice(10);
      el.hidden = !a.value.split(' ').includes(String(state[k]));
    }
  }
}

// ---------------------------------------------------------------- readouts and live text
function readouts(host, items) {
  host.innerHTML = items.map((it) => `<div class="readout${it.flag ? ' is-flag' : ''}${it.text ? ' text' : ''}"><dt>${it.k}</dt><dd>${it.v}${it.u ? `<small>${it.u}</small>` : ''}</dd></div>`).join('');
}
function renderText(i) {
  const c = CHAPTERS[i];
  if (!c.text) return;
  const out = c.text(state, { cite });
  const art = document.getElementById(`ch-${c.key}`);
  if (out.readouts) readouts($('.readouts', art), out.readouts);
  if (out.live !== undefined) $('.live', art).innerHTML = out.live;
  if (out.extra) out.extra(art);
}
function renderAllText() { for (let i = 0; i < CHAPTERS.length; i++) renderText(i); }

// ---------------------------------------------------------------- quizzes
// The review questions are off; the questions stay in quiz.js.
const SHOW_QUIZ = false;
function buildQuizzes() {
  if (!SHOW_QUIZ) return;
  for (const c of CHAPTERS) {
    const host = document.querySelector(`#ch-${c.key} .quiz`);
    const quiz = c.quiz || QUIZ[c.key];
    if (!host || !quiz) continue;
    host.innerHTML = `<h3 class="quiz-head">Review questions</h3>` + quiz.map((it, i) => `
      <div class="q" data-q="${i}">
        <p>${it.q}</p>
        <div class="opts">${it.opts.map((o, j) => `<button type="button" data-o="${j}">${o}</button>`).join('')}</div>
        <p class="why" hidden>${it.why}</p>
      </div>`).join('');
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-o]');
      if (!b) return;
      const q = b.closest('.q');
      const it = quiz[Number(q.dataset.q)];
      const j = Number(b.dataset.o);
      b.classList.add(j === it.right ? 'right' : 'wrong');
      if (j === it.right) q.querySelector('.why').hidden = false;
    });
  }
}

// ---------------------------------------------------------------- figures
function ensureFigure(i) {
  const c = CHAPTERS[i];
  if (sheets[c.key] || !c.figure) return sheets[c.key];
  const fig = document.getElementById(`fig-${c.key}`);
  sheets[c.key] = c.figure(fig, () => state);
  return sheets[c.key];
}
function dirtyAll() { for (const sh of Object.values(sheets)) if (sh) sh.dirty = true; }

// ---------------------------------------------------------------- chapters
function goChapter(i) {
  i = Math.max(0, Math.min(CHAPTERS.length - 1, i));
  tourDone = false;
  set({ chapter: i });
}
$('#chapters').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-go]');
  if (b) goChapter(Number(b.dataset.go));
});

const trackX = (i, w) => ((i + 0.08) / CHAPTERS.length) * w;
function trackPath(x0, x1) {
  let d = `M${x0.toFixed(1)},6`;
  for (let s = x0 + 18; s < x1; s += 18) d += ` L${Math.min(s, x1).toFixed(1)},${(6 + Math.sin(s * 0.13) * 0.9).toFixed(2)}`;
  return `${d} L${x1.toFixed(1)},6`;
}
function drawTrack() {
  const svg = $('#track');
  const w = svg.clientWidth || 600;
  svg.setAttribute('viewBox', `0 0 ${w} 12`);
  svg.innerHTML = `<path class="line" d="${trackPath(trackX(0, w), trackX(CHAPTERS.length - 1, w))}"/><path class="done"/><circle class="dot" cy="6" r="4.5"/>`;
  dotX = -1;
  moveDot();
}
let dotX = -1;
let dotT = 0;   // s: the tour time that the dot shows. It moves with the tour only, and holds in a pause.
function moveDot() {
  const svg = $('#track');
  const dot = svg.querySelector('.dot');
  if (!dot) return;
  const w = svg.clientWidth || 600, i = state.chapter;
  const f = i < CHAPTERS.length - 1 ? Math.min(1, dotT / CHAPTERS[i].dwell) : 0;
  const x = trackX(i, w) + (trackX(Math.min(i + 1, CHAPTERS.length - 1), w) - trackX(i, w)) * f;
  if (Math.abs(x - dotX) < 0.3) return;
  dotX = x;
  dot.setAttribute('cx', x.toFixed(1));
  svg.querySelector('.done').setAttribute('d', trackPath(trackX(0, w), x));
}
new ResizeObserver(() => drawTrack()).observe($('#track'));

// ---------------------------------------------------------------- a chapter's own sequence
// With the tour paused, the open chapter plays the steps it plays in the tour: tourEnter, then
// tourTick from 0 s to its dwell, a hold, and again (ownTick below). It never moves to the next
// chapter. state.anim says that it runs.
/**
 * Whether chapter c plays its own sequence when it opens: not with reduced motion, not without
 * tour steps, and not on a severity page (a Play button) under a disease heart, which keeps the
 * heart's grade.
 */
const ownPlays = (c) => !reducedMotion && !!c.tourTick && !(state.pheno !== 'normal' && $(`#ch-${c.key} button[data-anim]`));
// Any input in the open chapter pauses the tour, and stops the chapter's sequence until the
// chapter opens again (held): a pointer or the wheel on its figure or text, a click there, a
// control's input or change, and the chapter's own keys. The Play button of a severity page
// toggles the sequence instead (bindControls).
let held = false;
function hold(e) {
  if (e.target.closest?.('button[data-anim]')) return;
  held = true;
  if (state.anim || state.playing) set({ anim: false, playing: false });
}
for (const type of ['pointerdown', 'wheel', 'click']) {
  document.addEventListener(type, (e) => { if (e.target.closest?.('.fig.is-active, .chapter.is-active')) hold(e); }, { capture: true, passive: true });
}
for (const type of ['input', 'change']) document.addEventListener(type, hold, true);

let active = -1;
function showChapter() {
  const i = state.chapter;
  const c = CHAPTERS[i];
  document.documentElement.dataset.ch = c.key;
  tourT = 0;
  stepFrom = 0;
  dotT = 0;
  entered = false;
  inStep = false;
  held = false;
  if (active >= 0 && active !== i) CHAPTERS[active].leave?.();
  active = i;
  // the chapter opens with its own sequence playing. Not during the tour: the tour plays the
  // same steps, and then opens the next chapter.
  const autoplay = !state.playing && ownPlays(c);
  if (!!state.anim !== autoplay) set({ anim: autoplay });
  $$('.chapter').forEach((a) => a.classList.toggle('is-active', a.id === `ch-${c.key}`));
  $$('.fig').forEach((f) => f.classList.toggle('is-active', f.id === `fig-${c.key}`));
  $$('#chapters button[data-go]').forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  $$('#groups li').forEach((li) => li.classList.toggle('is-cur', li.dataset.part === c.part));
  drawTrack();
  $('#panel').scrollTop = 0;
  if (matchMedia('(max-width: 820px)').matches) {
    const top = $('.masthead').offsetHeight;
    if (window.scrollY > top) window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  try { history.replaceState(null, '', `${location.pathname}${location.search}#${c.key}`); } catch (e) { /* sandboxed */ }
  const sh = ensureFigure(i);
  if (sh && sh.resize) { sh.resize(); sh.dirty = true; }
  c.enter?.({ state, set, playing: state.playing });
  if (state.playing) { c.tourEnter?.(stepSet, state); entered = true; inStep = true; }
  renderText(i);
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog[open]')) return;
  if (e.key === 'ArrowRight') { goChapter(state.chapter + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { goChapter(state.chapter - 1); e.preventDefault(); }
  else if (e.key === ' ' && !e.target.closest('button')) { togglePlay(); e.preventDefault(); }
  // a key that the chapter takes (it sets state) is input in the chapter
  else CHAPTERS[state.chapter].key_?.(e.key, (p) => { hold(e); set(p); }, state);
});

// ---------------------------------------------------------------- tour
// The tour plays when the page opens (start). A click on Play all chapters pauses it, and the
// open chapter then plays its own sequence from the same step. The next click continues in this
// chapter from the step that it shows, never with tourEnter, which resets the chapter. A chapter
// out of step (a control, a heart, or a chapter opened with no steps run) starts at the time that
// matches its state (tourAt), or from the beginning when it has no tourAt.
const play = $('#play');
let tourT = 0;          // s into the open chapter's steps: the tour's, or the chapter's own sequence
let entered = false;    // this pass began: tourEnter ran, or takeUp started the chapter at tourAt
let inStep = false;     // the chapter shows the step at tourT: no user write to its keys since
let autoWrites = 0;     // > 0 while the steps or a chapter's own animation write the state
let tourDone = false;
const HOLD = 1.5;   // s: the chapter's own sequence holds its last step, then starts again
const STEP = 2.5;   // s: with reduced motion (Play only), the values change at this interval, not in a sweep
let stepFrom = 0;   // s: those steps count from here, the time where the sequence was taken up
/** The steps write the state through stepSet, so that the chapter stays in step. */
function stepSet(p) { autoWrites++; try { set(p); } finally { autoWrites--; } }
/** Chapter c at time t of its steps: tourEnter first, in a new pass. */
function stepTo(c, t) {
  if (!entered) { c.tourEnter?.(stepSet, state); entered = true; }
  c.tourTick?.(t, stepSet, state);
  inStep = true;
}
/** Before the steps continue: a chapter out of step starts at tourAt(state), or from the beginning. */
function takeUp(c) {
  if (!inStep) {
    const t = c.tourAt?.(state);
    if (Number.isFinite(t)) { tourT = Math.max(0, Math.min(t, c.dwell)); entered = true; }
    else { tourT = 0; entered = false; }
  }
  stepFrom = tourT;
}
function ownTick(dt) {
  const c = CHAPTERS[state.chapter];
  if (!c.tourTick || (c.ready && !c.ready())) return;
  tourT += dt;
  const t = reducedMotion ? stepFrom + Math.floor((tourT - stepFrom) / STEP) * STEP : tourT;
  stepTo(c, Math.min(t, c.dwell));
  if (tourT >= c.dwell + HOLD) { tourT = 0; stepFrom = 0; entered = false; }
}
function tourTick(dt) {
  const i = state.chapter, c = CHAPTERS[i];
  if (c.ready && !c.ready()) return;   // a 3D chapter counts only while its model is on screen
  tourT += dt;
  stepTo(c, tourT);
  if (tourT >= c.dwell) {
    if (i < CHAPTERS.length - 1) { set({ chapter: i + 1 }); return; }
    // the end of the tour: it stops, and the last chapter continues with its own sequence
    tourT = c.dwell;
    tourDone = true;
    pauseTour();
  }
  dotT = tourT;
  moveDot();
}
function pauseTour() {
  set({ playing: false });
  // the chapter continues its own sequence from the same step, unless an input in it holds it
  if (!state.anim && !held && ownPlays(CHAPTERS[state.chapter])) set({ anim: true });
}
function togglePlay() {
  if (state.playing) { pauseTour(); return; }
  if (tourDone) {
    // after the end of the tour, the tour starts again at chapter 01
    tourDone = false;
    set({ playing: true, anim: false });
    if (state.chapter === 0) { tourT = 0; dotT = 0; entered = false; } else set({ chapter: 0 });
    return;
  }
  takeUp(CHAPTERS[state.chapter]);
  dotT = tourT;
  set({ playing: true, anim: false });
}
play.addEventListener('click', togglePlay);

// ---------------------------------------------------------------- state -> view
// While a chapter moves (its own sequence or the tour), its readouts and live sentence render at
// most 5 times a second: a timer collects the renders. The figure, the sliders and their outputs
// follow every step. When the motion stops (a pause, any control), the text renders at once.
const TEXT_MS = 200;
const textDue = new Set();
let textTimer = 0;
function flushText() {
  clearTimeout(textTimer);
  textTimer = 0;
  for (const i of textDue) if (i === state.chapter || CHAPTERS[i].alwaysRender) renderText(i);
  textDue.clear();
}
subscribe((s, changed) => {
  if ('pheno' in changed) { setPheno(s.pheno); setHeart(s.pheno); showPheno(); }
  if ('chapter' in changed) showChapter();
  if ('playing' in changed) {
    play.setAttribute('aria-pressed', String(s.playing));
    play.setAttribute('aria-label', s.playing ? 'Pause' : 'Play all chapters');
    dotX = -1;
    moveDot();
  }
  // a write by the user (a control, a heart) takes the open chapter out of step
  if (inStep && !autoWrites && !('chapter' in changed)) {
    const c = CHAPTERS[s.chapter], keys = c.watch || Object.keys(c.defaults || {});
    if (Object.keys(changed).some((k) => keys.includes(k))) inStep = false;
  }
  syncControls(changed);
  // re-render the text of every chapter whose keys changed
  const moving = s.playing || s.anim;
  for (let i = 0; i < CHAPTERS.length; i++) {
    const c = CHAPTERS[i];
    const keys = c.watch || Object.keys(c.defaults || {});
    if (Object.keys(changed).some((k) => keys.includes(k) || k === 'chapter')) {
      if (i === s.chapter || c.alwaysRender) {
        if (moving && !('chapter' in changed)) {
          textDue.add(i);
          if (!textTimer) textTimer = setTimeout(flushText, TEXT_MS);
        } else {
          textDue.delete(i);
          renderText(i);
        }
      }
      const sh = sheets[c.key];
      if (sh) sh.dirty = true;
    }
  }
  if (!moving && textTimer) flushText();
  CHAPTERS[s.chapter].onState?.(s, changed);
});

// ---------------------------------------------------------------- loop
let lastT = performance.now();
function frame(now) {
  const raw = (now - lastT) / 1000;
  const dt = Math.min(0.1, raw);
  lastT = now;
  const tdt = Math.min(0.25, raw);
  if (state.playing) tourTick(tdt);
  else if (state.anim) ownTick(tdt);
  const c = CHAPTERS[state.chapter];
  // the chapter's own animation (the cursor of 05) does not take the chapter out of step
  if (c.anim) { autoWrites++; try { c.anim(state.playing || state.anim ? tdt : dt, state, set); } finally { autoWrites--; } }
  follow(c.pulse ? c.pulse(state) : null, now);
  const sh = sheets[c.key];
  if (sh && sh.render) sh.render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start
function buildTransport() {
  const nav = $('#chapters');
  const track = nav.querySelector('.track');
  CHAPTERS.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-go="${i}" aria-label="${String(i + 1).padStart(2, '0')} ${esc(c.title)}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(c.nav || c.title)}</span></button>`;
    nav.insertBefore(li, track);
  });
  nav.style.setProperty('--n-ch', CHAPTERS.length);
  const groups = $('#groups');
  groups.style.setProperty('--n-ch', CHAPTERS.length);
  // the parts by name, no numerals. A part of one chapter shows only its rule: the chapter's own
  // button below names it, and a column is too narrow for the part's name
  groups.innerHTML = PARTS.map((p) => {
    const n = CHAPTERS.filter((c) => c.part === p.key).length;
    return `<li data-part="${p.key}" style="--span: ${n}" title="${esc(p.name)}">${n > 1 ? esc(p.name) : ''}</li>`;
  }).join('');
  fitTransport();
  document.fonts?.ready.then(fitTransport);
  new ResizeObserver(fitTransport).observe($('.transport'));
  // phones: back, the chapter, next. A tap on the chapter opens the list of all chapters, by part
  const list = $('#chlist');
  list.innerHTML = PARTS.map((p) => {
    const items = CHAPTERS.map((c, i) => [c, i]).filter(([c]) => c.part === p.key);
    if (!items.length) return '';
    return `<li class="chgroup"><h3 class="dlg-sub">${esc(p.name)}</h3><ol>${items.map(([c, i]) => `<li><button type="button" data-go="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(c.title)}</span></button></li>`).join('')}</ol></li>`;
  }).join('');
  $('#pg-prev').addEventListener('click', () => goChapter(state.chapter - 1));
  $('#pg-next').addEventListener('click', () => goChapter(state.chapter + 1));
  $('#pg-cur').addEventListener('click', () => {
    openDialog('dlg-chapters');
    const cur = list.querySelector('button[aria-current]');
    if (cur) { cur.scrollIntoView({ block: 'center' }); cur.focus({ preventScroll: true }); }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-go]');
    if (!b) return;
    $('#dlg-chapters').close();
    goChapter(Number(b.dataset.go));
  });
  syncPager();
  subscribe((s, ch) => { if ('chapter' in ch) syncPager(); });
  new ResizeObserver(fitPager).observe($('#pg-cur'));
  document.fonts?.ready.then(fitPager);
}

/** The phone bar's title in two lines at most; if it needs more, the short name of the desktop bar. */
function fitPager() {
  const c = CHAPTERS[state.chapter], t = $('#pg-cur .t');
  t.textContent = c.title;
  if (c.nav && t.clientHeight && (t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1)) t.textContent = c.nav;
}

/** The phone bar: the current chapter's number and title, the ends, the list's current row. */
function syncPager() {
  const i = state.chapter, c = CHAPTERS[i], n = String(i + 1).padStart(2, '0');
  const cur = $('#pg-cur');
  cur.querySelector('.n').textContent = n;
  cur.setAttribute('aria-label', `${n} ${c.title}: list of chapters`);
  fitPager();
  $('#pg-prev').disabled = i === 0;
  $('#pg-next').disabled = i === CHAPTERS.length - 1;
  for (const b of $$('#chlist button[data-go]')) {
    if (Number(b.dataset.go) === i) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

/** The width of an element's own text as drawn (0 when it is hidden). */
function textWidth(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width;
}
/**
 * Columns of the chapter bar: each as wide as its chapter's name needs (its number where names
 * are hidden), and each part's columns together as wide as the part's name, so that no name is
 * cut short. The two rows share the columns.
 */
function fitTransport() {
  const need = $$('#chapters button[data-go]').map((b) => Math.max(textWidth(b.querySelector('.n')), textWidth(b.querySelector('.t'))) + 10);
  if (!need.some((w) => w > 10)) return;   // the bar is not laid out yet
  let k = 0;
  for (const li of $('#groups').children) {
    const span = Number(li.style.getPropertyValue('--span')) || 1, sum = need.slice(k, k + span).reduce((a, b) => a + b, 0);
    const want = li.textContent ? textWidth(li) + 16 : 0;   // with its right margin
    if (want > sum) for (let j = k; j < k + span; j++) need[j] *= want / sum;
    k += span;
  }
  const cols = need.map((w) => `minmax(0, ${w.toFixed(1)}fr)`).join(' ');
  for (const el of [$('#chapters'), $('#groups')]) if (el.style.gridTemplateColumns !== cols) el.style.gridTemplateColumns = cols;
}

function start() {
  const saved = store.get('heart-in-sound-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  buildTransport();
  fillNorms();
  for (const c of CHAPTERS) c.init?.({ state, set, subscribe, $, $$, cite: (ids) => cite(ids) });
  bindControls();
  const heart = store.get(PHENO_STORE);
  if (heart && heart !== 'normal' && PHENOS[heart]) set({ pheno: heart, ...phenoPatch(heart) });
  showPheno();
  buildQuizzes();
  refIndex = numberCitations();
  applyTheme();
  syncControls();
  const fromHash = chapterOf(location.hash);
  renderAllText();
  // the tour plays when the page opens, from the chapter that opens; not with reduced motion
  if (!reducedMotion) set({ playing: true });
  if (fromHash > 0) set({ chapter: fromHash }); else showChapter();
  // a new #key in the address bar opens that chapter (showChapter writes the hash with
  // replaceState, which fires no hashchange)
  window.addEventListener('hashchange', () => {
    const i = chapterOf(location.hash);
    if (i >= 0 && i !== state.chapter) goChapter(i);
  });
  window.addEventListener('resize', () => {
    for (const s of Object.values(sheets)) s?.resize?.();
    CHAPTERS[state.chapter].resize?.();
  });
  document.fonts?.ready?.then(() => dirtyAll());
  document.fonts?.addEventListener?.('loadingdone', () => dirtyAll());
  requestAnimationFrame(frame);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => { for (const c of CHAPTERS) c.warm?.(); });
}
start();
