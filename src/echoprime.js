// EchoPrime's anatomical attention (Vukadinovic 2026): for each of the 15 sections of the report,
// the weight that each of the 11 view groups carries. The values are those of the public code
// (github.com/echonet/EchoPrime, assets/MIL_weights.csv), rounded to 3 decimals. For a section,
// EchoPrime multiplies each video's 512-number embedding by its view group's weight, adds them
// and normalizes the sum (echo_prime/model.py predict_metrics), so the weights set how the videos
// of a study mix; a group with weight 0 adds nothing to that section.

/** The 11 view groups of the public code (utils.py COARSE_VIEWS), in its order: key, name, short tag. */
export const GROUPS = [
  { key: 'A2C', name: 'Apical two-chamber', tag: 'A2C' },
  { key: 'A3C', name: 'Apical three-chamber', tag: 'A3C' },
  { key: 'A4C', name: 'Apical four-chamber', tag: 'A4C' },
  { key: 'A5C', name: 'Apical five-chamber', tag: 'A5C' },
  { key: 'Apical_Doppler', name: 'Apical color Doppler', tag: 'Ap Dop' },
  { key: 'Doppler_Parasternal_Long', name: 'Parasternal long-axis color Doppler', tag: 'PLAX Dop' },
  { key: 'Doppler_Parasternal_Short', name: 'Parasternal short-axis color Doppler', tag: 'PSAX Dop' },
  { key: 'Parasternal_Long', name: 'Parasternal long axis', tag: 'PLAX' },
  { key: 'Parasternal_Short', name: 'Parasternal short axis', tag: 'PSAX' },
  { key: 'SSN', name: 'Suprasternal notch', tag: 'SSN' },
  { key: 'Subcostal', name: 'Subcostal', tag: 'Subcostal' },
];

/** The 15 sections, in the order of the weights (model.py non_empty_sections): EchoPrime's name and the site's. */
export const SECTIONS = [
  { key: 'lv', ep: 'Left Ventricle', name: 'Left ventricle' },
  { key: 'wm', ep: 'Resting Segmental Wall Motion Analysis', name: 'Regional wall motion' },
  { key: 'rv', ep: 'Right Ventricle', name: 'Right ventricle' },
  { key: 'la', ep: 'Left Atrium', name: 'Left atrium' },
  { key: 'ra', ep: 'Right Atrium', name: 'Right atrium' },
  { key: 'ias', ep: 'Atrial Septum', name: 'Atrial septum' },
  { key: 'mv', ep: 'Mitral Valve', name: 'Mitral valve' },
  { key: 'av', ep: 'Aortic Valve', name: 'Aortic valve' },
  { key: 'tv', ep: 'Tricuspid Valve', name: 'Tricuspid valve' },
  { key: 'pv', ep: 'Pulmonic Valve', name: 'Pulmonic valve' },
  { key: 'peri', ep: 'Pericardium', name: 'Pericardium' },
  { key: 'aorta', ep: 'Aorta', name: 'Aorta' },
  { key: 'ivc', ep: 'IVC', name: 'Inferior vena cava' },
  { key: 'pa', ep: 'Pulmonary Artery', name: 'Pulmonary artery' },
  { key: 'pveins', ep: 'Pulmonary Veins', name: 'Pulmonary veins' },
];

/** W[section][group]: rows in SECTIONS order, columns in GROUPS order. */
export const W = [
  [1.0, 0.322, 0.651, 0.0, 0.879, 0.423, 0.578, 0.488, 0.715, 0.802, 0.655],
  [1.0, 0.095, 0.494, 0.0, 0.599, 0.285, 0.053, 0.291, 0.484, 0.171, 0.173],
  [0.09, 0.0, 0.708, 0.006, 0.244, 0.906, 0.387, 0.326, 0.365, 0.607, 1.0],
  [0.665, 0.451, 1.0, 0.499, 0.793, 0.053, 0.162, 0.011, 0.211, 0.0, 0.158],
  [0.036, 0.018, 0.869, 0.0, 0.472, 0.88, 0.281, 0.354, 0.171, 0.213, 1.0],
  [0.268, 0.0, 0.357, 0.052, 0.429, 0.455, 0.537, 0.233, 0.719, 0.822, 1.0],
  [1.0, 0.281, 0.857, 0.0, 0.911, 0.361, 0.275, 0.465, 0.276, 0.633, 0.461],
  [0.0, 0.287, 0.013, 1.0, 0.628, 0.994, 0.753, 0.516, 0.517, 0.363, 0.151],
  [0.027, 0.0, 0.143, 0.0, 0.509, 1.0, 0.517, 0.101, 0.126, 0.834, 0.916],
  [0.095, 0.079, 0.099, 0.0, 0.247, 0.945, 1.0, 0.103, 0.432, 0.757, 0.413],
  [0.108, 0.039, 0.085, 0.0, 0.136, 0.151, 0.16, 0.127, 0.196, 1.0, 0.607],
  [0.078, 0.0, 0.014, 0.033, 0.124, 0.445, 0.193, 0.351, 0.237, 1.0, 0.449],
  [0.0, 0.009, 0.019, 0.003, 0.027, 0.153, 0.043, 0.058, 0.051, 0.266, 1.0],
  [0.016, 0.003, 0.02, 0.0, 0.288, 0.64, 0.298, 0.031, 0.084, 1.0, 0.781],
  [0.264, 0.0, 0.442, 0.162, 1.0, 0.72, 0.641, 0.355, 0.215, 0.769, 0.645],
];

/**
 * The share (0 to 1) of a section's attention weight that the view groups present carry: the
 * sum of the weights of the groups in `present` (a Set of group indexes) over the sum of all 11.
 * A teaching measure of this site, not one of EchoPrime's outputs.
 */
export function coverage(section, present) {
  const row = W[section];
  let all = 0, got = 0;
  row.forEach((w, g) => { all += w; if (present.has(g)) got += w; });
  return all > 0 ? got / all : 0;
}

/** The retrieval of the paper (Methods): the 50 most similar earlier studies for each section. */
export const K_PAPER = 50;
