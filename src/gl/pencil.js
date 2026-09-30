// Real-time pencil rendering: graphite hatching, chalk lights, wobbly contours.
//
// Pass 1  normals + depth of the heart     -> rtNormal (depth texture)
// Pass 2  data: tone, region, flag         -> rtData
// Pass 3  pericardium alone (normal/depth) -> rtPeri, drawn as a faint outline
// Pass 4  composite to the canvas with premultiplied alpha, so the page paper
//         shows through wherever nothing is drawn.
// Tools (the probe) go through passes 1 and 2 with the heart; setToolInk draws them in a pencil
// of their own. An inset (the body key) runs the same passes in its corner: its solids hatched,
// its body as an outline in the third pass.
import * as THREE from '../../vendor/three.bundle.min.js';

const QUAD_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMPOSITE_FS = /* glsl */`
precision highp float;
uniform sampler2D tData;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tPeriNormal;
uniform sampler2D tPeriDepth;
uniform vec2 uRes;
uniform float uDpr;
uniform float uBoil;
uniform float uDark;
uniform float uNear;
uniform float uFar;
uniform float uAmyloid;
uniform float uPeri;
uniform float uPeriDash;
uniform float uPeriInk;
uniform vec4 uView;
uniform vec3 uInk;
uniform vec3 uLift;
uniform vec3 uCongo;
uniform vec3 uTool;
uniform float uToolOn;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// Sobel-like edge strength from depth, normals and coverage.
float edges(sampler2D nTex, sampler2D dTex, vec2 uv, float r, float useCover) {
  vec2 o = r / uRes;
  vec4 nc4 = texture2D(nTex, uv);
  vec3 nc = nc4.xyz * 2.0 - 1.0;
  float dc = linDepth(texture2D(dTex, uv).r);
  float ac = step(0.001, nc4.a);
  float ed = 0.0, en = 0.0, ea = 0.0;
  vec2 offs[8];
  offs[0] = vec2(-1.0, 0.0); offs[1] = vec2(1.0, 0.0); offs[2] = vec2(0.0, -1.0); offs[3] = vec2(0.0, 1.0);
  offs[4] = vec2(-0.7, -0.7); offs[5] = vec2(0.7, 0.7); offs[6] = vec2(-0.7, 0.7); offs[7] = vec2(0.7, -0.7);
  for (int i = 0; i < 8; i++) {
    vec2 q = uv + offs[i] * o;
    vec4 n4 = texture2D(nTex, q);
    float a = step(0.001, n4.a);
    ea += abs(a - ac);
    if (a > 0.5 && ac > 0.5) {
      ed = max(ed, abs(linDepth(texture2D(dTex, q).r) - dc));
      en = max(en, 1.0 - dot(n4.xyz * 2.0 - 1.0, nc));
    }
  }
  float depthEdge = smoothstep(0.018, 0.05, ed / max(dc, 1e-3));
  float normalEdge = smoothstep(0.28, 0.62, en);
  float coverEdge = smoothstep(0.5, 2.0, ea) * useCover;
  return max(max(depthEdge, normalEdge * 0.85), coverEdge);
}

float hatch(vec2 p, float ang, float gap, float width, float seed) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nrm = vec2(-dir.y, dir.x);
  float u = dot(p, nrm) + (noise(p * 0.018 + seed) - 0.5) * gap * 0.9;
  float f = abs(fract(u / gap) - 0.5) * gap;
  float line = 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.85, f);
  float along = dot(p, dir);
  float seg = noise(vec2(along * 0.03, floor(u / gap) * 7.13 + seed));
  line *= smoothstep(0.22, 0.38, seg);
  line *= 0.62 + 0.38 * noise(p * 0.21 + seed * 3.0);
  return line;
}

vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a + dst.rgb * (1.0 - a), a + dst.a * (1.0 - a)); }

void main() {
  // the part of the targets this quad shows: all of them, or an inset's corner
  vec2 uv = uView.xy + vUv * uView.zw;
  vec2 p = gl_FragCoord.xy / uDpr;
  vec2 wob = (vec2(noise(uv * 7.0 + uBoil), noise(uv * 7.0 + 19.7 + uBoil)) - 0.5) * 2.2 * uDpr / uRes;

  vec4 d = texture2D(tData, uv);
  float cover = d.a;
  float tone = d.r;
  float flag = d.b;
  float cap = step(0.9, flag);
  float valve = step(0.2, flag) * step(flag, 0.3);
  float coronary = step(0.45, flag) * step(flag, 0.55);
  float tool = step(0.7, flag) * step(flag, 0.8);
  float warm = step(0.58, flag) * step(flag, 0.62);   // drawn in red pencil (the body key's heart)
  // a tool in its own pencil (setToolInk): its outline too, on both sides of the line
  float toolNear = tool;
  if (uToolOn > 0.5) {
    vec2 o = 2.0 * uDpr / uRes;
    vec4 q0 = texture2D(tData, uv + vec2(o.x, 0.0)), q1 = texture2D(tData, uv - vec2(o.x, 0.0));
    vec4 q2 = texture2D(tData, uv + vec2(0.0, o.y)), q3 = texture2D(tData, uv - vec2(0.0, o.y));
    toolNear = max(toolNear, step(0.001, q0.a) * step(0.7, q0.b) * step(q0.b, 0.8));
    toolNear = max(toolNear, step(0.001, q1.a) * step(0.7, q1.b) * step(q1.b, 0.8));
    toolNear = max(toolNear, step(0.001, q2.a) * step(0.7, q2.b) * step(q2.b, 0.8));
    toolNear = max(toolNear, step(0.001, q3.a) * step(0.7, q3.b) * step(q3.b, 0.8));
  }

  float e = edges(tNormal, tDepth, uv + wob, 1.0 * uDpr, 1.0);
  e = max(e, 0.55 * edges(tNormal, tDepth, uv - wob * 0.6, 1.9 * uDpr, 1.0));
  e *= 0.72 + 0.28 * noise(p * 0.35 + uBoil);

  // Shade: graphite where dark on paper; chalk where lit on slate.
  float t = mix(tone, 1.0 - tone, uDark);
  float ink = 0.0;
  if (uDark < 0.5) {
    ink = max(ink, 0.50 * hatch(p, 0.72, 6.5, 0.9, 1.0) * smoothstep(0.74, 0.60, t));
    ink = max(ink, 0.55 * hatch(p, -0.62, 5.8, 0.9, 2.0) * smoothstep(0.55, 0.42, t));
    ink = max(ink, 0.60 * hatch(p, 0.18, 5.2, 0.9, 3.0) * smoothstep(0.38, 0.26, t));
  } else {
    ink = max(ink, 0.42 * hatch(p, 0.72, 6.5, 0.9, 1.0) * smoothstep(0.30, 0.48, 1.0 - t));
    ink = max(ink, 0.50 * hatch(p, -0.62, 5.8, 0.9, 2.0) * smoothstep(0.50, 0.66, 1.0 - t));
  }
  ink *= cover * (1.0 - cap);
  float lift = (1.0 - uDark) * 0.55 * hatch(p, 1.05, 5.6, 1.2, 4.0) * smoothstep(0.80, 0.93, tone) * cover * (1.0 - cap);

  // Cut myocardium: architectural section hatch, amyloid stipple in Congo red.
  float sec = cap * 0.5 * hatch(p, 0.785, 4.6, 0.85, 5.0);
  float grain = hash(floor(p / 1.4));
  float clump = smoothstep(0.35, 0.7, noise(p * 0.06));
  float red = cap * uAmyloid * step(1.0 - 0.28 * uAmyloid * clump, grain) * (0.75 + 0.25 * noise(p));

  ink = max(ink, sec);
  ink = max(ink, valve * cover * 0.16);
  ink = max(ink, coronary * cover * 0.22);
  ink = max(ink, tool * cover * uToolOn * 0.2);
  ink = max(ink, e);

  // Pericardium: dashed outline only (an inset's body: a solid outline).
  float pe = edges(tPeriNormal, tPeriDepth, uv + wob * 0.8, 1.2 * uDpr, 1.0);
  float dash = step(0.45, fract((p.x + p.y) * 0.045 + noise(p * 0.02)));
  float peri = uPeri * pe * mix(uPeriInk, 0.35 + 0.35 * dash, uPeriDash);
  peri *= 1.0 - 0.7 * cover;

  vec4 col = vec4(0.0);
  col = over(col, uCongo, clamp(red, 0.0, 1.0) * 0.95);
  col = over(col, uLift, clamp(lift, 0.0, 1.0));
  vec3 pencil = mix(uInk, uCongo, warm * step(peri, ink));
  pencil = mix(pencil, uTool, toolNear * uToolOn * step(peri, ink));
  col = over(col, pencil, clamp(max(ink, peri), 0.0, 1.0) * 0.92);
  gl_FragColor = col;
}`;

