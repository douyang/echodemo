// The canonical 2D views: ASE comprehensive-TTE views, cross-referenced to the lab's
// annotation classes (the `lab` field). Each view is a plane through the heart model.
//
// plane: how viewGeometry() builds the plane; aim: the landmark the beam points at;
// zoom: magnified box around a landmark (width in cm); labels: structures to name.

export const WINDOWS = [
  { key: 'plax', name: 'Parasternal long', probe: 'Left sternal border, 3rd–4th intercostal space' },
  { key: 'psax', name: 'Parasternal short', probe: 'Same spot, rotated 90° clockwise' },
  { key: 'apical', name: 'Apical', probe: 'Over the LV apex (point of maximal impulse)' },
  { key: 'sub', name: 'Subcostal', probe: 'Below the xiphoid, patient supine, knees bent' },
  { key: 'ssn', name: 'Suprasternal', probe: 'Suprasternal notch, neck extended' },
];

const V = (o) => ({ angle: 80, near: 1.2, ...o });

export const VIEWS = {
  // ---- parasternal long axis
  plax: V({ win: 'plax', short: 'PLAX', name: 'Parasternal long axis', lab: 'PLAX_IVS_LVPW_LVIDD', plane: 'plax', depth: 16,
    labels: [['rvant', 'RVOT'], ['asw', 'IVS'], ['lv', 'LV'], ['ilw', 'inferolateral wall'], ['la', 'LA'], ['ao', 'Ao'], ['mv', 'MV'], ['desc', 'desc Ao']] }),
  plax_deep: V({ win: 'plax', short: 'PLAX', name: 'Parasternal long axis, increased depth', lab: 'PLAX_Zoom_out', plane: 'plax', depth: 24,
    labels: [['rvant', 'RVOT'], ['lv', 'LV'], ['la', 'LA'], ['ao', 'Ao'], ['desc', 'desc Ao']] }),
  plax_avmv: V({ win: 'plax', short: 'PLAX', name: 'Parasternal long axis, aortic and mitral valves', lab: 'PLAX_AV_MV', plane: 'plax', depth: 16, zoom: { at: 'avmv', w: 9 },
    labels: [['av', 'AV'], ['mv', 'MV'], ['la', 'LA'], ['ao', 'Ao'], ['lvot', 'LVOT']] }),
  plax_av: V({ win: 'plax', short: 'PLAX', name: 'Parasternal long axis, zoomed aortic valve', lab: 'PLAX_zoomed_AV', plane: 'plax', depth: 16, zoom: { at: 'av', w: 5.5 },
    labels: [['av', 'AV'], ['ao', 'Ao'], ['lvot', 'LVOT']] }),
  plax_mv: V({ win: 'plax', short: 'PLAX', name: 'Parasternal long axis, zoomed mitral valve', lab: 'PLAX_zoomed_MV', plane: 'plax', depth: 16, zoom: { at: 'mv', w: 6 },
    labels: [['mv', 'MV'], ['la', 'LA'], ['lv', 'LV']] }),
  plax_asc: V({ win: 'plax', short: 'PLAX', name: 'Parasternal long axis, proximal ascending aorta', lab: 'PLAX_Proximal_Ascending_Aorta', plane: 'plax_asc', depth: 16,
    labels: [['asc', 'ascending Ao'], ['av', 'AV'], ['lv', 'LV'], ['la', 'LA']] }),
  rv_in: V({ win: 'plax', short: 'RVIT', name: 'RV inflow', lab: 'PLAX_RV_inflow', plane: 'rv_in', depth: 16,
    labels: [['rv', 'RV'], ['tv', 'TV'], ['ra', 'RA'], ['ivc', 'IVC']] }),
  rv_out: V({ win: 'plax', short: 'RVOT', name: 'RV outflow', lab: 'PLAX_RV_outflow', plane: 'rv_out', depth: 16,
    labels: [['rvot', 'RVOT'], ['pv', 'PV'], ['mpa', 'main PA']] }),
  // ---- parasternal short axis
  psax_av: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, aortic valve level', lab: 'PSAX_(level_great_vessels)', plane: 'psax_av', depth: 14,
    labels: [['av', 'AV'], ['la', 'LA'], ['ra', 'RA'], ['rvot', 'RVOT'], ['tv', 'TV'], ['mpa', 'PA']] }),
  psax_pa: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, pulmonic valve and pulmonary artery', lab: 'PSAX_(level_great_vessels)_focus_on_PV_and_PA', plane: 'psax_pa', depth: 14,
    labels: [['pv', 'PV'], ['mpa', 'main PA'], ['rpa', 'RPA'], ['lpa', 'LPA'], ['av', 'AV']] }),
  psax_tv: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, tricuspid valve', lab: 'PSAX_(level_great_vessels)_focus_on_TV', plane: 'psax_tv', depth: 14,
    labels: [['tv', 'TV'], ['ra', 'RA'], ['rvot', 'RV'], ['av', 'AV']] }),
  psax_avz: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, zoomed aortic valve', lab: 'PSAX_(level_great_vessels)_zoomed_AV', plane: 'psax_av', depth: 14, zoom: { at: 'av', w: 5 },
    labels: [['av', 'AV']] }),
  psax_cor: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, coronary artery origins', lab: null, plane: 'psax_cor', depth: 14, zoom: { at: 'avroot', w: 5 },
    labels: [['lmca', 'LMCA'], ['rca', 'RCA'], ['avroot', 'Ao root']] }),
  psax_mv: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, mitral valve level', lab: 'PSAX_(level_of_MV)', plane: 'psax', level: 0.72, depth: 14,
    labels: [['rv', 'RV'], ['ivs', 'IVS'], ['lv', 'LV'], ['mv', 'MV']] }),
  psax_pm: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, papillary muscle level', lab: 'PSAX_(level_of_papillary_muscles)', plane: 'psax', level: -0.24, depth: 14,
    labels: [['rv', 'RV'], ['ivs', 'IVS'], ['lv', 'LV'], ['antw', 'anterior'], ['infw', 'inferior'], ['latw', 'lateral']] }),
  psax_ap: V({ win: 'psax', short: 'PSAX', name: 'Parasternal short axis, apical level', lab: 'PSAX_(level_of_apex)', plane: 'psax', level: -1.25, depth: 14,
    labels: [['lv', 'LV'], ['antw', 'anterior']] }),
  // ---- apical
  a4c: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber', lab: 'A4C', plane: 'a4c', depth: 17, near: 1.0,
    labels: [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA'], ['ivs', 'IVS'], ['mv', 'MV'], ['tv', 'TV'], ['apex', 'apex']] }),
  a4c_lv: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber, LV focused', lab: 'A4C_LV', plane: 'a4c', aim: 'lvc', depth: 14, near: 1.0,
    labels: [['lv', 'LV'], ['mv', 'MV'], ['apex', 'apex'], ['ivs', 'IVS']] }),
  a4c_rv: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber, RV focused', lab: 'A4C_RV', plane: 'a4c_rv', depth: 17, near: 1.0,
    labels: [['rv', 'RV'], ['ra', 'RA'], ['tv', 'TV'], ['lv', 'LV']] }),
  a4c_la: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber, LA focused', lab: 'A4C_LA', plane: 'a4c', aim: 'la', depth: 18, near: 1.0, zoom: { at: 'la', w: 9 },
    labels: [['la', 'LA'], ['mv', 'MV'], ['ias', 'IAS']] }),
  a4c_mv: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber, zoomed mitral valve', lab: 'A4C_MV', plane: 'a4c', depth: 17, near: 1.0, zoom: { at: 'mv', w: 6 },
    labels: [['mv', 'MV'], ['la', 'LA']] }),
  a4c_tv: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber, zoomed tricuspid valve', lab: null, plane: 'a4c', depth: 17, near: 1.0, zoom: { at: 'tv', w: 6 },
    labels: [['tv', 'TV'], ['ra', 'RA'], ['rv', 'RV']] }),
  a4c_apex: V({ win: 'apical', short: 'A4C', name: 'Apical four-chamber, zoomed LV apex', lab: null, plane: 'a4c', aim: 'lvc', depth: 14, near: 1.0, zoom: { at: 'apex', w: 6 },
    labels: [['apex', 'apex'], ['lv', 'LV']] }),
  a5c: V({ win: 'apical', short: 'A5C', name: 'Apical five-chamber', lab: 'A5C', plane: 'a5c', depth: 17, near: 1.0,
    labels: [['lv', 'LV'], ['lvot', 'LVOT'], ['av', 'AV'], ['rv', 'RV'], ['ra', 'RA'], ['la', 'LA']] }),
  a2c: V({ win: 'apical', short: 'A2C', name: 'Apical two-chamber', lab: 'A2C', plane: 'a2c', depth: 17, near: 1.0,
    labels: [['lv', 'LV'], ['la', 'LA'], ['mv', 'MV'], ['wallR', 'anterior'], ['wallL', 'inferior'], ['apex', 'apex']] }),
  a2c_lv: V({ win: 'apical', short: 'A2C', name: 'Apical two-chamber, LV focused', lab: 'A2C_LV', plane: 'a2c', aim: 'lvc', depth: 14, near: 1.0,
    labels: [['lv', 'LV'], ['wallR', 'anterior'], ['wallL', 'inferior'], ['apex', 'apex']] }),
  a3c: V({ win: 'apical', short: 'A3C', name: 'Apical three-chamber (apical long axis)', lab: 'A3C', plane: 'a3c', depth: 17, near: 1.0,
    labels: [['lv', 'LV'], ['la', 'LA'], ['ao', 'Ao'], ['mv', 'MV'], ['wallR', 'anteroseptal'], ['wallL', 'inferolateral'], ['apex', 'apex']] }),
  a3c_lv: V({ win: 'apical', short: 'A3C', name: 'Apical three-chamber, LV focused', lab: 'A3C_LV', plane: 'a3c', aim: 'lvc', depth: 14, near: 1.0,
    labels: [['lv', 'LV'], ['wallR', 'anteroseptal'], ['wallL', 'inferolateral'], ['apex', 'apex']] }),
  a3c_av: V({ win: 'apical', short: 'A3C', name: 'Apical three-chamber, zoomed aortic valve', lab: null, plane: 'a3c', depth: 17, near: 1.0, zoom: { at: 'av', w: 6 },
    labels: [['av', 'AV'], ['lvot', 'LVOT'], ['ao', 'Ao']] }),
  // ---- subcostal
  sc4c: V({ win: 'sub', short: 'SC', name: 'Subcostal four-chamber', lab: 'Subcostal_4C', plane: 'sc4c', depth: 20, angle: 84, near: 5.0, liver: true,
    labels: [['liver', 'liver'], ['rv', 'RV'], ['ra', 'RA'], ['lv', 'LV'], ['la', 'LA'], ['ias', 'IAS']] }),
  sc4c_ias: V({ win: 'sub', short: 'SC', name: 'Subcostal four-chamber, zoomed atrial septum', lab: null, plane: 'sc4c', depth: 20, angle: 84, near: 5.0, liver: true, zoom: { at: 'ias', w: 7 },
    labels: [['ias', 'IAS'], ['ra', 'RA'], ['la', 'LA']] }),
  sc_ivc: V({ win: 'sub', short: 'SC', name: 'Subcostal inferior vena cava', lab: 'Subcostal_IVC', plane: 'sc_ivc', depth: 16, angle: 76, near: 1.6,
    labels: [['liver', 'liver'], ['ivcl', 'IVC'], ['hv', 'hepatic vein'], ['ra', 'RA']] }),
  sc_aorta: V({ win: 'sub', short: 'SC', name: 'Subcostal abdominal aorta', lab: 'Subcostal_Abdominal_Aorta', plane: 'sc_aorta', depth: 18, angle: 76, near: 1.6,
    labels: [['liver', 'liver'], ['abdao', 'abdominal Ao'], ['celiac', 'celiac trunk'], ['sma', 'SMA']] }),
  // ---- suprasternal
  ssn: V({ win: 'ssn', short: 'SSN', name: 'Suprasternal aortic arch', lab: 'SSN_aortic_arch', plane: 'ssn', depth: 16, angle: 76, near: 1.5,
    labels: [['asc', 'ascending Ao'], ['arch', 'arch'], ['desc', 'descending Ao'], ['rpa', 'RPA']] }),
  ssn_sax: V({ win: 'ssn', short: 'SSN', name: 'Suprasternal short axis', lab: null, plane: 'ssn_sax', depth: 16, angle: 76, near: 1.5,
    labels: [['arch', 'arch'], ['rpa', 'RPA'], ['la', 'LA'], ['svc', 'SVC']] }),
};

