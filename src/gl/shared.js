// One WebGL stage for the chapter that shows the 3D heart (07 Views): the heart mesh can live in
// one scene only. Its second pane (gl/stage3d.js, Pane3D) draws the same scene.
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
