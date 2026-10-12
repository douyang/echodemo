# The Heart by Ultrasound

An illustrated, interactive guide to echocardiography. 24 chapters in ten parts follow the order of the ASE guidelines, from ultrasound physics to two AI models that measure and read a study. Six bonus chapters follow in part B. Every echo image is simulated, all but chapter 08's cut from one 3D heart, and every guideline value carries its source.

**Site:** <https://intro2echo.com>

![Chapter 04, Views, in three panes: the planes of the nine standard views in one heart, the heart cut on the apical four-chamber plane, and the echo of that plane](docs/screenshots/planes.webp)

## Chapters

| Part | Chapter | The figure |
| --- | --- | --- |
| I Physics | 01 Pulse | One scan line: pulse, echoes, A-mode, wavelength, axial resolution, attenuation |
| | 02 Image | A sector image built line by line; four artifacts |
| | 03 Doppler | The Doppler equation, beam angle and Nyquist limit; pulsed, continuous and color Doppler |
| II Views | 04 Views | 35 transthoracic views in three panes: probe and body, the labeled cross-section, the echo. A free probe rotates, tilts, rocks and slides, and the panel names the nearest standard view |
| | 05 Transesophageal echocardiography | 17 views of Hahn 2013, with all 11 views of the basic perioperative examination. Level, turn and multiplane angle; a free probe that advances, turns and flexes |
| III Physiology | 06 Cycle | Wiggers diagram: ECG, heart sounds, mitral and LVOT Doppler, the four-chamber view at the cursor |
| | 07 Loop | Pressure–volume loop: ESPVR, EDPVR, arterial elastance; a hypocontractile, a stiff, a pressure-loaded and a volume-loaded ventricle |
| IV Hemodynamics | 08 Doppler hemodynamics | Continuity, velocity and pressure across a valve, with PW and CW on one scale; the RV systolic pressure; the RA pressure from the IVC |
| V Function | 09 Systolic function | Biplane method of disks on apical views; foreshortening |
| | 10 Diastolic function | Normal to restrictive filling, through the 2025 ASE algorithm |
| | 11 Regional wall motion | LAD, RCA or circumflex occlusion on the 17-segment bull's-eye and the apical views |
| | 12 Stress echocardiography | Dobutamine stress as a quad screen: ischemia, scar, viability |
| | 13 Strain | Global longitudinal strain by speckle tracking; global, regional and apical-sparing patterns; cardio-oncology |
| | 14 Right ventricle | Pressure overload, volume overload and acute pulmonary embolism, in RV-focused views |
| VI Valves | 15 Aortic stenosis | Normal to severe, then low-flow, low-gradient stenosis; the bicuspid valve |
| | 16 Aortic regurgitation | Mild to severe with LV dysfunction |
| | 17 Mitral stenosis | Normal to severe rheumatic stenosis: pressure half-time, planimetry, the gradient at any heart rate |
| | 18 Mitral regurgitation | Mild to severe with LV dysfunction: PISA, pulmonary vein flow reversal |
| | 19 Tricuspid regurgitation | Mild to torrential: PISA, RV and RA dilation, hepatic vein flow reversal |
| VII Aorta | 20 Diseases of the aorta | Dilation, dissection and coarctation |
| VIII Pericardium | 21 Pericardial disease | Effusion to tamponade; constriction |
| IX Cardiomyopathy | 22 Hypertrophic cardiomyopathy | Normal to severe obstruction, at rest and with Valsalva; systolic anterior motion |
| | 23 Cardiac amyloidosis | Normal to advanced amyloid cardiomyopathy; apical sparing; the ESC 2021 echo criteria |
| X Artificial intelligence | 24 AI interpretation and measurement | EchoPrime and EchoNet-Measurements on one simulated study, in seven steps, then the report's 15 sections |
| B Bonus | B1 Left ventricular assist devices | A HeartMate 3 from 4,600 to 6,200 rpm; RV failure, de novo AR, outflow graft obstruction |
| | B2 Prosthetic valves | A 23-mm aortic prosthesis from normal to significant stenosis; prosthesis–patient mismatch |
| | B3 Infective endocarditis | A mitral vegetation up to 22 mm, then leaflet perforation with MR |
| | B4 Shunts: ASD, VSD and PFO | Small to large shunts; the saline study; the LA pressure across a restrictive atrial communication |
| | B5 Cardiac masses and thrombus | Left atrial myxoma, LV thrombus, papillary fibroelastoma |
| | B6 Complications of myocardial infarction | Septal rupture, papillary muscle rupture, free-wall rupture with pseudoaneurysm, apical aneurysm |

