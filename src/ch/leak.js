// 13 Leak: valve regurgitation. The flow-convergence (PISA) shell, the vena contracta and the
// continuous-wave signal of one jet, and the numbers that grade it.
import { Sheet, clamp, mix, MONO, SANS, rng } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, colorOf, colorBar, SC, caliper } from '../scope.js';
import { regGrade } from '../norms.js';

// Per valve: peak jet velocity (m/s) and jet VTI (cm), chosen so that the guideline EROA and
// regurgitant volume cut-offs line up (MR 0.40 cm² ~ 60 mL; AR 0.30 cm² ~ 60 mL; TR 0.40 cm² ~ 45 mL).
const JET = {
  mr: { vmax: 5.0, vti: 150, name: 'mitral', key: 'mrEroa', dir: 1, dur: 0.4, start: 0.02 },
  ar: { vmax: 4.2, vti: 200, name: 'aortic', key: 'arEroa', dir: -1, dur: 0.48, start: 0.37 },
  tr: { vmax: 2.6, vti: 112, name: 'tricuspid', key: 'trEroa', dir: 1, dur: 0.4, start: 0.02 },
};
const FWD = 70;   // mL, forward stroke volume

// Quantitative rows of the ASE 2017 tables (Zoghbi 2017, Tables 8, 11 and 14).
const ROWS = {
  mr: [
    ['Vena contracta (cm)', 'vc', [['<0.3', (v) => v < 0.3], ['intermediate', (v) => v >= 0.3 && v < 0.7], ['≥0.7', (v) => v >= 0.7]]],
    ['EROA (cm²)', 'eroa', [['<0.20', (v) => v < 0.2], ['0.20–0.39', (v) => v >= 0.2 && v < 0.4], ['≥0.40', (v) => v >= 0.4]]],
    ['Regurgitant volume (mL)', 'rvol', [['<30', (v) => v < 30], ['30–59', (v) => v >= 30 && v < 60], ['≥60', (v) => v >= 60]]],
    ['Regurgitant fraction (%)', 'rf', [['<30', (v) => v < 30], ['30–49', (v) => v >= 30 && v < 50], ['≥50', (v) => v >= 50]]],
    ['PISA radius at 30–40 cm/s (cm)', 'r', [['≤0.3', (v) => v <= 0.3], ['intermediate', (v) => v > 0.3 && v < 1], ['≥1.0', (v) => v >= 1]]],
  ],
  ar: [
    ['Vena contracta (cm)', 'vc', [['<0.3', (v) => v < 0.3], ['0.3–0.6', (v) => v >= 0.3 && v <= 0.6], ['>0.6', (v) => v > 0.6]]],
    ['EROA (cm²)', 'eroa', [['<0.10', (v) => v < 0.1], ['0.10–0.29', (v) => v >= 0.1 && v < 0.3], ['≥0.30', (v) => v >= 0.3]]],
    ['Regurgitant volume (mL)', 'rvol', [['<30', (v) => v < 30], ['30–59', (v) => v >= 30 && v < 60], ['≥60', (v) => v >= 60]]],
    ['Regurgitant fraction (%)', 'rf', [['<30', (v) => v < 30], ['30–49', (v) => v >= 30 && v < 50], ['≥50', (v) => v >= 50]]],
    ['Pressure half-time (ms)', 'pht', [['>500', (v) => v > 500], ['500–200', (v) => v <= 500 && v >= 200], ['<200', (v) => v < 200]]],
  ],
  tr: [
    ['Vena contracta (cm)', 'vc', [['<0.3', (v) => v < 0.3], ['0.3–0.69', (v) => v >= 0.3 && v < 0.7], ['≥0.7', (v) => v >= 0.7]]],
    ['EROA (cm²)', 'eroa', [['<0.20', (v) => v < 0.2], ['0.20–0.39', (v) => v >= 0.2 && v < 0.4], ['≥0.40', (v) => v >= 0.4]]],
    ['Regurgitant volume (mL)', 'rvol', [['<30', (v) => v < 30], ['30–44', (v) => v >= 30 && v < 45], ['≥45', (v) => v >= 45]]],
  ],
};

