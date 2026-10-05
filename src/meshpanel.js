// An echo view cut from the heart mesh, in a panel of a chapter's figure: the code that the
// chapters whose echo images come from the mesh share. It loads the model once (scanner.js) and
// the chapter's disease targets (model3d.js diseaseTargets), keeps the view's canvas at the
// panel's size, cuts a frame at a time of the cycle, draws the depth marks and the chamber names,
// and returns a frame F in the shape of echo2d.js frame(), so that the overlays of the parametric
// views (measurement boxes, calipers, jets) draw on the mesh view unchanged. The heart is the one
// the page shows (the header's choice), with the chapter's disease on it.
import { MONO, clamp } from './sketch.js';
import { panel, SC, sectorPath } from './scope.js';
import { note } from './sev.js';
import { cycleAt } from './cyclemodel.js';
import { scanner } from './scanner.js';
import { diseaseTargets, lvMask, rvMask } from './model3d.js';
import { measures } from './echo2d.js';

// the panels started on this page (start): a video page waits for all of them (video/chapter.js)
const STARTED = new Set();
/** True when every mesh panel started on this page has its model and targets, or has failed. */
export function meshPanelsReady() {
  for (const p of STARTED) if (p.state !== 'ready' && p.state !== 'failed') return false;
  return true;
}

export class MeshPanel {
  /**
   * view: a view key of views.js (a4c, plax...). o.diseases: the disease keys the chapter
   * weights (phenomesh.js DISEASE); o.lv: the chapter scales the LV's own contraction (draw's
   * o.lvK); o.rv: the chapter scales the RV free wall's own contraction (draw's o.rvK); o.redraw:
   * called when the model or the targets arrive.
   */
  constructor(view, o = {}) {
    this.view = view;
    this.diseases = o.diseases || [];
    this.lv = !!o.lv;
    this.rv = !!o.rv;
    this.mask = null;
    this.rvMask = null;
    this.redraw = o.redraw || (() => {});
    this.ev = null;
    this.shifts = null;
    this.state = 'idle';     // idle, loading, ready, failed
    this.last = '';          // what the canvas holds: time, size, disease and heart
    this.regKey = '';        // the regional wall motion the view holds (draw's o.regional)
  }

  /** Show another view (views.js key): the next draw cuts it. */
  setView(view) {
    if (view === this.view) return;
    this.view = view;
    if (this.ev) { this.ev.setView(view, { animate: false }); this.last = ''; }
  }