export const ORDER = {
  plax: ['plax', 'plax_deep', 'plax_avmv', 'plax_av', 'plax_mv', 'plax_asc', 'rv_in', 'rv_out'],
  psax: ['psax_av', 'psax_pa', 'psax_tv', 'psax_avz', 'psax_cor', 'psax_mv', 'psax_pm', 'psax_ap'],
  apical: ['a4c', 'a4c_lv', 'a4c_rv', 'a4c_la', 'a4c_mv', 'a4c_tv', 'a4c_apex', 'a5c', 'a2c', 'a2c_lv', 'a3c', 'a3c_lv', 'a3c_av'],
  sub: ['sc4c', 'sc4c_ias', 'sc_ivc', 'sc_aorta'],
  ssn: ['ssn', 'ssn_sax'],
};

/** Button label of a view inside its window. */
export const SHORT = {
  plax: 'Standard', plax_deep: 'Deep', plax_avmv: 'AV + MV', plax_av: 'AV zoom', plax_mv: 'MV zoom', plax_asc: 'Ascending Ao', rv_in: 'RV inflow', rv_out: 'RV outflow',
  psax_av: 'AV level', psax_pa: 'PV + PA', psax_tv: 'TV', psax_avz: 'AV zoom', psax_cor: 'Coronaries', psax_mv: 'MV level', psax_pm: 'Papillary', psax_ap: 'Apex',
  a4c: 'A4C', a4c_lv: 'A4C LV', a4c_rv: 'A4C RV', a4c_la: 'A4C LA', a4c_mv: 'A4C MV', a4c_tv: 'A4C TV', a4c_apex: 'A4C apex', a5c: 'A5C', a2c: 'A2C', a2c_lv: 'A2C LV', a3c: 'A3C', a3c_lv: 'A3C LV', a3c_av: 'A3C AV',
  sc4c: 'Four-chamber', sc4c_ias: 'Atrial septum', sc_ivc: 'IVC', sc_aorta: 'Abdominal aorta',
  ssn: 'Aortic arch', ssn_sax: 'Short axis',
};

