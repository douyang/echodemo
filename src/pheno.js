// The heart the whole page shows: a normal heart, or one of four disease hearts. The choice sits
// in the header, is kept between visits, moves the 3D heart and every echo view cut from it
// (model3d.js), and sets the chapters' starting values (presets).
// note: what the heart shows, with its sizes measured on the mesh (short-axis slices), for the
// heart note (off: SHOW_HEART_NOTE in main.js)
export const PHENOS = {
  normal: { name: 'Normal', long: 'Normal heart', a: 0, mesh: null },
  amyloid: {
    name: 'Amyloid', long: 'Cardiac amyloidosis', a: 1, mesh: null,
    note: 'LV walls 15–16 mm round a small cavity (end-diastolic volume 72 mL, EF 54%); thick valves, RV wall and atrial septum; a small effusion.',
  },
  icm: {
    name: 'Ischemic CM', long: 'Ischemic cardiomyopathy', a: 0, mesh: 'icm',
    note: 'An old LAD infarct: the LV is dilated (end-diastolic volume 222 mL, EF 25%), its LAD territory akinetic and its apex thin.',
  },
  barlow: {
    name: 'Barlow MR', long: 'Barlow mitral valve, severe mitral regurgitation', a: 0, mesh: 'barlow',
    note: 'Both mitral leaflets thick and prolapsing; severe regurgitation; the LA and LV dilated by the volume load (end-diastolic volume 183 mL, EF 67%).',
  },
  bav: {
    name: 'Bicuspid AS', long: 'Bicuspid aortic valve, severe aortic stenosis', a: 0, mesh: 'bav',
    note: 'The right and left cusps fused, with a raphe: the valve domes and opens as a slit. Severe stenosis; LV walls 12.5 mm; ascending aorta 3.9 cm.',
  },
};
export const PHENO_KEYS = Object.keys(PHENOS);
export const PHENO_STORE = 'heart-in-sound-heart';

// Each chapter opens at the heart's own values. The LV sizes come from the heart mesh itself
// (short-axis slices of each shape at end-diastole and end-systole); the valve pages start at
// the grade that goes with the heart, read off each page's own model.
const segs = (list, wm) => Array.from({ length: 17 }, (_, i) => (list.includes(i + 1) ? wm : 1)).join('');
const LAD = [1, 2, 7, 8, 13, 14, 17];
const PRESETS = {
  amyloid: {
    pv: 'hfpef', sv: 40, trV: 3.0,
    side: 'lv', edv: 72, ef: 54, wall: 16, tapse: 15, sPrime: 9, fac: 35,
    fstate: 3, periS: 0.25, amyS: 1, caseId: 'amyloid',
  },
  icm: {
    pv: 'hfref', sv: 45, trV: 3.1,
    side: 'lv', edv: 222, ef: 25, wall: 8, tapse: 16, sPrime: 9.5, fac: 34,
    culprit: 'lad', wm: 3, segs: segs(LAD, 3),
    fstate: 2.2, caseId: 'icm',
  },
  barlow: {
    pv: 'mr', sv: 55, trV: 3.0,
    side: 'lv', edv: 183, ef: 67, wall: 9,
    mrS: 0.6, caseId: 'barlow',
  },
  bav: {
    pv: 'as', sv: 60, trV: 2.6,
    side: 'lv', edv: 90, ef: 63, wall: 12.5,
    fstate: 1, asS: 0.55, caseId: 'bav',
  },
};
// under a disease heart the valve, pericardium and amyloid pages start with no disease unless it is the heart's own
const QUIET = { asS: 0, arS: 0, msS: 0, mrS: 0, trS: 0, periS: 0, amyS: 0 };
/** The chapter state that heart key starts from ({} for the normal heart). */
export function presetsFor(key) { return key === 'normal' || !PRESETS[key] ? {} : { ...QUIET, ...PRESETS[key] }; }
/** Every state key that some heart presets. */
export const PRESET_KEYS = [...new Set([...Object.keys(QUIET), ...Object.values(PRESETS).flatMap((p) => Object.keys(p))])];