  /** Load the model and the disease targets, once. */
  start() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    STARTED.add(this);
    (async () => {
      const S = await scanner();
      const shifts = this.diseases.length ? await diseaseTargets(this.diseases) : null;
      if (this.lv) this.mask = await lvMask();
      if (this.rv) this.rvMask = await rvMask();
      const ev = S.make(300, 240, this.view, { fill: true });
      ev.setView(this.view, { animate: false });
      this.ev = ev;
      this.shifts = shifts;
      this.state = 'ready';
      this.redraw();
    })().catch((err) => {
      console.error('mesh panel failed:', err);
      this.state = 'failed';
      this.redraw();
    });
  }

  /**
   * Draw the panel P (canvas px) with title. o.tms: the time in the cycle (ms); o.disease:
   * weights by disease key, or a function of the heart shown that gives them; o.motion: weights
   * of the moves within the beat (echo.js setMotion); o.standoff: cm of fluid between the probe
   * and the heart, and o.deeper: cm added to the view's depth; o.sac: lung and fat outside the
   * sac, and o.still (0 to 1): the sac keeps still in systole; o.lvK: the LV's own contraction
   * (echo.js setLvSys); o.rvK: the RV free wall's own contraction and o.rvT the tricuspid valve's travel (echo.js setRvSys); o.fore: cm the probe sits off the plane (echo.js setFore); o.over(ctx,
   * F, ev): drawn on the image before the box and the names (jets, calipers); o.lines: the
   * measurement box (echo2d.js measures); o.names: chamber names, [[anchor, text], ...], kept
   * clear of the box; [anchor, text, toward, f] puts the name fraction f of the way from anchor
   * to anchor toward; a function (ev, s) -> [u, v] (cm on the plane, or null) in place of the
   * anchor puts it there. o.drive(drive, t): the valves' drive at time t (ms) for this view, from
   * the cycle model's (cyclemodel.js), for a valve that moves otherwise. o.shift: cm the plane
   * moves along its normal (echo.js setShift). o.calc: calcified valves, level by valve mesh
   * name (echo.js setCalc). o.regional: { key, scale, peri }, regional wall motion (echo.js
   * setRegional), taken when its key changes; o.noSys: the heart's own systolic change is off,
   * as where a chapter sets the wall motion itself (echo.js noSys). o.hide: valve mesh names
   * left out of the cut, and o.extra(ev, g, state): B-mode items of the chapter's own on the
   * plane, with o.extraKey naming what they show (a prosthesis, ch/prosthetic.js).
   * Returns F, or null while the model loads.
   */
  draw(ctx, P, title, o = {}) {
    panel(ctx, P.x, P.y, P.w, P.h, title);
    // the image fills the panel's height, as the parametric views do: its sides may be cut; the
    // depth marks take a strip at the right
    const bx = { x: P.x + 4, y: P.y + 22, w: P.w - 30, h: P.h - 26 };
    if (this.state !== 'ready') {
      this.start();
      note(ctx, bx, this.state === 'failed' ? 'no heart model' : 'loading the heart model', 'top');
      return null;
    }
    const ev = this.ev;
    const w = Math.max(60, Math.round(bx.w)), h = Math.max(60, Math.round(bx.h));
    if (ev.w !== w || ev.h !== h) ev.setSize(w, h);
    const disease = (typeof o.disease === 'function' ? o.disease(ev.model.pheno.key) : o.disease) || {};
    ev.setDisease(disease, this.shifts);
    ev.setMotion(o.motion || {});
    ev.setStandoff(o.standoff || 0);
    ev.depth = undefined;
    if (o.deeper) ev.depth = ev.specOf(this.view).depth + o.deeper;
    ev.sac = !!o.sac;
    ev.periStill = o.still || 0;
    // o.peri: a thick pericardium, { w: the bright line's width (cm), e: its level (dB) }
    ev.periW = o.peri?.w ?? 0.15;
    ev.periE = o.peri?.e ?? 8;
    ev.setLvSys(o.lvK ?? 1, this.mask);
    ev.setRvSys(o.rvK ?? 1, this.rvMask, o.rvT ?? 1);
    ev.setFore(o.fore || 0);
    ev.setShift(o.shift || 0);
    ev.setCalc(o.calc || {});
    const reg = o.regional || null, regKey = reg ? reg.key : '';
    if (regKey !== this.regKey) { ev.setRegional(reg ? reg.scale : null, reg ? reg.peri : null); this.regKey = regKey; }
    ev.noSys = !!o.noSys;
    ev.hideValves = o.hide || null;
    ev.extraItems = o.extra || null;
    const tms = o.tms ?? 0;
    const c = cycleAt(tms);
    const drive = o.drive ? o.drive(c.drive, c.t) : c.drive;
    const key = [tms, `${w}x${h}`, JSON.stringify(disease), JSON.stringify(o.motion || {}), o.standoff || 0, o.deeper || 0, ev.sac, ev.periStill, ev.periW, ev.periE, o.lvK ?? 1, o.rvK ?? 1, o.rvT ?? 1, o.fore || 0, o.shift || 0, JSON.stringify(o.calc || {}), regKey, ev.noSys, ev.model.pheno.version, JSON.stringify(drive), o.extraKey || ''].join('|');
    if (key !== this.last) {
      ev.frame({ s: c.s, v: c.v, drive, phase: c.phase, t: c.t });
      this.last = key;
    }
    ctx.drawImage(ev.canvas, bx.x, bx.y, w, h);
    const F = this.frameOf(P, bx);
    if (o.over) o.over(ctx, F, ev);
    this.depthMarks(ctx, bx, F.barEnd);
    if (o.lines) measures(ctx, F, o.lines);
    if (o.names) this.tags(ctx, F, o.names, cycleAt(tms).s, F.meas || null);
    return F;
  }

  /** The frame of echo2d.js frame() for this view in box bx: cm on the plane -> canvas px. */
  frameOf(P, bx) {
    const mp = this.ev.map, spec = this.ev.specOf(this.view);
    const cx = bx.x + mp.cx, top = bx.y + mp.top, k = mp.scale, R = spec.depth * k;
    const clipBox = new Path2D();
    clipBox.rect(bx.x, bx.y, bx.w, bx.h);
    return {
      P: (p) => [cx + p[0] * k, top + p[1] * k],
      k, box: P, clipBox, zoom: false, depth: spec.depth,
      sect: { cx, top, R, deg: spec.angle },
      view: { box: bx, cx, top, k, half: mp.half, depth: spec.depth, near: spec.near ?? 1.2 },
      fan: sectorPath(cx, top, R, spec.angle),
      // a landmark of the heart shown on this plane (cm): world point -> [u, v]
      cm: (p) => { const q = this.ev.toPlane(p, this.ev.g); return [q[0], q[1]]; },
    };
  }

  /**
   * Depth marks in the strip right of the image, as echo2d.js finish() draws them; no number
   * above barEnd, where a color bar's legend (echo2d.js barFor) takes the strip.
   */
  depthMarks(ctx, bx, barEnd = 0) {
    const mp = this.ev.map, depth = this.ev.specOf(this.view).depth;
    if (!mp) return;
    ctx.save();
    ctx.strokeStyle = SC.dim;
    ctx.fillStyle = SC.dim;
    ctx.font = `500 10px ${MONO}`;
    ctx.lineWidth = 1;
    const x = bx.x + bx.w + 2;
    for (let d = 1; d < depth; d++) {
      const y = bx.y + mp.Y(d);
      if (y > bx.y + bx.h - 6) break;
      const l = d % 5 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + l, y);
      ctx.stroke();
      if (d % 5 === 0 && y - 6 > barEnd) ctx.fillText(String(d), x + 8, y + 3.5);
    }
    ctx.restore();
  }

  /**
   * Chamber names from the heart's anchors on the plane, kept inside the image when a chamber
   * runs past its edge (as echo2d.js tag() does); none inside the box avoid.
   */
  tags(ctx, F, list, s, avoid = null) {
    const ev = this.ev, g = ev.g, bx = F.view.box;
    if (!g) return;
    const an = ev.anchors(s);
    ctx.save();
    ctx.font = `600 11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,10,12,0.85)';
    ctx.fillStyle = 'rgba(214,222,226,0.92)';
    for (const [k, name, toward, f] of list) {
      let q = null;
      if (typeof k === 'function') q = k(ev, s);
      else if (an[k]) q = F.cm(toward && an[toward] ? an[k].clone().lerp(an[toward], f) : an[k]);
      if (!q) continue;
      const hw = ctx.measureText(name).width / 2 + 3;
      const [x0, y0] = F.P(q);
      const x = clamp(x0, bx.x + hw + 2, bx.x + bx.w - hw - 2), y = clamp(y0, bx.y + 10, bx.y + bx.h - 10);
      if (avoid && x + hw > avoid.x && x - hw < avoid.x + avoid.w && y + 9 > avoid.y && y - 9 < avoid.y + avoid.h) continue;
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  }
}