/** Great-vessel centerline points of the heart model (world, cm), measured on the mesh. */
export const VESSELS = {
  ascMid: [-1.6, 6.2, 1.2],
  archTop: [0.1, 11.0, -1.6],
  desc: [0.9, 3.0, -5.8],
  descLow: [0.62, -2.0, -6.0],
  ivc: [-3.3, -4.4, 2.4],
  paBif: [0.8, 6.8, -1.0],
  svc: [-3.06, 4.81, 2.2],        // superior vena cava, middle of the modelled segment
  lmca: [0.85, 2.3, -0.45],       // left main coronary artery at its origin
  rca: [-0.16, 2.4, 1.56],        // right coronary artery at its origin
};

// ---------------------------------------------------------------------------------------------
// Structures each view shows, from the ASE comprehensive TTE guideline (Mitchell 2019,
// Tables 2.1-2.27). Zoomed and focused variants share the plane of their parent view.
export const STRUCTS = [
  { id: 'lv', name: 'Left ventricle', short: 'LV', anchor: 'lv' },
  { id: 'rv', name: 'Right ventricle', short: 'RV', anchor: 'rv' },
  { id: 'la', name: 'Left atrium', short: 'LA', anchor: 'la' },
  { id: 'ra', name: 'Right atrium', short: 'RA', anchor: 'ra' },
  { id: 'ivs', name: 'Ventricular septum', short: 'IVS', anchor: 'septum' },
  { id: 'ias', name: 'Atrial septum', short: 'IAS', anchor: 'ias' },
  { id: 'mv', name: 'Mitral valve', short: 'MV', anchor: 'mv' },
  { id: 'tv', name: 'Tricuspid valve', short: 'TV', anchor: 'tv' },
  { id: 'av', name: 'Aortic valve', short: 'AV', anchor: 'av' },
  { id: 'pv', name: 'Pulmonic valve', short: 'PV', anchor: 'pv' },
  { id: 'lvot', name: 'LV outflow tract', short: 'LVOT', anchor: 'lvot' },
  { id: 'rvot', name: 'RV outflow tract', short: 'RVOT', anchor: 'rvot' },
  { id: 'pm', name: 'Papillary muscles', short: 'Pap', anchor: 'lvc' },
  { id: 'asc', name: 'Aortic root and ascending aorta', short: 'Asc Ao', anchor: 'asc' },
  { id: 'arch', name: 'Aortic arch', short: 'Arch', anchor: 'arch' },
  { id: 'desc', name: 'Descending aorta', short: 'Desc Ao', anchor: 'desc' },
  { id: 'pa', name: 'Pulmonary artery', short: 'PA', anchor: 'mpa' },
  { id: 'ivc', name: 'Inferior vena cava', short: 'IVC', anchor: 'ivc' },
  { id: 'svc', name: 'Superior vena cava', short: 'SVC', anchor: 'svc' },
  { id: 'cor', name: 'Coronary artery origins', short: 'Cor', anchor: 'lmca' },
  { id: 'pvn', name: 'Pulmonary veins', short: 'PVs', anchor: null },
  { id: 'peri', name: 'Pericardial and pleural spaces', short: 'Peri', anchor: null },
  { id: 'abd', name: 'Abdominal aorta', short: 'Abd Ao', anchor: 'abdao' },
];