Chapters 10, 13 to 23 and B2 to B6 each follow one disease or one load from normal to its end stage. B1 follows an LVAD through its pump speeds.

Hidden chapters keep their code and come back with a flag in `src/order.js`: the report (`SHOW_REPORT`), Planes (`SHOW_PLANES`), Automated measurements (`SHOW_MEASURE`) and Shock (`SHOW_SHOCK`). Constriction and the IVC were chapters of their own (`SHOW_CONSTRICT`, `SHOW_IVC`); 21 and 08 now show them. In 14, the PH calculator and the ESC/ERS probability of PH are hidden (`SHOW_CALC` and `SHOW_PROB` in `src/ch/rv.js`).

| | | |
| --- | --- | --- |
| ![01 Pulse](docs/screenshots/pulse.webp) | ![03 Doppler](docs/screenshots/shift.webp) | ![04 Views](docs/screenshots/windows.webp) |
| ![05 Transesophageal echocardiography](docs/screenshots/tee.webp) | ![06 Cycle](docs/screenshots/cycle.webp) | ![07 Loop](docs/screenshots/loop.webp) |
| ![08 Doppler hemodynamics](docs/screenshots/pressure.webp) | ![09 Systolic function](docs/screenshots/eject.webp) | ![10 Diastolic function](docs/screenshots/fill.webp) |
| ![11 Regional wall motion](docs/screenshots/segments.webp) | ![12 Stress echocardiography](docs/screenshots/stress.webp) | ![13 Strain](docs/screenshots/strain.webp) |
| ![14 Right ventricle](docs/screenshots/rv.webp) | ![15 Aortic stenosis](docs/screenshots/as.webp) | ![16 Aortic regurgitation](docs/screenshots/ar.webp) |
| ![17 Mitral stenosis](docs/screenshots/ms.webp) | ![18 Mitral regurgitation](docs/screenshots/mr.webp) | ![19 Tricuspid regurgitation](docs/screenshots/tr.webp) |
| ![20 Diseases of the aorta](docs/screenshots/aorta.webp) | ![21 Pericardial disease](docs/screenshots/peri.webp) | ![22 Hypertrophic cardiomyopathy](docs/screenshots/hcm.webp) |
| ![23 Cardiac amyloidosis](docs/screenshots/amyloid.webp) | ![24 AI interpretation and measurement](docs/screenshots/ai.webp) | ![B1 Left ventricular assist devices](docs/screenshots/lvad.webp) |
| ![B2 Prosthetic valves](docs/screenshots/prosthetic.webp) | ![B3 Infective endocarditis](docs/screenshots/endocarditis.webp) | ![B4 Shunts: ASD, VSD and PFO](docs/screenshots/shunts.webp) |
| ![B5 Cardiac masses and thrombus](docs/screenshots/masses.webp) | ![B6 Complications of myocardial infarction](docs/screenshots/mi.webp) | |

## Use

- **Heart.** The menu in the header sets the heart for every chapter: normal, cardiac amyloidosis, ischemic cardiomyopathy, a Barlow mitral valve with severe regurgitation, or a bicuspid aortic valve with severe stenosis. Each chapter opens at that heart's values. The page keeps the choice between visits.
- **Tour.** *Play all chapters* runs the 24 main chapters in order. It starts when the page opens, except with reduced motion. Any input pauses it, and the next click continues from the step on screen. A paused chapter plays its own sequence.
- **Severity pages.** One slider runs from normal to the end stage, with the grade bands under it. The views, the Doppler strips and the measurement strip change together. Diagrams with ▲▼ buttons show how each measurement moves the grade.
- **Sound.** The Sound button plays music in time with the heart and soft cues for changes on screen, synthesized in the browser. It is off until clicked. On iPhone and iPad the page asks for media playback, so the silent switch does not mute it.
- **Keys and addresses.** ← and → change the chapter, the space bar plays or pauses the tour, and [ and ] step the views in 04. Each chapter opens by its key, for example `#as` or `#tee`.
- **Phones.** The figure stays in view above the text. A bar at the bottom holds Play, back, next and the chapter list.