function hexToVec3(hex) {
  const c = new THREE.Color();
  try { c.setStyle(hex); } catch (e) { c.set(0x22272b); }
  return new THREE.Vector3(c.r, c.g, c.b);
}

export class Pencil {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, stencil: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'fig-canvas gl';
    this.dpr = 1;
    this.w = 1;
    this.h = 1;

    const mk = () => {
      const dt = new THREE.DepthTexture(1, 1);
      dt.format = THREE.DepthStencilFormat;
      dt.type = THREE.UnsignedInt248Type;
      return new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: true, depthTexture: dt });
    };
    this.rtNormal = mk();
    this.rtPeri = mk();
    this.rtData = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: true, type: THREE.HalfFloatType });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.post = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: COMPOSITE_FS,
      uniforms: {
        tData: { value: this.rtData.texture },
        tNormal: { value: this.rtNormal.texture },
        tDepth: { value: this.rtNormal.depthTexture },
        tPeriNormal: { value: this.rtPeri.texture },
        tPeriDepth: { value: this.rtPeri.depthTexture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uBoil: { value: 0 },
        uDark: { value: 0 },
        uNear: { value: 1 },
        uFar: { value: 200 },
        uAmyloid: { value: 0 },
        uPeri: { value: 1 },
        uPeriDash: { value: 1 },
        uPeriInk: { value: 0.8 },
        uView: { value: new THREE.Vector4(0, 0, 1, 1) },
        uInk: { value: new THREE.Vector3(0.13, 0.15, 0.17) },
        uLift: { value: new THREE.Vector3(0.98, 0.98, 0.96) },
        uCongo: { value: new THREE.Vector3(0.7, 0.23, 0.18) },
        uTool: { value: new THREE.Vector3(0.13, 0.15, 0.17) },
        uToolOn: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    this.overlay = null; // optional scene drawn after the composite (sector fan)
  }

  setTheme(tok) {
    const u = this.post.uniforms;
    u.uInk.value.copy(hexToVec3(tok.ink));
    u.uLift.value.copy(hexToVec3(tok.chalk));
    u.uCongo.value.copy(hexToVec3(tok.congo));
    u.uDark.value = tok.dark ? 1 : 0;
  }

  /**
   * Draw the tools (the probe) in a pencil of their own: css, a colour shown as it is (not made
   * linear, so it matches the page's own), or null for the ink.
   */
  setToolInk(css) {
    const u = this.post.uniforms;
    u.uToolOn.value = css ? 1 : 0;
    if (css) {
      const c = new THREE.Color().setStyle(css, THREE.LinearSRGBColorSpace);
      u.uTool.value.set(c.r, c.g, c.b);
    }
  }

  setSize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, w * h > 900000 ? 1.5 : 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    this.rtNormal.setSize(W, H);
    this.rtData.setSize(W, H);
    this.rtPeri.setSize(W, H);
    this.post.uniforms.uRes.value.set(W, H);
    this.post.uniforms.uDpr.value = dpr;
  }

  /**
   * heart: { group, meshes: [{mesh, data, normal}], peri: mesh|null, stencil: Object3D[] }
   */
  render(scene, camera, heart, opts = {}) {
    const r = this.renderer;
    const u = this.post.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uBoil.value = opts.boil ?? 0;
    u.uAmyloid.value = opts.amyloid ?? 0;
    u.uPeri.value = heart.peri && heart.peri.visible ? 1 : 0;

    const periVisible = heart.peri ? heart.peri.visible : false;
    const tools = opts.tools || [];   // {mesh, data, normal}: meshes in the scene, beside the heart

    // pass 1: normals + depth
    if (heart.peri) heart.peri.visible = false;
    for (const it of heart.items) it.mesh.material = it.normal;
    for (const it of tools) it.mesh.material = it.normal;
    r.setRenderTarget(this.rtNormal);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);

    // pass 2: data
    for (const it of heart.items) it.mesh.material = it.data;
    for (const it of tools) it.mesh.material = it.data;
    r.setRenderTarget(this.rtData);
    r.clear(true, true, true);
    r.render(scene, camera);

    // pass 3: pericardium on its own
    r.setRenderTarget(this.rtPeri);
    r.clear(true, true, true);
    const shown = tools.map((it) => it.mesh.visible);
    for (const it of tools) it.mesh.visible = false;
    if (heart.peri && periVisible) {
      heart.group.visible = false;
      heart.peri.visible = true;
      const parent = heart.peri.parent;
      scene.attach(heart.peri);
      const prev = heart.peri.material;
      heart.peri.material = heart.periNormal;
      r.render(scene, camera);
      heart.peri.material = prev;
      parent.attach(heart.peri);
      heart.group.visible = true;
    }
    if (heart.peri) heart.peri.visible = periVisible;
    tools.forEach((it, i) => { it.mesh.visible = shown[i]; });

    // pass 4: composite
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(this.quadScene, this.quadCam);
    if (opts.overlayScene) {
      r.clearDepth();
      r.render(opts.overlayScene, camera);
    }
    // an inset in a corner (the body key, chapter 07): its own scene and camera on paper, lit
    // and encoded as ordinary shaded scenes are, so its paper matches the page's
    if (opts.inset && opts.inset.pencil) this.renderInset(opts.inset);
    else if (opts.inset) {
      const { scene: s2, camera: c2, rect, clear, border } = opts.inset;
      const y = this.h - rect.y - rect.h;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.setScissorTest(true);
      if (border) {
        r.setScissor(rect.x - 1, y - 1, rect.w + 2, rect.h + 2);
        r.setClearColor(border, 1);
        r.clear(true, false, false);
      }
      r.setScissor(rect.x, y, rect.w, rect.h);
      r.setViewport(rect.x, y, rect.w, rect.h);
      r.setClearColor(clear, 1);
      r.clear(true, true, false);
      r.render(s2, c2);
      r.setScissorTest(false);
      r.setViewport(0, 0, this.w, this.h);
      r.outputColorSpace = THREE.LinearSRGBColorSpace;
      r.setClearColor(0x000000, 0);
    }
  }

  /**
   * An inset drawn in pencil, in its corner of the canvas: its solids (their pencil items)
   * hatched and outlined as the heart is, its outline meshes as a solid contour (the third
   * pass), and its flat marks (sector, letters) over them, on the page's paper.
   * inset: { scene, camera (perspective), rect (CSS px from the top left), clear, border,
   *          pencil: { solids: [{mesh, data, normal}], outline: [mesh], outlineNormal, flat: [Object3D], ink } }
   */
  renderInset(inset) {
    const r = this.renderer, u = this.post.uniforms, dpr = this.dpr;
    const { scene: s2, camera: c2, rect, clear, border, pencil: P } = inset;
    const W = Math.max(1, Math.round(this.w * dpr)), H = Math.max(1, Math.round(this.h * dpr));
    const yc = this.h - rect.y - rect.h;   // CSS px from the bottom
    const x = Math.round(rect.x * dpr), y = Math.round(yc * dpr), w = Math.round(rect.w * dpr), h = Math.round(rect.h * dpr);
    const targets = [this.rtNormal, this.rtData, this.rtPeri];
    for (const t of targets) { t.viewport.set(x, y, w, h); t.scissor.set(x, y, w, h); t.scissorTest = true; }
    const solids = P.solids.map((it) => it.mesh);
    const was = new Map([...solids, ...P.outline, ...P.flat].map((o) => [o, o.visible]));
    const show = (list, on) => { for (const o of list) o.visible = on && was.get(o); };
    r.setClearColor(0x000000, 0);
    // passes 1 and 2: the solids
    show(P.outline, false);
    show(P.flat, false);
    for (const it of P.solids) it.mesh.material = it.normal;
    r.setRenderTarget(this.rtNormal);
    r.clear(true, true, true);
    r.render(s2, c2);
    for (const it of P.solids) it.mesh.material = it.data;
    r.setRenderTarget(this.rtData);
    r.clear(true, true, true);
    r.render(s2, c2);
    // pass 3: the outline meshes alone
    show(solids, false);
    show(P.outline, true);
    const mats = P.outline.map((m) => m.material);
    for (const m of P.outline) m.material = P.outlineNormal;
    r.setRenderTarget(this.rtPeri);
    r.clear(true, true, true);
    r.render(s2, c2);
    P.outline.forEach((m, i) => { m.material = mats[i]; });
    for (const t of targets) { t.viewport.set(0, 0, W, H); t.scissor.set(0, 0, W, H); t.scissorTest = false; }
    // the corner: border and paper, then the composite of this corner over them
    r.setRenderTarget(null);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setScissorTest(true);
    if (border) {
      r.setScissor(rect.x - 1, yc - 1, rect.w + 2, rect.h + 2);
      r.setClearColor(border, 1);
      r.clear(true, false, false);
    }
    r.setScissor(rect.x, yc, rect.w, rect.h);
    r.setViewport(rect.x, yc, rect.w, rect.h);
    r.setClearColor(clear, 1);
    r.clear(true, true, false);
    const keep = [u.uNear.value, u.uFar.value, u.uPeri.value, u.uAmyloid.value, u.uPeriDash.value, u.uPeriInk.value];
    u.uNear.value = c2.near;
    u.uFar.value = c2.far;
    u.uPeri.value = 1;
    u.uAmyloid.value = 0;
    u.uPeriDash.value = 0;
    u.uPeriInk.value = P.ink ?? 0.8;
    u.uView.value.set(x / W, y / H, w / W, h / H);
    r.render(this.quadScene, this.quadCam);
    [u.uNear.value, u.uFar.value, u.uPeri.value, u.uAmyloid.value, u.uPeriDash.value, u.uPeriInk.value] = keep;
    u.uView.value.set(0, 0, 1, 1);
    // the flat marks over the drawing
    show(solids, false);
    show(P.outline, false);
    show(P.flat, true);
    r.clearDepth();
    r.render(s2, c2);
    for (const [o, v] of was) o.visible = v;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.w, this.h);
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.setClearColor(0x000000, 0);
  }
}