const PLAX_HAS = ['la', 'mv', 'lv', 'lvot', 'av', 'ivs', 'rv'];
export const HAS = {
  plax: PLAX_HAS,
  plax_deep: [...PLAX_HAS, 'peri'],
  plax_avmv: ['av', 'mv'],
  plax_av: ['av', 'lvot', 'asc'],
  plax_mv: ['mv', 'la', 'lv'],
  plax_asc: ['av', 'asc'],
  rv_in: ['ra', 'tv', 'rv', 'ivc'],
  rv_out: ['rvot', 'pv', 'pa'],
  psax_av: ['av', 'la', 'ra', 'tv', 'rvot', 'pv', 'ias'],
  psax_pa: ['asc', 'ra', 'rvot', 'pv', 'pa'],
  psax_tv: ['ra', 'tv', 'rv', 'ivs'],
  psax_avz: ['av'],
  psax_cor: ['av', 'asc', 'cor'],
  psax_mv: ['rv', 'ivs', 'mv', 'lv'],
  psax_pm: ['rv', 'ivs', 'pm', 'lv'],
  psax_ap: ['lv'],
  a4c: ['la', 'mv', 'lv', 'ivs', 'rv', 'tv', 'ra', 'ias'],
  a4c_lv: ['lv', 'mv', 'la'],
  a4c_rv: ['ra', 'tv', 'rv', 'la', 'lv'],
  a4c_la: ['pvn', 'la', 'mv', 'lv', 'ra', 'tv', 'rv'],
  a4c_mv: ['mv'],
  a4c_tv: ['tv', 'ra', 'rv'],
  a4c_apex: ['lv'],
  a5c: ['la', 'mv', 'lv', 'ivs', 'lvot', 'av', 'asc', 'ra', 'rv'],
  a2c: ['lv', 'mv', 'la'],
  a2c_lv: ['lv'],
  a3c: ['la', 'mv', 'lv', 'lvot', 'av', 'asc'],
  a3c_lv: ['lv'],
  a3c_av: ['av', 'lvot', 'asc'],
  sc4c: ['lv', 'mv', 'rv', 'tv', 'ias', 'ivs', 'ra', 'la'],
  sc4c_ias: ['ias', 'ra', 'la'],
  sc_ivc: ['ivc', 'ra'],
  sc_aorta: ['abd'],
  ssn: ['asc', 'arch', 'desc', 'pa'],
  ssn_sax: ['arch', 'pa', 'la', 'svc'],
};

