// One WebGL stage for the chapters that show the 3D heart (07 Windows, 08 Planes): the heart
// mesh can live in one scene only, and one GL context is lighter on a phone.
let pending = null;

export function sharedStage() {
  if (!pending) {
    pending = (async () => {
      const m = await import('./stage3d.js');
      const stage = new m.Stage3D();
      await stage.ready;
      return stage;
    })();
  }
  return pending;
}
