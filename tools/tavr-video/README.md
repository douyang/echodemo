# TAVR procedure video

An 84-s video of a transfemoral TAVR with a balloon-expandable valve. Blender (Cycles) shots show
the route, the femoral access, the wires, the valve delivery, the deployment and the closure. The
TAVR and TEE chapter videos supply the TEE views and the position of the probe. The frame, the
captions, the progress line and the cards follow the chapter videos (`video/video.css`,
`video/chapter.js`).

## Storyboard

| Window | Video (s) | Picture |
|---|---|---|
| Path | 3.43–7.43 | The body. The arterial route from the right groin to the aortic valve lights up. |
| Access | 7.43–19.43 | The right groin: needle, access wire, preclosure sutures, 14F sheath to the aortic bifurcation. |
| Wires | 19.43–29.43 | Pacing lead to the RV apex. A straight wire crosses the valve; the stiff wire curls in the LV apex (cutaway). |
| TEE | 29.43–37.43 | Probe and ME long axis (TEE chapter). Annulus and severity (TAVR chapter, Measure). |
| Delivery | 37.43–47.43 | The valve passes the sheath, is aligned on its balloon in the descending aorta and tracks over the arch. |
| Position | 47.43–55.43 | Split: the crimped valve across the annulus (cutaway) and the ME aortic valve long and short axes. |
| Deploy | 55.43–65.43 | Split: rapid pacing, the balloon full for 3 s, deflation. A monitor shows the ECG and the arterial pressure. |
| Check | 65.43–75.43 | TAVR chapter, Check: circular frame, no paravalvular jet, gradients and DVI. |
| Closure | 75.43–80.43 | The delivery system comes out (cutaway); the sheath comes out, the sutures close, the wire comes out (groin). |

The title card takes the first 3.43 s (four beats at 70 a minute) and the end card the last 4 s.
A Blender frame `b` shows at video frame `b + 103`.

## Files

| File | Job |
|---|---|
| `anat.py` | Anatomy constants in the heart model's frame (cm): the annulus and root axis, the vessels from the aorta to the groins, the inguinal ligament, the femoral heads. |
| `geo.py` | Rails with rotation-minimizing frames; tubes and surfaces of revolution. |
| `mats.py` | The Cycles materials. A see-through material has an alpha value node. |
| `scene.py` | The scene: the heart model and its valves, the stenotic native valve, the vessels, the body and its landmarks, the table, the lights. |
| `devices.py` | Rails A–C (delivery, pigtail, pacing lead) and the device shapes: valve frame, skirt, leaflets, balloon, nose cone. |
| `anim.py` | The storyboard in seconds, the state of every device at time t, the shots with their looks and cameras, and the frame renderer. |
| `compose.py` | The video: the Blender frames, the chapter captures, the progress line, the captions with their sources, the monitor, the cards; ffmpeg (H.264, BT.709). |
| `score.py` | The soundtrack: `tools/score/pulse.py` on this timeline, seed 9335, −15 LUFS. |

## Build

Requirements: Python 3.11 with `bpy` 4.5 (Blender as a module), numpy, Pillow, fontTools and
brotli; Node and Playwright, as for `tools/render-video.mjs`; ffmpeg; `python3` with numpy and
scipy for the score.

1. Get the heart model: `assets/heart.raw.glb` and `assets/valves.raw.glb` of douyang/heartmodel.
   Set `TAVR_ASSETS` to that `assets` folder. The default is `../heartmodel/assets` next to this
   repository.
2. Render the Blender frames. On 4 CPU cores, Cycles takes about 4.5 h:
   ```
   EGL_PLATFORM=surfaceless python tools/tavr-video/anim.py --engine cycles --samples 8 \
     --out video/out/tavr-procedure/frames \
     --shot title,access,pacing,cross,sheathpass,align,arch,position,deploy,withdraw,close
   ```
   The script skips the frames that exist, so a stopped run continues. For a motion check, use
   `--engine workbench --res 608x243 --step 3` (about 1 s a frame).
3. Serve the repository (`python3 -m http.server 8790`), then capture the TAVR chapter video (its
   spec is `VIDEOS.tavr` in `video/chapters.js`) and, if `video/out/chapter-tee.mp4` is absent,
   the TEE chapter video:
   ```
   node tools/render-video.mjs --ch=tavr --out=video/out/tavr-procedure
   node tools/render-video.mjs --ch=tee
   ```
4. Make the soundtrack: `python3 tools/tavr-video/score.py video/out/tavr-procedure/score.wav`
5. Compose the video:
   ```
   python tools/tavr-video/compose.py --audio video/out/tavr-procedure/score.wav \
     --out video/out/tavr-procedure.mp4
   ```
   `--stills 5,40.5 --out <folder>` writes PNG stills instead. `--draft <folder>` takes frames of
   a motion check where the Cycles frames are not rendered yet.

## Sources of the captions

- Route: Arnold SV, et al. JAMA Cardiol 2024;9:1115-1123 (96.2% transfemoral, 2019–2022).
- Access, pacing lead, wires, pacing rate, balloon held 3 s, closure: Hadidi OF, Nguyen TC.
  Step-by-step guide: transfemoral SAPIEN S3 TAVR. ACC TAVR Handbook, ch. 10, 2018.
- Delivery and deployment (the sheath tip past the bifurcation, valve alignment in a straight
  section, inflation once the systolic pressure is 50 mmHg or less): SAPIEN 3 instructions for use,
  FDA PMA P140031/S085.
- TEE views: Hahn RT, et al. J Am Soc Echocardiogr 2013;26:921-964.
- Annulus: Zamorano JL, et al. J Am Soc Echocardiogr 2011;24:937-965. Hahn RT, et al. J Am Soc
  Echocardiogr 2022;35:1-76.
- Position: Hahn RT, et al. JACC Cardiovasc Imaging 2015;8:288-318. Blackman D, et al. Cardiol
  Ther 2021;10:277-288.
- Check: Généreux P, et al. Eur Heart J 2021;42:1825-1857 (VARC-3). Zoghbi WA, et al. J Am Soc
  Echocardiogr 2024;37:2-63.

The model is schematic. The vessel paths, the body and the device sizes show the steps; they are
not measurements.
