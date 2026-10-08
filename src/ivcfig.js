// The RA pressure from the IVC (ASE 2025, Mukherjee: Table 4, Figure 3): the estimate, the clock of
// the IVC's panels, the steps of the estimate as a diagram with ▲▼ buttons, and the live text.
// Doppler hemodynamics (ch/pressure.js) shows it as its IVC setting: the subcostal long axis and the
// IVC on M-mode, beside the RV systolic pressure that adds the estimate. The hidden chapter
// ch/ivc.js shows it on a page of its own, with hepatic vein PW Doppler, the IVC beside the
// abdominal aorta and the meters (SHOW_IVC in order.js). Each chapter keeps its own state keys: K
// maps the estimate's inputs to them (no K.tr: no tricuspid regurgitation).
import { stepOf, steady, flash } from './edits.js';
import { dAt, respAt, SEQ, RR, HV, hvRatios } from './ivc2d.js';
import { rapEstimate, RAP_RANGE } from './norms.js';
import { cue } from './music.js';
import { numOf } from './order.js';
import { reducedMotion } from './state.js';

/** The inputs' starting values: an IVC of 1.8 cm that collapses by 60% with a sniff, an RA pressure of 3 mmHg. */
export const START = { D: 1.8, sniff: 60, quiet: 30, breath: 'sniff', sec: 'unclear', tr: 'none' };
/** A chapter's defaults for the inputs, under its keys K. */
export const defaultsOf = (K) => Object.fromEntries(Object.entries(K).map(([k, key]) => [key, START[k]]));
/** The inputs in the state s, under the keys K. */
export const valuesOf = (s, K) => ({ D: s[K.D], sniff: s[K.sniff], quiet: s[K.quiet], breath: s[K.breath], sec: s[K.sec], tr: K.tr ? s[K.tr] : 'none' });

// the two measurements with ▲▼ buttons: their steps and limits
const INPUTS = {
  d: { step: 0.1, min: 0.8, max: 3.4, dp: 1, unit: 'cm' },
  c: { step: 5, min: 0, max: 100, dp: 0, unit: '%' },
};

/** The estimate for the inputs v, and the hepatic vein flow that follows it. */
export function model(v) {
  const mode = v.breath;
  const col = mode === 'quiet' ? v.quiet : v.sniff;
  const tr = v.tr === 'severe';
  const est = rapEstimate({ d: v.D, col, mode, sec: v.sec, reflux: tr });
  // the hepatic veins follow the RA pressure, and reverse in systole with severe TR
  const hv = tr ? 'reversal' : est.level === 'raised' ? 'blunted' : 'normal';
  const hvW = tr ? 1.05 : hv === 'blunted' ? 0.85 : 0.6;
  return { mode, col, tr, est, hv, hvW, ...hvRatios(HV[hv]) };
}

export const HV_NAME = { normal: 'S > D', blunted: 'S < D', reversal: 'S reversed' };
const MODE_NAME = { sniff: 'sniff', quiet: 'quiet breathing', ppv: 'ventilation' };
export const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
/** The result in words, for the result line and the change line. */
const resultOf = (e) => (e.rap === null ? `${e.level} RA pressure` : `${e.rap} mmHg`);

/** The lines of the subcostal view's box: the diameter, the collapse (wide) and the result. */
export function boxLines(v, m, wide) {
  const e = m.est;
  const rap = e.rap === null ? `RAP ${e.level}` : `RAP ${e.rap} mmHg`;
  const col = m.mode === 'ppv' ? 'collapse not used' : `${m.mode === 'quiet' ? 'quiet' : 'sniff'} ${m.col}%`;
  return wide ? [`IVC ${v.D.toFixed(1)} cm, end-expiration`, col, rap] : [`IVC ${v.D.toFixed(1)} cm`, rap];
}

// ---------------------------------------------------------------- the clock of the panels
/**
 * The breathing program and the beat of the IVC's panels run on this clock while the cine runs.
 * It starts in a quiet expiration.
 */
