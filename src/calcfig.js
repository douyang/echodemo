// Two drawings for the calculators in the text, to scale, as SVG: the flow convergence of the PISA
// method (mr.js, tr.js) and the two columns of blood of the continuity equation (as.js). Each
// chapter draws its own after each change of its values. Colours: the theme's (styles.css .cfig).

const fx = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** An arrowhead at the end of a line from (x0, y0) to (x1, y1). */
function head(x0, y0, x1, y1, s = 5) {
  const a = Math.atan2(y1 - y0, x1 - x0), p = (t) => `${(x1 - s * Math.cos(a + t)).toFixed(1)},${(y1 - s * Math.sin(a + t)).toFixed(1)}`;
  return `<path class="cf-arw" d="M${p(0.45)} L${x1.toFixed(1)},${y1.toFixed(1)} L${p(-0.45)}"/>`;
}

/**
 * The PISA method at the values v (r and the radius line in cm, va cm/s, flow mL/s, eroa cm²,
 * vmax m/s). The valve plane with an orifice of the EROA; on the upstream side the hemisphere of
 * radius r, where the flow toward the orifice reaches the aliasing velocity; the flow lines into it;
 * the jet beyond. up, down: the chambers on either side. 60 px to the cm, less for a radius above
 * 1.27 cm so that its flow lines fit; the scale bar shows the scale.
 */
