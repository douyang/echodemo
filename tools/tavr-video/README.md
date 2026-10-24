# TAVR procedure video

A 64-s video of TAVR with a balloon-expandable valve. The TEE views take most of it: the annulus,
the valve's position, its depth as the balloon fills, the check for paravalvular leaks and for a
pericardial effusion. Blender (Cycles) shots show the femoral access, the wires, the valve's
delivery and the closure on a CC0 body. The frame, the captions, the progress line and the cards
follow the chapter videos (`video/video.css`, `video/chapter.js`).

## Storyboard

| Window | Video (s) | Picture |
|---|---|---|
| Access | 3.43–11.43 | The body, the arterial route lit; the camera flies to the right groin: needle, access wire, preclosure sutures, 14F sheath to the aortic bifurcation. |
| Wires | 11.43–16.43 | Pacing lead to the RV. A straight wire crosses the valve; the stiff wire curls in the LV apex (cutaway). |
| TEE | 16.43–20.43 | The probe and the ME long axis (TEE chapter). |
| Baseline | 20.43–25.43 | ME AV long axis large: the annulus, 24 mm, and the valve size. Small: the short axis, the CW strip and the severity. |
| Delivery | 25.43–29.43 | The valve passes the sheath, is aligned on its balloon in the descending aorta and tracks over the arch. |
| Position | 29.43–36.43 | Long axis large: the crimped valve across the annulus, its depth 9 mm. Small: the 3-D root. |
| Inflation | 36.43–45.43 | Long axis large: the live depth, 9 to 2 mm, as the frame shortens, and its course. Small: the 3-D root and a monitor with rapid pacing. |
| Check | 45.43–52.43 | Long axis large: no paravalvular jet. Small: the circular frame on the short axis, the CW strip, the gradient and the DVI. |
| Effusion | 52.43–57.43 | TG midpapillary short axis (TEE chapter): no pericardial effusion, normal wall motion. |
| Closure | 57.43–60.43 | The sheath comes out, the sutures close, the wire comes out (groin). |

The title card takes the first 3.43 s (four beats at 70 a minute) and the end card the last 4 s.
A Blender frame `b` shows at video frame `b + 103`. The position and the inflation show the 3-D
frames of the first cut (its 45–61 s, commit 293afc7): its clock there is this one's plus 19 s.

## Files

| File | Job |
|---|---|
| `anat.py` | Anatomy constants in the heart model's frame (cm): the annulus and root axis; the vessels from the aorta to the groins, drawn on the fitted body and bones; the inguinal ligament; the femoral heads. |
| `hbm.py` | The body: the CC0 Human Base Meshes male body and skeleton, read without running the bundle's scripts. Two units of the skeleton (pelvis, thorax) fit into the body; the femurs turn to the thighs; the body's trunk stretches to adult proportions (a man of about 1.82 m). |
| `geo.py` | Rails with rotation-minimizing frames; tubes and surfaces of revolution. |
| `mats.py` | The Cycles materials. A see-through material has an alpha value node. |
| `scene.py` | The scene: the heart model and its valves, the stenotic native valve, the vessels, the body and its bones, the inguinal ligaments, the table, the lights. |
| `devices.py` | Rails A–C (delivery, pigtail, pacing lead) and the device shapes: valve frame, skirt, leaflets, balloon, nose cone. |
| `anim.py` | The storyboard in seconds, the state of every device at time t, the shots with their looks and cameras, and the frame renderer. |
| `capture.py` | The TAVR chapter on this video's clock: baseline, position, inflation under pacing, check. |
| `compose.py` | The video: the Blender frames, the captures, the TEE layouts with their small panels, the depth's course, the monitor, the progress line, the captions with their sources, the cards; ffmpeg (H.264, BT.709). |
| `score.py` | The soundtrack: `tools/score/pulse.py` on this timeline, seed 9335, −15 LUFS. |
| `fit_bones.py` | The fit of the skeleton's units into the body (`hbm.FITS`): soft tissue over palpable landmarks. |
| `fit_body.py` | The landmarks of the placed body and bones that the vessels are drawn on. |
| `check_body.py`, `check_chest.py` | Clearances (heart and vessels in the skin, out of the bones, in front of the spine; heart and ribs) and Workbench previews. |