export function ivcClock() {
  const clock = { ms: 2600 };
  return {
    /** The panels' inputs now, for the inputs v and their model m. */
    frame(v, m) {
      const T = SEQ[m.mode], tm = clock.ms % T;
      const p = { D: v.D, sniff: v.sniff, quiet: v.quiet, mode: m.mode };
      const d = dAt(p, reducedMotion ? 3600 : tm);
      return {
        p, d, tm,
        u: reducedMotion ? 0.36 : tm / T,              // the M-mode's sweep
        sweep: (clock.ms % (2 * RR)) / (2 * RR),        // the hepatic veins' sweep
        beat: clock.ms % RR,
        sc: { d, D: v.D, hvW: m.hvW, phase: reducedMotion ? '' : respAt(m.mode, tm).name, t: tm },
      };
    },
    /** The clock runs while the cine runs: true when it moved. */
    tick(dt) {
      if (reducedMotion) return false;
      clock.ms = (clock.ms + dt * 1000) % (SEQ.sniff * SEQ.quiet);
      return true;
    },
    /** The heart for the music: the panels' beat. */
    pulse() { return { rr: RR, phase: reducedMotion ? null : (clock.ms % RR) / RR }; },
  };
}

// ---------------------------------------------------------------- the estimate in the text
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const SIGNS = ['RA enlargement', 'Atrial septum bulging into the LA throughout the cycle', 'Restrictive right-sided filling', 'Tricuspid E/e′ >6', 'Hepatic vein S/(S + D) <55%'];
const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

/**
 * The steps of the estimate as a diagram in host, with ▲▼ buttons on the IVC diameter and its
 * collapse. Each change lights the values and the result it changes, and one line names the cause
 * and the effect (as Diastolic function does). get() reads the state and set(patch) writes it. live
 * is the selector of the chapter's live text, which a ▲▼ edit holds in place (edits.js). hv: the
 * figure draws the hepatic veins, so the change line names their pattern.
 */
