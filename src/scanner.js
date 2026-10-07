// Offscreen echo frames from the heart mesh, without WebGL: the CPU cuts the mesh.
import { loadModel } from './model3d.js';

let P = null;
export function scanner() {
  if (!P) {
    P = (async () => {
      // the renderer's module loads beside the model, not after it
      const [model, { EchoView }] = await Promise.all([loadModel(), import('./echo.js')]);
      return {
        model,
        /** An offscreen view of w x h CSS px; opts may set depth and angle. */
        make(w, h, view, opts = {}) {
          const c = document.createElement('canvas');
          const ev = new EchoView(model, c, { offscreen: true, width: w, height: h });
          ev.view = view;
          Object.assign(ev, opts);
          return ev;
        },
      };
    })();
  }
  return P;
}