## Build

Requirements: Python 3.11 with `bpy` 4.5 (Blender as a module), numpy, Pillow, fontTools and
brotli; Node and Playwright, as for `tools/render-video.mjs`; ffmpeg; `python3` with numpy and
scipy for the score.

1. Get the heart model: `assets/heart.raw.glb` and `assets/valves.raw.glb` of douyang/heartmodel.
   Set `TAVR_ASSETS` to that `assets` folder. The default is `../heartmodel/assets` next to this
   repository.
2. Get the body: the Human Base Meshes bundle v1.4.1 of Blender Studio (CC0, the bundle's README),
   <https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip>.
   Set `TAVR_HBM` to its `human_base_meshes_bundle.blend`. The default is
   `video/out/tavr-procedure/hbm/human_base_meshes_bundle.blend`.
3. Render the first cut's position and deployment (cutaway, no body) in a checkout of 293afc7:
   ```
   git worktree add ../tavr-cut1 293afc7
   cd ../tavr-cut1 && EGL_PLATFORM=surfaceless python tools/tavr-video/anim.py --engine cycles \
     --samples 8 --out <this repo>/video/out/tavr-procedure/frames1 --shot position,deploy
   ```
4. Render this cut's Blender frames: 600 frames. On 4 CPU cores, Cycles takes about 2.5 h (about
   14 s a frame; 23 s in the pacing shot, which shows the whole body):
   ```
   EGL_PLATFORM=surfaceless python tools/tavr-video/anim.py --engine cycles --samples 8 \
     --out video/out/tavr-procedure/frames \
     --shot title,access,pacing,cross,sheathpass,align,arch,close
   ```
   The script skips the frames that exist, so a stopped run continues. For a motion check, use
   `--engine workbench --step 3` (about 1 s a frame).
5. Capture the TAVR chapter on this clock (`python tools/tavr-video/capture.py`) and, if
   `video/out/chapter-tee.mp4` is absent, the TEE chapter video (serve the repository, then
   `node tools/render-video.mjs --ch=tee`).
6. Make the soundtrack: `python3 tools/tavr-video/score.py video/out/tavr-procedure/score.wav`
7. Compose the video:
   ```
   python tools/tavr-video/compose.py --audio video/out/tavr-procedure/score.wav \
     --out video/out/tavr-procedure.mp4
   ```
   `--stills 5,40.5 --out <folder>` writes PNG stills instead. `--draft <folder>` takes frames of
   a motion check where the Cycles frames are not rendered yet.

## Sources of the captions

- Access, pacing lead, wires, pacing rate, balloon held 3 s, closure: Hadidi OF, Nguyen TC.
  Step-by-step guide: transfemoral SAPIEN S3 TAVR. ACC TAVR Handbook, ch. 10, 2018.
- Delivery and deployment (the sheath tip past the bifurcation, valve alignment in a straight
  section, inflation once the systolic pressure is 50 mmHg or less), the valve size for the
  annulus: SAPIEN 3 instructions for use, FDA PMA P140031/S085.
- TEE views: Hahn RT, et al. J Am Soc Echocardiogr 2013;26:921-964.
- Annulus: Hahn RT, et al. J Am Soc Echocardiogr 2022;35:1-76. Severity: Baumgartner H, et al.
  J Am Soc Echocardiogr 2017;30:372-392.
- Position: Hahn RT, et al. JACC Cardiovasc Imaging 2015;8:288-318. Blackman D, et al. Cardiol
  Ther 2021;10:277-288.
- The frame's shortening (27 to 20 mm, mostly at its ventricular end): Schymik G, et al. J Interv
  Cardiol 2015;28:82-89.
- Check: Généreux P, et al. Eur Heart J 2021;42:1825-1857 (VARC-3). Zoghbi WA, et al. J Am Soc
  Echocardiogr 2024;37:2-63.
- Effusion and wall motion: Hahn RT, et al. JACC Cardiovasc Imaging 2015;8:288-318. Agricola E,
  et al. Eur Heart J Cardiovasc Imaging 2023;24:e209-e268.

The model is illustrative. The vessel paths, the body's proportions and the device sizes show the
steps; they are not measurements. The values on the screen are the TAVR chapter's.
