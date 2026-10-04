// An echo view cut from the heart mesh, in a panel of a chapter's figure: the code that the
// chapters whose echo images come from the mesh share. It loads the model once (scanner.js) and
// the chapter's disease targets (model3d.js diseaseTargets), keeps the view's canvas at the
// panel's size, cuts a frame at a time of the cycle, draws the depth marks and the chamber names,
// and returns a frame F in the shape of echo2d.js frame(), so that the overlays of the parametric
// views (measurement boxes, calipers, jets) draw on the mesh view unchanged. The heart is the one
// the page shows (the header's choice), with the chapter's disease on it.
import { MONO } from './sketch.js';
import { panel, SC, sectorPath } from './scope.js';
import { note } from './sev.js';
import { cycleAt } from './cyclemodel.js';
import { scanner } from './scanner.js';
import { diseaseTargets } from './model3d.js';
import { measures } from './echo2d.js';

export class MeshPanel {
  /**
   * view: a view key of views.js (a4c, plax...). o.diseases: the disease keys the chapter
   * weights (phenomesh.js DISEASE); o.redraw: called when the model or the targets arrive.
   */
  constructor(view, o = {}) {
    this.view = view;
    this.diseases = o.diseases || [];
    this.redraw = o.redraw || (() => {});
    this.ev = null;
    this.shifts = null;
    this.state = 'idle';     // idle, loading, ready, failed
    this.last = '';          // what the canvas holds: time, size, disease and heart
  }

  /** Load the model and the disease targets, once. */
  start() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    (async () => {
      const S = await scanner();
      const shifts = this.diseases.length ? await diseaseTargets(this.diseases) : null;
      const ev = S.make(300, 240, this.view);
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
   * weights by disease key, or a function of the heart shown that gives them; o.lines: the
   * measurement box (echo2d.js measures); o.names: chamber names, [[anchor, text], ...], kept
   * clear of the box. Returns F, or null while the model loads.
   */
  draw(ctx, P, title, o = {}) {
    panel(ctx, P.x, P.y, P.w, P.h, title);
    const bx = { x: P.x + 4, y: P.y + 22, w: P.w - 8, h: P.h - 26 };
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
    const tms = o.tms ?? 0;
    const key = `${tms}|${w}x${h}|${JSON.stringify(disease)}|${ev.model.pheno.version}`;
    if (key !== this.last) {
      const c = cycleAt(tms);
      ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
      this.last = key;
    }
    ctx.drawImage(ev.canvas, bx.x, bx.y, w, h);
    const F = this.frameOf(P, bx);
    this.depthMarks(ctx, bx);
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

  /** Depth marks on the right edge of the image, every centimetre, numbered every five. */
  depthMarks(ctx, bx) {
    const mp = this.ev.map, depth = this.ev.specOf(this.view).depth;
    if (!mp) return;
    ctx.save();
    ctx.strokeStyle = SC.dim;
    ctx.fillStyle = SC.dim;
    ctx.font = `400 9px ${MONO}`;
    ctx.textAlign = 'right';
    const x = bx.x + bx.w - 2;
    for (let d = 1; d <= depth; d++) {
      const y = bx.y + mp.Y(d);
      if (y > bx.y + bx.h - 3) break;
      ctx.beginPath();
      ctx.moveTo(x - (d % 5 ? 3 : 6), y);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (d % 5 === 0) ctx.fillText(String(d), x - 8, y + 3);
    }
    ctx.restore();
  }

  /** Chamber names from the heart's anchors on the plane; none inside the box avoid. */
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
    for (const [k, name] of list) {
      if (!an[k]) continue;
      const [x, y] = F.P(F.cm(an[k]));
      if (x < bx.x + 12 || x > bx.x + bx.w - 12 || y < bx.y + 10 || y > bx.y + bx.h - 10) continue;
      const hw = ctx.measureText(name).width / 2 + 3;
      if (avoid && x + hw > avoid.x && x - hw < avoid.x + avoid.w && y + 9 > avoid.y && y - 9 < avoid.y + avoid.h) continue;
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  }
}