![Ischemic cardiomyopathy in chapter 04](docs/screenshots/heart-icm.webp) ![Bicuspid aortic stenosis in chapter 15](docs/screenshots/heart-bav.webp) ![Barlow mitral valve in chapter 18](docs/screenshots/heart-barlow.webp)

## How it works

- **One heart.** One heart mesh, one set of view planes, one echo renderer and one cycle model serve every chapter. Every chapter but 08 cuts its echo views from the mesh. A chapter's disease is a shape target on the mesh, weighted so that the image shows the size that the text prints (the `*cal.js` tables). The mesh, the pencil renderer and the 3D stage come from *The Amyloid Heart*.
- **Valve hinges.** The valve model leaves gaps between some leaflet hinges and the walls. For example, it has no aortomitral curtain between the anterior mitral leaflet and the aortic root. Membranes join each hinge to the wall in the echo views and in the 3D model (`src/gl/skirts.js`). At the mitral and tricuspid annuli, the aortomitral curtain among them, a membrane is wall: it has the wall's echo and 3D look and the atrial wall's thickness (2.8 mm on the left, 3.2 mm on the right). At an aortic or pulmonary cusp it is thin valve tissue. The tricuspid ring sits at the RA–RV junction. The measurements leave the membranes out, so the `*cal.js` tables stay valid. `tools/hinges.mjs` finds the hinges once and keeps them in `assets/hinges.json`.
- **Echo images.** `src/bmode.js` forms every frame: echogenicity by structure, specular surfaces, speckle that moves with the wall, beam blur, near-field clutter, noise, time-gain and log compression. Color jets come from a model of their flow (`jet()` in `src/echo2d.js`). A scanner-style color format is kept and off (`JETS` in `src/jets.js`).
- **Values.** Each severity page runs a one-slider model set inside the guideline bands. It rounds each value to its printed decimals and grades from the rounded values, so a value on screen never contradicts its grade (`shown` in `src/sev.js`). Each page models one lesion, as the guidelines grade one lesion at a time.
- **State.** One store (`src/state.js`) holds each chapter's own keys and a few shared keys (`SHARED`). A chapter's controls and Play change only its own keys.

## Sources and text

- The main sources are Lang 2015, Mitchell 2019, Zoghbi 2017, Baumgartner 2017, Otto 2020, Pandian 2023, Nagueh 2025, Mukherjee 2025, Thomas 2025, Klein 2013, Adler 2015, Schulz-Menger 2025, Garcia-Pavia 2021, Moody 2023, Pellikka 2020, Lancellotti 2017 and Taub 2025. The full list, with DOI and PubMed links, opens from **Sources** on the page (`src/refs.js`). Each reference was checked against PubMed and Crossref.
- All images are simulated; there are no patient images. The models are illustrative and set to agree with the sources.
- The AI chapter follows the papers and the public code of EchoPrime (Vukadinovic 2026) and EchoNet-Measurements (Sahashi 2025). Neither model ran on the site's images. The figure simulates their outputs from the site's own values.
- The text reads as a clinical echocardiography text: third person, with the chamber, view, method and unit named. Each concept has one home chapter, and other chapters link to it. A chapter holds 1,100 words or fewer; 08 and 21 join two chapters and hold 1,700 or fewer.

## Run it

```
python3 -m http.server 8000
```

Open <http://localhost:8000/>. There is no build step: ES modules, a canvas sketch layer (rough.js) and a WebGL pencil renderer (three.js). The libraries and their licenses are in `vendor/`.

## Code