export function ivcDiagram({ host, K, get, set, live, hv = true }) {
  if (!host) return null;
  let prev = null;        // what the diagram showed last
  let pending = null;     // the cause of the change being drawn: an edit or Reset
  let fresh = true;       // the next drawing sets the baseline: no change line, no flash
  const btn = (k, dir, label) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${label}">${dir > 0 ? UP : DOWN}</button>`;
  const row = (k, name, label) => `<div class="ase-row" data-row="${k}" role="group" aria-label="${name}">
      <span class="ase-nm">${name}</span>
      <span class="ase-ctl">${btn(k, -1, label)}<span class="ase-v"><b></b><small>${INPUTS[k].unit}</small></span>${btn(k, 1, label)}</span>
      <span class="ase-cut"></span><i class="ase-mk" aria-hidden="true"></i><span class="sr-only ase-st"></span>
    </div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">RA pressure · ASE 2025</h3><button type="button" class="ase-reset is-off" aria-label="Reset the IVC values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    <div class="ase-step" data-s="1">
      <p class="ase-sh"><span class="ase-sn">Step 1</span><span class="ase-sx">IVC diameter at end-expiration</span></p>
      ${row('d', 'IVC diameter', 'IVC diameter')}
    </div>
    <div class="ase-step" data-s="2">
      <p class="ase-sh"><span class="ase-sn">Step 2</span><span class="ase-sx ivc-sx2"></span></p>
      ${row('c', 'Collapse', 'IVC collapse')}
      <p class="ase-note ivc-ppv">Positive-pressure ventilation: the IVC collapse does not estimate the RA pressure.</p>
    </div>
    <div class="ase-step" data-s="3">
      <p class="ase-sh"><span class="ase-sn">Step 3</span><span class="ase-sx ivc-sx3"></span></p>
      <ul class="ivc-signs">${SIGNS.map((s) => `<li>${s}</li>`).join('')}</ul>
      <div class="ivc-sec"><span class="ivc-sec-l" id="ivc-sec-l">Secondary signs</span><div class="seg" role="group" aria-labelledby="ivc-sec-l" data-key="${K.sec}"><button type="button" data-val="none">None</button><button type="button" data-val="present">Present</button><button type="button" data-val="unclear">Unclear</button></div></div>
      <p class="ase-s3"></p>
    </div>
    <div class="ase-step ase-res" data-s="4">
      <p class="ase-sh"><span class="ase-sn">Result</span></p>
      <p class="ase-og ivc-og">${[3, 8, 15, 20].map((v) => `<span class="ase-o" data-o="${v}">${v} mmHg</span>`).join('')}</p>
      <p class="ase-note ivc-rnote"></p>
    </div>`;
  const q = (s) => host.querySelector(s);
  const rowEls = (k) => { const el = q(`[data-row="${k}"]`); return { el, v: el.querySelector('.ase-v b'), nm: el.querySelector('.ase-nm'), cut: el.querySelector('.ase-cut'), st: el.querySelector('.ase-st'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }; };
  const dg = {
    host, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'),
    rows: { d: rowEls('d'), c: rowEls('c') }, sx2: q('.ivc-sx2'), sx3: q('.ivc-sx3'), ppv: q('.ivc-ppv'), s3: q('.ase-s3'), rnote: q('.ivc-rnote'), signs: q('.ivc-signs'),
    steps: Object.fromEntries([...host.querySelectorAll('.ase-step')].map((el) => [el.dataset.s, el])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  const freeLive = () => { const el = document.querySelector(live); if (el?.style.minHeight) el.style.minHeight = ''; };

  /** A ▲▼ click: one step of the IVC diameter or of the collapse; Play and the tour stop. */
  function edit(k, dir, b = null) {
    const s = get(), v = valuesOf(s, K), I = INPUTS[k];
    const key = k === 'd' ? K.D : v.breath === 'quiet' ? K.quiet : K.sniff;
    const from = s[key], to = stepOf(from, I, dir);
    if (to === from) return;
    const was = resultOf(model(v).est);
    pending = { kind: 'edit', k, from, to };
    steady(live, b, () => set({ [key]: to, playing: false }));
    pending = null;
    if (resultOf(model(valuesOf(get(), K)).est) !== was) cue('bell');
  }
  function resetAll() {
    pending = { kind: 'reset' };
    set({ ...defaultsOf(K), playing: false });
    pending = null;
    freeLive();
    dg.result.focus({ preventScroll: true });
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetAll();
  });

  /** What the diagram shows: a snapshot to compare with the next one. */
  function snap(v, m) {
    const e = m.est;
    return {
      D: v.D, col: m.col, mode: m.mode, sec: v.sec, tr: m.tr, hv: m.hv, res: resultOf(e), rap: e.rap,
      dil: e.dilated, ok: e.collapses, ind: e.indeterminate, c20: e.consider20,
      edited: Object.keys(START).some((k) => v[k] !== START[k]),
    };
  }

  /** The cause and the effect of a change, as one line. */
  function changeLine(P, M, cause) {
    const heads = [];
    if (cause.kind === 'edit') heads.push(cause.k === 'd' ? `IVC ${cause.from.toFixed(1)} → ${cause.to.toFixed(1)} cm` : `Collapse ${cause.from} → ${cause.to}%`);
    else if (cause.kind === 'reset') heads.push('Reset');
    else {
      if (P.mode !== M.mode) heads.push(`Breathing: ${MODE_NAME[P.mode]} → ${MODE_NAME[M.mode]}`);
      if (P.sec !== M.sec) heads.push(`Secondary signs: ${P.sec} → ${M.sec}`);
      if (P.tr !== M.tr) heads.push(`TR: ${P.tr ? 'severe' : 'none'} → ${M.tr ? 'severe' : 'none'}`);
      if (P.D !== M.D) heads.push(`IVC ${P.D.toFixed(1)} → ${M.D.toFixed(1)} cm`);
      if (P.col !== M.col && P.mode === M.mode) heads.push(`Collapse ${P.col} → ${M.col}%`);
    }
    const fx = [];
    if (P.dil !== M.dil) fx.push(M.dil ? 'diameter >2.1 cm' : 'diameter ≤2.1 cm');
    if (M.mode === 'ppv' && P.mode !== 'ppv') fx.push('collapse not used');
    else if (P.mode === 'ppv' && M.mode !== 'ppv') fx.push('collapse used again');
    else if (M.mode !== 'ppv' && (P.ok !== M.ok || P.mode !== M.mode)) fx.push(`collapse ${M.ok ? '≥' : '<'}${M.mode === 'quiet' ? 20 : 50}%`);
    if (P.ind !== M.ind) fx.push(M.ind ? 'indeterminate: secondary signs decide' : 'secondary signs not needed');
    if (P.c20 !== M.c20) fx.push(M.c20 ? '20 mmHg can be considered' : '20 mmHg not considered');
    const res = P.res === M.res ? `Result: ${M.res}, no change` : `Result: ${P.res} → ${M.res}`;
    // the hepatic vein pattern follows the result and the TR: an effect, after the result
    const veins = P.hv === M.hv || !hv ? '' : ` Hepatic vein flow: ${HV_NAME[P.hv]} → ${HV_NAME[M.hv]}.`;
    return `${heads.join('; ') || 'Values'}: ${fx.length ? fx.join(', ') : 'no cut-off crossed'}. ${res}.${veins}`;
  }

  function flashChanges(P, M, cause) {
    if (P.dil !== M.dil) flash(dg.rows.d.el);
    if (P.ok !== M.ok || P.mode !== M.mode) flash(dg.rows.c.el);
    if (P.ind !== M.ind || (M.ind && P.sec !== M.sec) || (P.mode !== M.mode)) flash(dg.steps[3]);
    if (P.mode !== M.mode) flash(dg.steps[2]);
    if (P.res !== M.res) { flash(dg.result); if (M.rap !== null) flash(dg.out[M.rap]); }
    if (P.c20 !== M.c20) flash(dg.out[20]);
    // an edit: the number it changed pulses
    if (cause.kind === 'edit') flash(dg.rows[cause.k].v.parentElement, 'is-tick');
  }

  /** Draw the diagram for the inputs v and their model m. */
  function render(v, m) {
    const e = m.est, M = snap(v, m);
    const P = fresh ? null : prev;
    fresh = false;
    prev = M;
    const ppv = m.mode === 'ppv', cut = m.mode === 'quiet' ? 20 : 50;
    // step 1: the diameter
    const R1 = dg.rows.d, R2 = dg.rows.c;
    txt(R1.v, fmt(v.D, 1));
    txt(R1.cut, '>2.1');
    R1.el.classList.toggle('is-bad', e.dilated);
    txt(R1.st, e.dilated ? 'dilated' : 'normal');
    // step 2: the collapse, with a sniff or with quiet breathing; not used under ventilation
    txt(dg.sx2, ppv ? 'Positive-pressure ventilation' : m.mode === 'quiet' ? 'Collapse with quiet breathing, no sniff' : 'Collapse with a sniff');
    txt(R2.nm, ppv ? 'Collapse' : m.mode === 'quiet' ? 'Collapse, quiet' : 'Collapse, sniff');
    txt(R2.v, ppv ? '–' : fmt(m.col));
    txt(R2.cut, ppv ? '' : `<${cut}`);
    R2.el.classList.toggle('is-bad', !ppv && !e.collapses);
    R2.el.classList.toggle('is-off', ppv);
    txt(R2.st, ppv ? 'not used' : e.collapses ? 'normal' : 'reduced');
    dg.ppv.hidden = !ppv;
    // the buttons: off at their limits, and the collapse's under ventilation
    const lim = [[R1, v.D, INPUTS.d], [R2, m.col, INPUTS.c]];
    for (const [R, x, I] of lim) {
      const off = ppv && R === R2;
      for (const [b, end, other] of [[R.dn, x <= I.min + 1e-9, R.up], [R.up, x >= I.max - 1e-9, R.dn]]) {
        const dis = off || end;
        if (dis && document.activeElement === b && !other.disabled && !off) other.focus();
        b.disabled = dis;
      }
    }
    // step 3: the secondary signs, on the path in the indeterminate patterns and under ventilation
    const on3 = e.secUsed;
    txt(dg.sx3, ppv ? 'Ventilation: secondary signs' : 'Indeterminate: secondary signs');
    txt(dg.s3, !on3 ? (m.mode === 'quiet' ? 'Not on the path: quiet breathing gives the value directly.' : 'Not on the path: the pattern is not indeterminate.')
      : ppv ? (v.sec === 'none' ? 'None: normal RA pressure.' : v.sec === 'present' ? 'Present: raised RA pressure.' : 'Unclear: 8 mmHg.')
        : (v.sec === 'none' ? 'None: 3 mmHg.' : v.sec === 'present' ? 'Present: 15 mmHg.' : 'Unclear: 8 mmHg.'));
    const on = { 1: true, 2: !ppv, 3: on3, 4: true };
    for (const [k, el] of Object.entries(dg.steps)) el.classList.toggle('is-on', on[k]);
    // result
    for (const [x, el] of Object.entries(dg.out)) {
      el.classList.toggle('is-on', Number(x) === e.rap);
      el.classList.toggle('is-maybe', Number(x) === 20 && e.consider20);
    }
    txt(dg.head, ppv ? (e.rap === null ? `${e.level[0].toUpperCase()}${e.level.slice(1)} RA pressure` : `RA pressure ${e.rap} mmHg`) : `RA pressure ${e.rap} mmHg`);
    txt(dg.sub, ppv ? 'ventilation: IVC collapse not used' : `range ${RAP_RANGE[e.rap]} mmHg${e.consider20 ? ', 20 can be considered' : ''}`);
    dg.result.classList.toggle('is-raised', e.level === 'raised');
    txt(dg.rnote, ppv ? 'If the RA pressure is clinically relevant, an invasive measurement should replace the estimate.'
      : e.consider20 ? 'IVC >2.5 cm, collapse <50%, dilated hepatic veins and reflux: 20 mmHg can be considered.' : '');
    dg.rnote.hidden = !dg.rnote.textContent;
    dg.reset.classList.toggle('is-off', !M.edited);   // its room stays, so nothing moves when it shows
    if (!M.edited && !pending) freeLive();
    if (!P) { txt(dg.change, ''); return; }
    const moved = ['D', 'col', 'mode', 'sec', 'tr', 'res'].some((k) => P[k] !== M[k]);
    if (!moved) return;
    const cause = pending || { kind: 'state' };
    // a screen reader reads the line after an edit or Reset, not at each step of the tour
    dg.change.setAttribute('aria-live', cause.kind === 'state' && get().playing ? 'off' : 'polite');
    txt(dg.change, changeLine(P, M, cause));
    flashChanges(P, M, cause);
  }

  return {
    render,
    /** On the way in and out of the chapter: the next drawing sets the baseline, with no flash for changes made elsewhere. */
    reset() { fresh = true; freeLive(); },
  };
}

// ---------------------------------------------------------------- the live text
/**
 * The estimate in words, for the inputs v and their model m. hv: the hepatic veins are drawn, so
 * the text gives their pattern.
 */
export function liveOf(v, m, cite, { hv = true } = {}) {
  const e = m.est;
  const D = fmt(v.D, 1), dil = e.dilated ? 'dilated (>2.1 cm)' : 'not dilated (≤2.1 cm)';
  const c = cite('mukherjee2025');
  let live;
  if (m.mode === 'ppv') {
    const lead = e.rap === null ? `Positive-pressure ventilation: ${e.level} RA pressure by secondary signs.` : 'Positive-pressure ventilation: RA pressure 8 mmHg.';
    const sec = v.sec === 'none' ? 'No secondary sign of a raised RA pressure is present'
      : v.sec === 'present' ? 'Secondary signs of a raised RA pressure are present' : 'The secondary signs are unclear, so the estimate is the intermediate value of 8 mmHg';
    live = `<b>${lead}</b> Under positive-pressure ventilation, the IVC collapse does not estimate the RA pressure. If the RA pressure is clinically relevant, an invasive measurement should replace the estimate${c}. ${sec}${c}.`;
  } else if (m.mode === 'quiet') {
    live = `<b>RA pressure ${e.rap} mmHg.</b> The patient cannot sniff. The IVC measures ${D} cm, ${dil}. It collapses by ${m.col}% with quiet breathing (${e.collapses ? '≥20%' : '<20%'}). The estimate is ${e.rap} mmHg, range ${RAP_RANGE[e.rap]} mmHg${c}.`;
  } else if (e.indeterminate) {
    const sec = v.sec === 'none' ? 'No secondary sign of a raised RA pressure is present, so the estimate falls to 3 mmHg'
      : v.sec === 'present' ? 'Secondary signs of a raised RA pressure are present, so the estimate rises to 15 mmHg' : 'The secondary signs are unclear, so the estimate is the intermediate value of 8 mmHg';
    live = `<b>RA pressure ${e.rap} mmHg.</b> The IVC measures ${D} cm, ${dil}. It collapses by ${m.col}% with a sniff (${e.collapses ? '≥50%' : '<50%'}). This pattern is indeterminate. ${sec}${c}.`;
  } else {
    live = `<b>RA pressure ${e.rap} mmHg.</b> The IVC measures ${D} cm at end-expiration, ${dil}. It collapses by ${m.col}% with a sniff (${e.collapses ? '≥50%' : '<50%'}). The estimate is ${e.rap} mmHg, range ${RAP_RANGE[e.rap]} mmHg${c}.`;
  }
  if (e.consider20) live += ` The IVC is wider than 2.5 cm and collapses less than 50%. The hepatic veins are dilated, with reflux in systole. A value of 20 mmHg can be considered${c}.`;
  if (!hv) return live;
  if (m.hv === 'reversal') live += ` Hepatic vein flow reverses in systole, a specific sign of severe TR (<a href="#tr" data-go="tr">chapter ${numOf('tr')}</a>)${cite('zoghbi2017')}.`;
  else if (m.hv === 'blunted') live += ` Hepatic vein S/D is ${fmt(m.sd, 1)} and S/(S + D) ${fmt(m.sff)}%, below 1 and 55%: signs of a raised RA pressure${c}.`;
  else live += ` Hepatic vein flow is systolic-dominant, with S/D ${fmt(m.sd, 1)} and S/(S + D) ${fmt(m.sff)}%${c}.`;
  return live;
}

/** The readouts of the estimate: the diameter, the collapse and the RA pressure. */
export function readoutsOf(v, m) {
  const e = m.est, cut = m.mode === 'quiet' ? 20 : 50;
  return [
    { k: 'IVC diameter', v: fmt(v.D, 1), u: 'cm', flag: e.dilated },
    m.mode === 'ppv' ? { k: 'Collapse', v: 'not used', text: true } : { k: m.mode === 'quiet' ? 'Collapse, quiet' : 'Collapse, sniff', v: fmt(m.col), u: '%', flag: m.col < cut },
    e.rap === null ? { k: 'RA pressure', v: e.level, text: true, flag: e.level === 'raised' } : { k: 'RA pressure', v: fmt(e.rap), u: 'mmHg', flag: e.rap > 3 },
  ];
}
