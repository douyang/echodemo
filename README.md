# The Heart in Sound

An illustrated, interactive study of echocardiography for trainees: ultrasound physics, the standard views, cardiac physiology, Doppler, ventricular function, valve disease and the final report. Seventeen chapters in six parts. Chapters 11 to 16 each follow one disease from normal to its end stage: one slider, a Play button, and several views that change together. Every guideline value carries its source.

![Chapter 04, Planes: the standard views as planes through one heart, with the mitral valve selected](docs/screenshots/planes.webp)

## Chapters

| Part | Chapter | The figure |
| --- | --- | --- |
| I Physics and views | 01 Pulse | One scan line: pulse, echoes, A-mode, wavelength and axial resolution, attenuation by tissue |
| | 02 Image | A sector image built line by line; frame rate; four artifacts |
| | 03 Windows | 29 canonical views: the heart with the imaging plane, and the echo view that plane cuts from the same mesh |
| | 04 Planes | All standard view planes in one heart: crossings, parallel stacks, and which views show a structure |
| II Physiology | 05 Cycle | Wiggers diagram with ECG, heart sounds, mitral and LVOT Doppler, and the four-chamber frame at the cursor |
| | 06 Loop | Pressure–volume loop: ESPVR, EDPVR, arterial elastance, EF = Ees ÷ (Ees + Ea) |
| III Doppler | 07 Shift | Doppler equation, beam angle, Nyquist limit, pulsed, continuous and color Doppler |
| | 08 Pressure | Stroke volume from LVOT area × VTI; RV systolic pressure from the TR jet and the IVC |
| IV Function | 09 Eject | Biplane method of disks and foreshortening; TAPSE, S′ and fractional area change |
| | 10 Segments | 17-segment bull's-eye, the three apical views, coronary territories, wall motion score index |
| | 11 Fill | Diastolic dysfunction, normal to restrictive: four-chamber view with the LA to scale, mitral inflow, tissue Doppler, pulmonary veins, LA strain, TR jet, and the 2025 ASE algorithm run live |
| V Valves | 12 Aortic stenosis | Normal valve to severe stenosis, then LV failure and low flow: PLAX with hypertrophy, short-axis orifice to scale, CW and LVOT Doppler, mitral inflow |
| | 13 Mitral stenosis | Normal valve to severe rheumatic stenosis: doming leaflets, LA size, pressure half-time, the gradient at any heart rate, PA pressure, planimetry |
| | 14 Mitral regurgitation | Mild to severe with LV dysfunction: color jet and PISA shell, CW jet, pulmonary vein flow reversal, E wave, LV and LA dilation |
| | 15 Aortic regurgitation | Mild to severe with LV dysfunction: jet width in the LVOT, pressure half-time, descending aorta reversal, LVOT VTI, LV dilation |
| | 16 Tricuspid regurgitation | Mild to torrential: RV, annulus and RA dilation, hepatic vein reversal, IVC, septal flattening, a jet that slows at the torrential end |
| VI Report | 17 Report | Four simulated cases written up in the ASE 2025 report structure, with sex-specific ranges |

| | | |
| --- | --- | --- |
| ![01 Pulse](docs/screenshots/pulse.webp) | ![03 Windows](docs/screenshots/windows.webp) | ![06 Loop](docs/screenshots/loop.webp) |
| ![11 Fill](docs/screenshots/fill.webp) | ![12 Aortic stenosis](docs/screenshots/as.webp) | ![14 Mitral regurgitation](docs/screenshots/mr.webp) |
| ![15 Aortic regurgitation](docs/screenshots/ar.webp) | ![16 Tricuspid regurgitation](docs/screenshots/tr.webp) | ![17 Report](docs/screenshots/report.webp) |

On a phone the figure sits above the text and stays in view while the text scrolls:

![Phone, chapter 04](docs/screenshots/phone-planes.webp) ![Phone, chapter 14](docs/screenshots/phone-mr.webp)

## Views and the lab's annotation classes

Chapter 03 covers the ASE comprehensive transthoracic views (Mitchell 2019, Tables 2.1–2.27). Each view carries the class name from the lab's annotation list (`lab` in `src/views.js`), for example `PLAX_IVS_LVPW_LVIDD`, `PSAX_(level_great_vessels)_focus_on_PV_and_PA`, `Subcostal_IVC`, `SSN_aortic_arch`. The subcostal abdominal aorta has no slice: it lies below the diaphragm, outside the heart model.

