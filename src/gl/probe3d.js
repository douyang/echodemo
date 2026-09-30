// A phased-array cardiac transducer (cm). The top of the lens sits at the origin and the beam
// leaves along +Y; the footprint's long side runs along X (the array), with the index marker on
// +X (the side that shows on screen-right); the housing and the strain relief run back along -Y.
// About 13 cm from the lens to the cable, with a 2.6 x 1.7 cm head. The caller draws the cable,
// which hangs from PROBE_TAIL.
import * as THREE from '../../vendor/three.bundle.min.js';

const LENS = 0.19;   // the lens stands this far proud of the housing's face
/** From the top of the lens to the end of the strain relief, where the cable leaves (cm). */
export const PROBE_TAIL = 12.9 + LENS;

/** A closed ring |x/w|^n + |z/d|^n = 1 of M points. */
function ring(w, d, n, M) {
  const out = [];
  for (let k = 0; k < M; k++) {
    const t = (k / M) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    out.push([w * Math.sign(c) * Math.abs(c) ** (2 / n), d * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return out;
}

/** A solid through the sections [y, half-width, half-depth, exponent], top to bottom, capped. */
function loft(sections, M = 44) {
  const pos = [], idx = [];
  for (const [y, w, d, n] of sections) for (const [x, z] of ring(w, d, n, M)) pos.push(x, y, z);
  const R = sections.length;
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c = a + M, e = b + M;
      idx.push(a, b, c, b, e, c);
    }
  }
  const top = pos.length / 3;
  pos.push(0, sections[0][0], 0, 0, sections[R - 1][0], 0);
  for (let k = 0; k < M; k++) {
    const k2 = (k + 1) % M;
    idx.push(top, k2, k, top + 1, (R - 1) * M + k, (R - 1) * M + k2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A rounded rectangle, w x h with corner radius r, centred on the origin. */
function rounded(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// the housing: a squared head round the array, a narrower neck, an oval grip, a taper to the cable
const HOUSING = [
  [0.0, 1.18, 0.74, 5], [-0.1, 1.27, 0.82, 5], [-0.26, 1.31, 0.86, 5], [-1.3, 1.31, 0.86, 4.5],
  [-1.9, 1.22, 0.86, 4], [-2.5, 1.06, 0.84, 3.2], [-3.2, 1.0, 0.86, 2.7], [-4.5, 1.06, 0.93, 2.4],
  [-6.5, 1.1, 0.97, 2.3], [-8.5, 1.06, 0.94, 2.3], [-9.8, 0.9, 0.82, 2.2], [-10.6, 0.62, 0.58, 2.1],
  [-11.0, 0.42, 0.42, 2],
];
const RELIEF = [[-10.9, 0.4, 0.4, 2], [-12.3, 0.31, 0.31, 2], [-12.9, 0.26, 0.26, 2]];

/** The transducer as a group, to the end of the strain relief. mats: probeMaterials(). */
export function makeProbe(mats) {
  const g = new THREE.Group();
  const housing = loft(HOUSING);
  housing.translate(0, -LENS, 0);
  g.add(new THREE.Mesh(housing, mats.body));
  // the lens: a rubber pad over the array, its edges rounded
  const lens = new THREE.ExtrudeGeometry(rounded(2.02, 1.22, 0.3), { depth: 0.01, bevelEnabled: true, bevelThickness: LENS / 2, bevelSize: 0.1, bevelSegments: 5, curveSegments: 10 });
  lens.rotateX(-Math.PI / 2);        // the pad's thickness runs along +Y
  lens.translate(0, -LENS / 2 - 0.01, 0);
  g.add(new THREE.Mesh(lens, mats.lens));
  // the index marker: a ridge on the +X side of the head
  const mark = new THREE.BoxGeometry(0.14, 0.62, 0.4);
  mark.translate(1.33, -LENS - 0.75, 0);
  g.add(new THREE.Mesh(mark, mats.mark));
  const relief = loft(RELIEF, 20);
  relief.translate(0, -LENS, 0);
  g.add(new THREE.Mesh(relief, mats.cable));
  return g;
}

/** Shaded materials for the transducer; themeProbe sets their colours. */
export function probeMaterials() {
  return {
    body: new THREE.MeshPhongMaterial({ color: 0x30363a, specular: 0x3a3a3a, shininess: 55 }),
    lens: new THREE.MeshPhongMaterial({ color: 0x7a8286, specular: 0x1a1a1a, shininess: 14 }),
    mark: new THREE.MeshPhongMaterial({ color: 0xf1f2f0, specular: 0x222222, shininess: 30 }),
    cable: new THREE.MeshPhongMaterial({ color: 0x1f262b, specular: 0x2a2a2a, shininess: 35 }),
  };
}

/** The hex of colour a mixed toward b by t, mixed as the page mixes colours (in sRGB). */
export function mixHex(a, b, t) {
  const A = new THREE.Color().setStyle(a, THREE.LinearSRGBColorSpace), B = new THREE.Color().setStyle(b, THREE.LinearSRGBColorSpace);
  return '#' + A.lerp(B, t).getHexString(THREE.LinearSRGBColorSpace);
}

/** mixHex as a colour in colour space cs: sRGB for encoded passes, linear to write it as it is. */
export function mix(a, b, t, cs = THREE.SRGBColorSpace) {
  return new THREE.Color().setStyle(mixHex(a, b, t), cs);
}

/**
 * Colours from the page's tokens: a graphite probe on paper, a pale one on slate. tone: how far
 * the housing goes from ink toward paper. raw: for a pass that writes colours without encoding
 * them (the pencil renderer's overlay), so the hex values show as they are.
 */
export function themeProbe(mats, tok, tone = 0.35, raw = false) {
  const ink = tok.ink || '#1f262b', paper = tok.paper || '#e2e4e3';
  const cs = raw ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
  mats.body.color.copy(mix(ink, paper, tone, cs));
  mats.lens.color.copy(mix(ink, paper, Math.min(0.9, tone + 0.25), cs));
  mats.mark.color.copy(mix(tok.paper2 || '#f1f2f0', ink, 0.05, cs));
  mats.cable.color.copy(mix(ink, paper, 0.08, cs));
}

/** Put the probe on the skin at O: beam along d, array along r (marker toward +r). */
export function placeProbe(probe, O, d, r) {
  const dn = d.clone().normalize();
  const x = r.clone().addScaledVector(dn, -r.dot(dn)).normalize();   // r made square to d
  const z = new THREE.Vector3().crossVectors(x, dn);
  probe.position.copy(O);
  probe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dn, z));
}