```
index.html        the page, the chapter text, the dialogs and the preload block
src/main.js       the chapter engine: controls, readouts, citations, the tour, the chapter bar
src/order.js      the chapter order and numbers, the bonus chapters, the hidden chapters
src/state.js      the store: each chapter's own keys and the shared keys
src/ch/*.js       one module per chapter
src/sev.js        severity pages: tracks, grade bands, Play, the measurement strip
src/echo.js       view planes and echo views cut from the mesh, with the disease targets
src/echo2d.js     parametric views (08), LV tracing, color jets, measurement boxes
src/bmode.js      B-mode and M-mode image formation
src/meshpanel.js  an echo view cut from the mesh in a chapter's figure
src/*cal.js       target weights against printed values, for each heart
src/gl/           the 3D stage, the disease hearts (phenomesh.js), each chapter's mesh additions
src/music.js      the site's sound (Web Audio)
src/norms.js      normal values and integrated grades
src/refs.js       references
src/idbcache.js   the model's fields in IndexedDB, from one visit to the next
assets/           heart mesh, landmarks, valve hinges, poster, favicon
video/            the views video, the chapter videos and the intro
tools/            checks and video tools; tools/score/ the soundtracks (Python)
archive/          markup of hidden chapters, not loaded by the site
```

## Checks

| Command | What it checks |
| --- | --- |
| `node tools/check-state.mjs` | Each chapter changes only its own state keys |
| `node tools/preload.mjs --check` | The preload block of `index.html` lists every module (95) |
| `node tools/stress-volumes.mjs --check` | Chapter 12's stored LV volumes match the mesh |
| `node tools/hinges.mjs --check` | The stored valve hinges (`assets/hinges.json`) match the model |
| `node --input-type=module --check < src/echo.js` | A module parses (`node --check src/echo.js` does not check ES modules in `.js` files) |
| `node tools/loadtime.mjs [keys]` | The load time of each chapter |
| `node tools/track-fit.mjs` | Each step name fits its part of a chapter video's progress line |

Before a merge, every chapter is opened in Chromium at phone and desktop sizes. Each pull request lists the checks it ran.

## Load time

Every chapter loads about 115 files: 7.9 MB, or 4.1 MB with gzip, of which the heart model is 2.3 MB. The valve hinges add 147 KB, or 30 KB with gzip. Five changes cut the wait: grade bands built on first use, one chapter warmed at a time, a stored table of the stress volumes, `modulepreload` links with an early model download, and the model's fields kept in IndexedDB. In local tests the median first image fell from 2.92 s to 1.98 s. A next visit shows the heaviest chapters in 0.96 to 1.18 s.

## Videos

The site's own code draws every video in headless Chromium. The soundtrack is *Bright pulse* (`tools/score/pulse.py`), synthesized with the InVision sound engine at −15 LUFS. The videos go to `video/out/`, which git ignores.

- **Views video** (`video/index.html`): the standard views of 04 in three panes. Cut A, the full tour (2:24); B, the core views with the nine planes (1:09), the video of chapter 04; C, a quick cut (0:38); D, vertical (1:06).
- **Chapter videos** (`video/chapter.html?ch=<key>`): one for each chapter, 0:39 to 2:16. The steps and captions are in `video/chapters.js`.
- **Intro** (`video/reel.js`): 89 s, a title card, one clip from each of ten chapters, and the end card.

Serve the repository root on port 8790, then:

```
python3 tools/score/pulse.py as video/out/chapter-as.wav
node tools/render-video.mjs --ch=as --audio=video/out/chapter-as.wav
node tools/render-video.mjs --ch=all --jobs=3 --audio=auto
node tools/render-video.mjs --cut=A --jobs=3 --audio=video/out/echo-views-A.wav
node tools/render-video.mjs --reel --jobs=3 --audio=auto
node tools/storyboard.mjs --ch=as
```

Rendering needs Node 22, Playwright with Chromium, ffmpeg, and Python 3 with numpy and scipy.

## Deploy

`main` deploys to Cloudflare Pages and serves <https://intro2echo.com>. Each pull request gets a preview at `<branch>.echodemo.pages.dev`.

## History

The merged pull requests and the git log hold each change and its checks. The previous README, with every dated entry and check, is in git history: `git show f08774a:README.md`.