/** Views with a plane of their own, in scanning order (chapter 04). */
export const PLANE_VIEWS = ['plax', 'plax_asc', 'rv_in', 'rv_out', 'psax_av', 'psax_pa', 'psax_tv', 'psax_cor', 'psax_mv', 'psax_pm', 'psax_ap',
  'a4c', 'a4c_rv', 'a5c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'sc_aorta', 'ssn', 'ssn_sax'];

/** Compact codes for tables and the 3D tags. */
export const CODE = {
  plax: 'PLAX', plax_deep: 'PLAX deep', plax_avmv: 'PLAX AV/MV', plax_av: 'PLAX AV', plax_mv: 'PLAX MV', plax_asc: 'PLAX Ao', rv_in: 'RVIT', rv_out: 'RVOT',
  psax_av: 'SAX AV', psax_pa: 'SAX PA', psax_tv: 'SAX TV', psax_avz: 'SAX AV zoom', psax_cor: 'SAX Cor', psax_mv: 'SAX MV', psax_pm: 'SAX PM', psax_ap: 'SAX apex',
  a4c: 'A4C', a4c_lv: 'A4C LV', a4c_rv: 'A4C RV', a4c_la: 'A4C LA', a4c_mv: 'A4C MV', a4c_tv: 'A4C TV', a4c_apex: 'A4C apex', a5c: 'A5C', a2c: 'A2C', a2c_lv: 'A2C LV', a3c: 'A3C', a3c_lv: 'A3C LV', a3c_av: 'A3C AV',
  sc4c: 'SC4C', sc4c_ias: 'SC IAS', sc_ivc: 'SC IVC', sc_aorta: 'SC Ao', ssn: 'SSN', ssn_sax: 'SSN SAX',
};

/** How to reach each view (ASE 2019 Section IV; Tables 2.1-2.27). */
export const MOVE = {
  plax: 'Left sternal border, 3rd or 4th space; marker toward the right shoulder (9 to 10 o’clock)',
  plax_deep: 'PLAX with the depth increased to see behind the heart',
  plax_avmv: 'PLAX, both valves in the sector',
  plax_av: 'PLAX, zoom on the aortic valve',
  plax_mv: 'PLAX, zoom on the mitral valve',
  plax_asc: 'From PLAX, slide toward the aorta or move up one or two spaces',
  rv_in: 'From PLAX, tilt inferiorly toward the right hip',
  rv_out: 'From PLAX, tilt anteriorly and rotate slightly clockwise',
  psax_av: 'From PLAX, rotate 90° clockwise; marker toward the left shoulder',
  psax_pa: 'From the aortic valve level, tilt superiorly',
  psax_tv: 'At the aortic valve level, narrow the sector onto the tricuspid valve',
  psax_avz: 'At the aortic valve level, zoom on the valve',
  psax_cor: 'At the aortic valve level, tilt slightly toward the head and zoom on the aortic root',
  psax_mv: 'From the aortic valve level, tilt inferiorly',
  psax_pm: 'Tilt further, just below the mitral leaflet tips',
  psax_ap: 'Slide down one or two spaces and laterally',
  a4c: 'At the apical impulse; marker at 4 to 5 o’clock, toward the bed',
  a4c_lv: 'A4C with depth and sector reduced to the LV',
  a4c_rv: 'From A4C, tilt toward the right heart or slide medially; rotate slightly counterclockwise',
  a4c_la: 'A4C, repositioned for the longest and widest left atrium',
  a4c_mv: 'A4C, zoom on the mitral valve',
  a4c_tv: 'A4C, zoom on the tricuspid valve',
  a4c_apex: 'A4C with the depth reduced, zoom on the apex',
  a5c: 'From A4C, tilt the beam anteriorly',
  a2c: 'From A4C, rotate about 60° counterclockwise',
  a2c_lv: 'A2C with depth reduced to the LV',
  a3c: 'From A2C, rotate about 60° counterclockwise',
  a3c_lv: 'A3C with depth reduced to the LV',
  a3c_av: 'A3C, zoom on the aortic valve',
  sc4c: 'Below the xiphoid, marker to the patient’s left (3 o’clock), beam toward the left shoulder',
  sc4c_ias: 'Subcostal four-chamber, zoom on the atrial septum',
  sc_ivc: 'From the subcostal four-chamber view, rotate about 90° counterclockwise toward the liver',
  sc_aorta: 'From the IVC view, angle and slide slightly to the patient’s left',
  ssn: 'Suprasternal notch, neck extended; marker from 12 o’clock toward the left shoulder (1 o’clock)',
  ssn_sax: 'From the arch view, rotate 90° clockwise',
};
