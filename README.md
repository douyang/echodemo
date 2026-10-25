# The Heart by Ultrasound

An illustrated, interactive guide to echocardiography. 22 chapters in nine parts follow the order of the ASE guidelines, from ultrasound physics through the valves and the structural heart interventions to two AI models that measure and read a study. Eleven bonus chapters follow in part B. Every echo image is simulated, all but chapter 07's cut from one 3D heart, and every guideline value carries its source.

**Site:** <https://intro2echo.com>

![Chapter 04, Views, in three panes: the planes of the nine standard views in one heart, the heart cut on the apical four-chamber plane, and the echo of that plane](docs/screenshots/planes.webp)

## Chapters

| Part | Chapter | The figure |
| --- | --- | --- |
| I Physics | 01 Pulse | One scan line: pulse, echoes, A-mode, wavelength, axial resolution, attenuation |
| | 02 Image | A sector image built line by line; four artifacts |
| | 03 Doppler | The Doppler equation, beam angle and Nyquist limit; pulsed, continuous and color Doppler |
| II Views | 04 Views | 35 transthoracic views in three panes: probe and body, the labeled cross-section, the echo. A free probe slides over the skin from any window to any other, rotates, tilts and rocks, and the panel names the nearest standard view |
| III Physiology | 05 Cycle | Wiggers diagram: ECG, heart sounds, mitral and LVOT Doppler, the four-chamber view at the cursor |
| | 06 Loop | Pressure–volume loop: ESPVR, EDPVR, arterial elastance; a hypocontractile, a stiff, a pressure-loaded and a volume-loaded ventricle |
| IV Hemodynamics | 07 Doppler hemodynamics | Continuity, velocity and pressure across a valve, with PW and CW on one scale; the RV systolic pressure; the RA pressure from the IVC |
| V Function | 08 Systolic function | Biplane method of disks on apical views; foreshortening |
| | 09 Diastolic function | Normal to restrictive filling, through the 2025 ASE algorithm |
| | 10 Regional wall motion | LAD, RCA or circumflex occlusion on the 17-segment bull's-eye and the apical views |
| | 11 Right ventricle | Pressure overload, volume overload and acute pulmonary embolism, in RV-focused views |
| VI Valves | 12 Aortic stenosis | Normal to severe, then low-flow, low-gradient stenosis; the bicuspid valve |
| | 13 Aortic regurgitation | Mild to severe with LV dysfunction |
| | 14 Mitral stenosis | Normal to severe rheumatic stenosis: pressure half-time, planimetry, the gradient at any heart rate |
| | 15 Mitral regurgitation | Mild to severe with LV dysfunction: PISA, pulmonary vein flow reversal |
| | 16 Tricuspid regurgitation | Mild to torrential: PISA, RV and RA dilation, hepatic vein flow reversal |
| VII Structural heart | 17 Transesophageal echocardiography | 17 views of Hahn 2013, with all 11 views of the basic perioperative examination. Level, turn and multiplane angle; a free probe that advances, turns and flexes |
| | 18 Transcatheter aortic valve replacement (TAVR) | A balloon-expandable valve, step by step: the TEE views that guide each step (measure, cross, deploy, check), TTE before and after, and the procedure in a cut-away heart rendered in Blender. Paravalvular regurgitation from none to severe; the VARC-3 intended performance |
| | 19 Mitral transcatheter edge-to-edge repair (M-TEER) | Repair of a flail P2 with a clip, step by step: the TEE views that guide each step, the 3D en face view, TTE before and after, and the procedure in a cut-away heart rendered in Blender |
| | 20 Tricuspid transcatheter edge-to-edge repair (T-TEER) | Repair of massive secondary TR with a clip on the anteroseptal line, step by step: the TEE views that guide each step, the 3D en face view from the RA, TTE before and after, and the procedure in a cut-away heart rendered in Blender |
| VIII Aorta | 21 Diseases of the aorta | Dilation, dissection and coarctation |
| IX Artificial intelligence | 22 AI interpretation and measurement | EchoPrime and EchoNet-Measurements on one simulated study, in seven steps, then the report's 15 sections |
| B Bonus | B1 Stress echocardiography | Dobutamine stress as a quad screen: ischemia, scar, viability |
| | B2 Strain | Global longitudinal strain by speckle tracking; global, regional and apical-sparing patterns; cardio-oncology |
| | B3 Hypertrophic cardiomyopathy | Normal to severe obstruction, at rest and with Valsalva; systolic anterior motion |
| | B4 Cardiac amyloidosis | Normal to advanced amyloid cardiomyopathy; apical sparing; the ESC 2021 echo criteria |
| | B5 Pericardial disease | Effusion to tamponade; constriction |
| | B6 Prosthetic valves | A 23-mm aortic prosthesis from normal to significant stenosis; prosthesis–patient mismatch |
| | B7 Infective endocarditis | A mitral vegetation up to 22 mm, then leaflet perforation with MR |
| | B8 Shunts: ASD, VSD and PFO | Small to large shunts; the saline study; the LA pressure across a restrictive atrial communication |
| | B9 Cardiac masses and thrombus | Left atrial myxoma, LV thrombus, papillary fibroelastoma |
| | B10 Complications of myocardial infarction | Septal rupture, papillary muscle rupture, free-wall rupture with pseudoaneurysm, apical aneurysm |
| | B11 Left ventricular assist devices | A HeartMate 3 from 4,600 to 6,200 rpm; RV failure, de novo AR, outflow graft obstruction |