export function leak(s) {
  const J = JET[s.regv];
  const eroa = s[J.key];
  const q = eroa * J.vmax * 100;                    // mL/s, peak flow through the orifice
  const va = s.nyq;                                  // cm/s, aliasing velocity
  const r = q > 0 ? Math.sqrt(q / (2 * Math.PI * va)) : 0;
  const rvol = eroa * J.vti;
  const vc = 2 * Math.sqrt(eroa / Math.PI);
  const pht = s.regv === 'ar' ? Math.max(150, 600 - 1400 * eroa) : null;
  return { J, eroa, q, va, r, rvol, vc, rf: (rvol / (rvol + FWD)) * 100, pht, grade: regGrade(s.regv, eroa) };
}

let sheet = null, st = null, clock = 0;
const RND = rng(33);
const MOSAIC = Array.from({ length: 900 }, () => [RND(), RND(), RND()]);

function drawJet(sh, t, B, L) {
  const ctx = sh.ctx;
  const up = st.regv === 'ar';              // AR runs toward the apex (up on screen)
  const pxcm = Math.min(B.w / 7, B.h / 8);
  const ox = B.x + B.w / 2, oy = B.y + B.h * (up ? 0.62 : 0.4);
  // chambers: the valve plane is horizontal through the orifice
  panel(ctx, B.x, B.y, B.w, B.h, st.regv === 'ar' ? 'COLOR · APICAL LONG AXIS' : 'COLOR · APICAL FOUR-CHAMBER');
  ctx.save();
  ctx.beginPath();
  ctx.rect(B.x + 1, B.y + 22, B.w - 2, B.h - 23);
  ctx.clip();
  // tissue: the valve leaflets meeting at the orifice
  ctx.strokeStyle = 'rgba(230,236,238,0.9)';
  ctx.lineWidth = 3;
  const gap = (L.vc / 2) * pxcm;
  ctx.beginPath();
  ctx.moveTo(ox - 2.8 * pxcm, oy + (up ? 0.3 : -0.3) * pxcm); ctx.lineTo(ox - gap, oy);
  ctx.moveTo(ox + 2.8 * pxcm, oy + (up ? 0.3 : -0.3) * pxcm); ctx.lineTo(ox + gap, oy);
  ctx.stroke();
  // flow convergence on the upstream side: speed Q / (2 pi d^2), aliasing past Va
  const upstream = up ? 1 : -1;               // +1: upstream below the valve on screen
  const step = 3;
  const q = L.q;
  if (q > 0) {
    for (let y = B.y + 22; y < B.y + B.h; y += step) {
      for (let x = B.x; x < B.x + B.w; x += step) {
        const dx = (x - ox) / pxcm, dy = (y - oy) / pxcm;
        if (dy * upstream <= 0.05) continue;
        const d = Math.hypot(dx, dy);
        if (d > 2.6) continue;
        const v = q / (2 * Math.PI * d * d);         // cm/s toward the orifice
        if (v < 8) continue;
        // component along the beam (vertical): MR/TR move away from the apex probe, AR toward it
        const along = (Math.abs(dy) / d) * v * (up ? 1 : -1);
        const [cr, cg, cb] = colorOf(along / 100, L.va / 100);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(x, y, step, step);
      }
    }
    // the jet downstream: turbulent mosaic, wider and longer with more volume
    const len = mix(1.2, 5.2, clamp(L.rvol / 80, 0, 1)) * pxcm, wid = Math.max(gap, mix(0.5, 2.4, clamp(L.rvol / 80, 0, 1)) * pxcm);
    for (const [a, b, c] of MOSAIC) {
      const u = a, w = (b - 0.5) * 2;
      const yy = oy - upstream * u * len, xx = ox + w * (gap + (wid - gap) * Math.pow(u, 0.7));
      const pal = c < 0.33 ? [255, 214, 90] : c < 0.66 ? [127, 227, 255] : [120, 220, 120];
      ctx.fillStyle = `rgba(${pal[0]},${pal[1]},${pal[2]},${0.75 - 0.5 * u})`;
      ctx.fillRect(xx, yy, 4, 4);
    }
  }
  ctx.restore();
  // PISA radius and vena contracta
  if (L.r > 0.05) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(ox, oy, L.r * pxcm, up ? 0 : Math.PI, up ? Math.PI : 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    caliper(ctx, ox, oy, ox, oy + upstream * L.r * pxcm, { solid: true, size: 3 });
    ctx.save(); ctx.font = `500 11px ${MONO}`; ctx.fillStyle = SC.cal;
    ctx.fillText(`r ${L.r.toFixed(2)} cm`, ox + 8, oy + upstream * L.r * pxcm * 0.6 + 4);
    ctx.fillText(`VC ${L.vc.toFixed(2)} cm`, ox + gap + 8, oy - upstream * 10);
    ctx.restore();
  }
  colorBar(ctx, B.x + B.w - 26, B.y + 40, B.h * 0.4, L.va / 100);
  const lab = st.regv === 'ar' ? ['aorta', 'LV'] : st.regv === 'tr' ? ['RV', 'RA'] : ['LV', 'LA'];
  ctx.save(); ctx.font = `600 12px ${SANS}`; ctx.fillStyle = SC.text;
  ctx.fillText(lab[0], B.x + 12, oy + upstream * 1.9 * pxcm);
  ctx.fillText(lab[1], B.x + 12, oy - upstream * 1.9 * pxcm);
  ctx.restore();
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const L = leak(st);
  const jb = narrow ? { x: 10, y: 8, w: W - 20, h: H * 0.52 } : { x: 24, y: 40, w: W * 0.5, h: H * 0.62 };
  drawJet(sh, t, jb, L);
  // CW of the jet: density grows with volume
  const cb = narrow ? { x: 10, y: jb.y + jb.h + 10, w: W - 20, h: H - jb.h - 26 } : { x: W * 0.55, y: 40, w: W * 0.42, h: H * 0.4 };
  panel(ctx, cb.x, cb.y, cb.w, cb.h, `CW · ${L.J.name.toUpperCase()} REGURGITATION`);
  const bx = { x: cb.x + 4, y: cb.y + 22, w: cb.w - 32, h: cb.h - 26 };
  const J = L.J;
  const dens = clamp(L.rvol / 60, 0.08, 1);
  const up = st.regv === 'ar';
  const fn = (u) => {
    const tt = (u * 2) % 1;
    const w = (tt - J.start) / J.dur;
    if (w <= 0 || w >= 1 || L.eroa <= 0) return 0;
    if (up) {
      const v = J.vmax * Math.pow(0.5, (w * J.dur * 857) / (L.pht || 400)) ** 0.5;   // falls with the pressure half-time
      return v * Math.min(1, w * 12);
    }
    return -J.vmax * Math.pow(Math.sin(Math.PI * w), 0.4);
  };
  const vs = Math.ceil(J.vmax + 0.6);
  spectral(ctx, bx, { fn, scale: vs, base: up ? 0.92 : 0.08, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `leak|${st.regv}|${L.eroa.toFixed(3)}`, seed: 12 });
  // faint signal for small jets
  if (dens < 0.6) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.6 * (1 - dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, vs, up ? 0.92 : 0.08, 1);
  ctx.save(); ctx.font = `500 11px ${MONO}`; ctx.fillStyle = SC.cal;
  ctx.fillText(`peak ${J.vmax.toFixed(1)} m/s · VTI ${J.vti} cm${L.pht ? ` · PHT ${L.pht.toFixed(0)} ms` : ''}`, bx.x + 8, up ? bx.y + 14 : bx.y + bx.h - 8);
  ctx.restore();
  // the arithmetic
  if (!narrow) {
    const x = W * 0.55, y = 40 + H * 0.4 + 36;
    const lines = [
      `flow = 2π r² × Va = 6.28 × ${L.r.toFixed(2)}² × ${L.va} = ${L.q.toFixed(0)} mL/s`,
      `EROA = flow / Vmax = ${L.q.toFixed(0)} / ${(J.vmax * 100).toFixed(0)} = ${L.eroa.toFixed(2)} cm²`,
      `RVol = EROA × VTI = ${L.eroa.toFixed(2)} × ${J.vti} = ${L.rvol.toFixed(0)} mL`,
      `RF = RVol / (RVol + ${FWD}) = ${L.rf.toFixed(0)}%`,
    ];
    lines.forEach((s, i) => sh.text(s, x, y + i * 22, { family: MONO, weight: i === 1 ? 500 : 400, size: 12, color: i === 1 ? t.ink : t.ink2 }));
  }
}