export function pisaFig(v, { up, down }) {
  const S = Math.min(60, 76 / Math.max(v.r, 0.1)), cx = 150, y0 = 112, R = Math.max(0, v.r) * S;
  // the orifice as a circle of the EROA: its diameter
  const g = Math.max(3, 2 * Math.sqrt(Math.max(0, v.eroa) / Math.PI) * S);
  const parts = [];
  // the flow toward the orifice, slower than the aliasing velocity, then the aliased hemisphere
  if (R > 0) {
    parts.push(`<path class="cf-pre" d="M${cx - R - 34},${y0} A${R + 34},${R + 34} 0 0 1 ${cx + R + 34},${y0} Z"/>`);
    parts.push(`<path class="cf-shell" d="M${cx - R},${y0} A${R},${R} 0 0 1 ${cx + R},${y0} Z"/>`);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.08 + (0.84 * i) / 6), c = Math.cos(a), s = Math.sin(a);
      const xa = cx + (R + 32) * c, ya = y0 + (R + 32) * s, xb = cx + (R + 7) * c, yb = y0 + (R + 7) * s;
      parts.push(`<line class="cf-flow" x1="${xa.toFixed(1)}" y1="${ya.toFixed(1)}" x2="${xb.toFixed(1)}" y2="${yb.toFixed(1)}"/>${head(xa, ya, xb, yb)}`);
    }
    // the radius, from the orifice to the shell, and the shell's velocity
    const ar = -Math.PI * 0.62, xr = cx + R * Math.cos(ar), yr = y0 + R * Math.sin(ar);
    parts.push(`<line class="cf-r" x1="${cx}" y1="${y0}" x2="${xr.toFixed(1)}" y2="${yr.toFixed(1)}"/>`);
    parts.push(`<text class="cf-t cf-k" x="${(cx - R - 8).toFixed(1)}" y="${y0 - 7}" text-anchor="end">r ${fx(v.r, 2)} cm</text>`);
    const as = -Math.PI * 0.2, xs = cx + R * Math.cos(as), ys = y0 + R * Math.sin(as);
    parts.push(`<text class="cf-t" x="${(xs + 8).toFixed(1)}" y="${(ys - 4).toFixed(1)}">Va ${fx(v.va, 0)} cm/s</text>`);
  } else {
    parts.push(`<text class="cf-t" x="${cx}" y="${y0 - 40}" text-anchor="middle">No flow convergence</text>`);
  }
  // the jet through the orifice
  if (v.eroa > 0) parts.push(`<path class="cf-jet" d="M${(cx - g / 2).toFixed(1)},${y0} L${(cx - g / 2 - 7).toFixed(1)},164 L${(cx + g / 2 + 7).toFixed(1)},164 L${(cx + g / 2).toFixed(1)},${y0} Z"/>`);
  // the valve plane, open at the orifice
  parts.push(`<line class="cf-valve" x1="18" y1="${y0}" x2="${(cx - g / 2).toFixed(1)}" y2="${y0}"/><line class="cf-valve" x1="${(cx + g / 2).toFixed(1)}" y1="${y0}" x2="282" y2="${y0}"/>`);
  parts.push(`<text class="cf-t cf-k" x="${(cx + g / 2 + 12).toFixed(1)}" y="${y0 + 16}">EROA ${fx(v.eroa, 2)} cm²</text>`);
  if (v.eroa > 0) parts.push(`<text class="cf-t" x="${(cx + g / 2 + 12).toFixed(1)}" y="${y0 + 30}">jet ${fx(v.vmax, 1)} m/s</text>`);
  parts.push(`<text class="cf-ch" x="20" y="22">${up}</text><text class="cf-ch" x="20" y="${y0 + 46}">${down}</text>`);
  // the scale
  parts.push(`<line class="cf-scale" x1="222" y1="160" x2="${222 + S}" y2="160"/><text class="cf-t" x="${222 + S / 2}" y="154" text-anchor="middle">1 cm</text>`);
  const label = R > 0
    ? `Flow convergence to scale: a hemisphere of radius ${fx(v.r, 2)} cm at an aliasing velocity of ${fx(v.va, 0)} cm/s, flow ${fx(v.flow, 0)} mL/s into an orifice of ${fx(v.eroa, 2)} cm².`
    : 'No flow convergence.';
  return `<svg class="cfig" viewBox="0 0 300 170" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}

/**
 * The continuity equation at the values v (lvotD cm, csa cm², vtiL cm, ava cm², vtiA cm, sv mL):
 * the blood that one beat moves through the LVOT and through the valve, as two columns of the same
 * volume. Widths are the diameters (the AVA as a circle) at 34 px to the cm; heights are the
 * VTIs at 0.8 px to the cm.
 */
export function continuityFig(v) {
  const S = 34, K = 0.8, base = 150, top = (h) => base - h;
  const col = (cx, w, h, cls) => {
    const ry = Math.max(2, w * 0.16), x = cx - w / 2;
    return `<path class="${cls}" d="M${x.toFixed(1)},${top(h).toFixed(1)} L${x.toFixed(1)},${base} A${(w / 2).toFixed(1)},${ry.toFixed(1)} 0 0 0 ${(x + w).toFixed(1)},${base} L${(x + w).toFixed(1)},${top(h).toFixed(1)} Z"/>`
      + `<ellipse class="${cls} cf-cap" cx="${cx}" cy="${top(h).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${ry.toFixed(1)}"/>`;
  };
  const wL = Math.max(4, v.lvotD * S), hL = Math.max(2, v.vtiL * K);
  const wA = Math.max(3, 2 * Math.sqrt(Math.max(0, v.ava) / Math.PI) * S), hA = Math.max(2, v.vtiA * K);
  const xL = 82, xA = 218;
  const parts = [
    col(xL, wL, hL, 'cf-lvot'), col(xA, wA, hA, 'cf-av'),
    `<text class="cf-ch" x="${xL}" y="${base + 22}" text-anchor="middle">LVOT</text>`,
    `<text class="cf-t" x="${xL}" y="${base + 36}" text-anchor="middle">${fx(v.csa, 2)} cm² × ${fx(v.vtiL, 0)} cm</text>`,
    `<text class="cf-ch" x="${xA}" y="${base + 22}" text-anchor="middle">Aortic valve</text>`,
    `<text class="cf-t" x="${xA}" y="${base + 36}" text-anchor="middle">${fx(v.ava, 2)} cm² × ${fx(v.vtiA, 0)} cm</text>`,
    `<text class="cf-t cf-k" x="150" y="${base + 54}" text-anchor="middle">the same ${fx(v.sv, 0)} mL in each beat</text>`,
    `<text class="cf-t" x="${xL}" y="${(top(hL) - 12).toFixed(1)}" text-anchor="middle">VTI ${fx(v.vtiL, 0)} cm</text>`,
    `<text class="cf-t" x="${xA}" y="${(top(hA) - 12).toFixed(1)}" text-anchor="middle">VTI ${fx(v.vtiA, 0)} cm</text>`,
  ];
  const label = `Continuity equation to scale: ${fx(v.csa, 2)} cm² × ${fx(v.vtiL, 0)} cm through the LVOT and ${fx(v.ava, 2)} cm² × ${fx(v.vtiA, 0)} cm through the valve, the same stroke volume of ${fx(v.sv, 0)} mL.`;
  return `<svg class="cfig" viewBox="0 0 300 210" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}