Chapters 09, 11 to 16 and 21, and B2 to B10, each follow one disease or one load from normal to its end stage. 18 to 20 follow a TAVR, an M-TEER and a T-TEER procedure through their steps, and B11 an LVAD through its pump speeds.

## Use

- **Heart.** The menu in the header sets the heart for every chapter: normal, cardiac amyloidosis, ischemic cardiomyopathy, a Barlow mitral valve with severe regurgitation, or a bicuspid aortic valve with severe stenosis. Each chapter opens at that heart's values. The page keeps the choice between visits.
- **Motion.** Each chapter opens and plays its own steps. The buttons at the corner of the figure pause or play all motion (the beating heart, the flow and the steps) and set its speed: 0.5×, 1× or 2×. The readouts and the time scales stay in real units. An input stops the steps; the slider's Play, or the figure's Play in a chapter without one, starts them again. With reduced motion the figures stay still and the buttons are hidden. The tour through all chapters (*Play all chapters*) is hidden, and its code stays (`TOUR` in `src/main.js`).
- **Severity pages.** One slider runs from normal to the end stage, with the grade bands under it. The views, the Doppler strips and the measurement strip change together. Diagrams with ▲▼ buttons show how each measurement moves the grade.
- **Sound.** The Sound button plays music in time with the heart and soft cues for changes on screen, synthesized in the browser. It is off until clicked. On iPhone and iPad the page asks for media playback, so the silent switch does not mute it.
- **Keys and addresses.** ← and → change the chapter, the space bar pauses or plays the motion, and [ and ] step the views in 04. Each chapter opens by its key, for example `#as` or `#tee`.
- **Phones.** The figure stays in view above the text, with Play or Pause and one speed button (1×, 2×, 0.5×) at its top right. A bar at the bottom holds back, next and the chapter list.

## Images and values

- **Simulated images.** There are no patient images. One heart model serves every chapter. Every chapter but 07 cuts its echo views from it. Each disease changes the shape of that heart, so that the image shows the size that the text prints.
- **Image formation.** Each B-mode frame models echogenicity by structure, specular surfaces, speckle that moves with the wall, beam blur, near-field clutter, noise, time-gain and log compression. Color jets come from a model of their flow.
- **Grades.** Each severity page sets its values inside the guideline bands. The page rounds each value to its printed decimals and grades from the rounded values, so a value on screen never contradicts its grade. Each page models one lesion, as the guidelines grade one lesion at a time.
- **Limits.** The models are illustrative and set to agree with the sources.

## Sources

- The main sources are Lang 2015, Mitchell 2019, Zoghbi 2017, Baumgartner 2017, Otto 2020, Pandian 2023, Nagueh 2025, Mukherjee 2025, Thomas 2025, Klein 2013, Adler 2015, Schulz-Menger 2025, Garcia-Pavia 2021, Moody 2023, Pellikka 2020, Lancellotti 2017 and Taub 2025. The full list, with DOI and PubMed links, opens from **Sources** on the page. Each reference was checked against PubMed and Crossref.
- The AI chapter follows the papers and the public code of EchoPrime (Vukadinovic 2026) and EchoNet-Measurements (Sahashi 2025). Neither model ran on the site's images. The figure simulates their outputs from the site's own values.

Development notes: [DEVELOPMENT.md](DEVELOPMENT.md)