function gradeTable(art, s, L) {
  const tbl = art.querySelector('#leak-grade');
  if (!tbl) return;
  const rows = ROWS[s.regv];
  tbl.innerHTML = `<caption>${L.J.name} regurgitation, ASE 2017</caption>
    <thead><tr><th>Measure</th><th class="num">Value</th><th>Mild</th><th>Moderate</th><th>Severe</th></tr></thead>
    <tbody>${rows.map(([name, k, cells]) => {
      const v = L[k];
      const val = k === 'eroa' || k === 'vc' || k === 'r' ? v.toFixed(2) : v.toFixed(0);
      return `<tr><td>${name}</td><td class="num">${val}</td>${cells.map(([txt, fn]) => `<td class="${fn(v) ? 'cur' : ''}">${txt}</td>`).join('')}</tr>`;
    }).join('')}</tbody>`;
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'leak',
  part: 'valves',
  title: 'Leak',
  dwell: 16,
  defaults: { regv: 'mr', mrEroa: 0.3, arEroa: 0.2, trEroa: 0.3, nyq: 40 },
  format: {
    mrEroa: (v) => `${v.toFixed(2)} cm²`,
    arEroa: (v) => `${v.toFixed(2)} cm²`,
    trEroa: (v) => `${v.toFixed(2)} cm²`,
    nyq: (v) => `${Math.round(v)} cm/s`,
  },
  watch: ['regv', 'mrEroa', 'arEroa', 'trEroa', 'nyq'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  anim(dt) { if (!reducedMotion) clock += dt; },
  tourEnter(set) { set({ regv: 'mr', mrEroa: 0.1, nyq: 40 }); },
  tourTick(tt, set) {
    if (tt < 6) set({ mrEroa: Math.round((0.1 + clamp((tt - 1) / 4.5, 0, 1) * 0.35) * 100) / 100 });
    else if (tt < 9) set({ nyq: Math.round(40 - clamp((tt - 6) / 2.5, 0, 1) * 10) });
    else if (tt < 12.5) set({ regv: 'ar', arEroa: 0.3, nyq: 40 });
    else set({ regv: 'tr', trEroa: 0.45 });
  },
  text(s, { cite }) {
    const L = leak(s);
    const g = L.grade;
    return {
      readouts: [
        { k: 'EROA', v: fmt(L.eroa, 2), u: 'cm²', flag: g === 'severe' },
        { k: 'Regurgitant volume', v: fmt(L.rvol), u: 'mL', flag: g === 'severe' },
        { k: 'Regurgitant fraction', v: fmt(L.rf), u: '%', flag: L.rf >= 50 },
        { k: 'PISA radius', v: fmt(L.r, 2), u: 'cm' },
        { k: 'Vena contracta', v: fmt(L.vc, 2), u: 'cm' },
        { k: 'Grade (by EROA)', v: g, text: true, flag: g === 'severe' },
      ],
      live: `${L.J.name[0].toUpperCase()}${L.J.name.slice(1)} regurgitation through ${fmt(L.eroa, 2)} cm²: the shell where flow reaches ${Math.round(s.nyq)} cm/s has a radius of ${fmt(L.r, 2)} cm, so peak flow is ${fmt(L.q)} mL/s and ${fmt(L.rvol)} mL leak back each beat${cite('zoghbi2017')}. <b>${g[0].toUpperCase()}${g.slice(1)}</b> by EROA. Lower the aliasing velocity: the shell grows, the EROA does not.`,
      extra: (art) => gradeTable(art, s, L),
    };
  },
};