Chapter 04 shows the planes together. The apical views share the LV long axis; the model places the two-chamber plane about 60° from the four- and three-chamber planes, as the ASE rotation describes. The short-axis levels form a parallel stack. The structure table lists what ASE names for each view.

## The severity pages (chapters 11 to 16)

- **One slider per disease.** It runs from normal to the end stage. The bands under it show where the grade changes; the page computes them from its own model, so a band starts where the values cross the guideline cut-off.
- **Play** moves the slider through the whole course and starts again; any control stops it. **Cine** runs the beat; with it off, the views stop at the moment that shows the jet.
- **Several views change together.** A 2D view drawn to scale (a caliper on the screen reads the value in the text), three or four Doppler strips with a cursor at the same moment of the beat, a strip of measurements against their cut-offs, and the guideline table with the current column marked.
- **Grades and stages.** Regurgitation follows ASE 2017 (Zoghbi), with EACVI 2022 for massive and torrential TR; aortic stenosis follows Baumgartner 2017; mitral stenosis follows ASE 2023 (Pandian); diastolic function follows ASE 2025 (Nagueh). The LV and atrial consequences follow the ACC/AHA 2020 stages (Otto), for example stage C2 in MR at LVEF ≤60% or end-systolic diameter ≥40 mm.
- **What the model is.** The orifice or valve area drives the numbers (PISA, continuity equation, pressure half-time = 220 ÷ area); the chamber sizes, vein flows and pressures follow illustrative tracks set inside the guideline bands. They are teaching values, not patient data.

## Sources and data

- Guideline values come from ASE, EACVI, ACC/AHA, ESC/ERS and IAC documents; the main ones are Lang 2015 (chamber quantification), Mitchell 2019 (comprehensive TTE), Zoghbi 2017 (regurgitation), Baumgartner 2017 (aortic stenosis), Otto 2020 (valve disease), Pandian 2023 (rheumatic mitral stenosis), Nagueh 2025 (diastolic function), Mukherjee 2025 (right heart), Thomas 2025 (strain) and Taub 2025 (reporting). The full list, with DOI and PubMed links, opens from **Sources** on the page (`src/refs.js`).
- Each reference was checked against PubMed and Crossref before use. Where sources disagree, the page follows the current guideline.
- The figures run simple models set to agree with these sources. The diastolic values and the four report cases are illustrative, not patient data. All images are simulated; there are no patient images.
- Normal values for the **Normal values** dialog and the grading helpers live in one place: `src/norms.js`.

## How it is built

A static site with no build step: ES modules, a canvas sketch layer (`src/sketch.js`, rough.js) and a WebGL pencil renderer for the 3D heart (three.js). Echo views are live cross-sections of the heart mesh (`src/echo.js`). The heart mesh, pencil renderer and 3D stage are adapted from *The Amyloid Heart*. Vendored libraries and their licenses are in `vendor/`.

```
index.html          page, chapter text, dialogs
src/main.js         chapter engine: controls, readouts, citations, tour, keyboard
src/ch/*.js         one module per chapter
src/sev.js          severity pages: keyframe tracks, grade bands, Play, measurement strip
src/echo2d.js       parametric echo views drawn to scale: A4C, PLAX, short-axis insets, IVC M-mode
src/views.js        view catalog: planes, lab classes, structures, probe moves
src/echo.js         plane geometry and the echo-view renderer
src/cyclemodel.js   one heartbeat (pressures, volume, valve events)
src/norms.js        normal values and cut-offs
src/refs.js         references
assets/             heart mesh (JSON), anatomy landmarks, poster image
```

## Run it

Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. A chapter can be opened directly: `#planes`, `#fill`, `#report`.

Keys: ← → change chapter, space plays the tour, 1–5 and [ ] step the views in chapters 03 and 04. A chapter opens directly by its key, for example `#as`, `#mr`, `#tr`.

## Checks run before this commit

- `node --check` on every module.
- Screenshots of all 17 chapters at 1440 × 900 and 390 × 844, and of the main chapters in the dark theme; no console errors.
- Every chapter's tour steps run, and the Play button advances chapters. On the severity pages, Play moves the slider and any control stops it.
- Each severity model swept across its slider: the grade bands come out in order; in MR, AR and TR the EROA, volume, fraction and vena contracta cross their severe cut-offs at the same point.
- Citation audit: every cited id resolves to a reference, and every id used in live text also appears in the static text, so it gets a number.
- Model checks: the diastolic algorithm across the whole filling slider; aortic stenosis velocity, gradient and area across valve areas; mitral gradient across heart rates; pressure–volume presets.
