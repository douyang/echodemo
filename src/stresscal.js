// The LV volumes of the stress echocardiography cases (ch/stress.js), measured on the heart mesh
// as the chapter measures them: the LV traced on the four- and two-chamber views at end-diastole
// and at end-systole (meshtrace.js), and the biplane method of disks. By heart (pheno.js), case
// and stage: the end-diastolic and end-systolic volumes (mL) and the LVEF (%). The cuts take
// seconds on the page, so the chapter reads them here. Written by tools/stress-volumes.mjs;
// `node tools/stress-volumes.mjs --check` measures them again and fails when they differ.
export const STRESS_VOLUMES = {
  normal: {
    normal: {
      rest: { edv: 107.264, esv: 40.087, ef: 62.628 },
      low: { edv: 101.902, esv: 31.545, ef: 69.044 },
      peak: { edv: 96.401, esv: 24.141, ef: 74.958 },
      rec: { edv: 103.033, esv: 34.93, ef: 66.098 },
    },
    lad: {
      rest: { edv: 107.264, esv: 40.087, ef: 62.628 },
      low: { edv: 101.902, esv: 31.545, ef: 69.044 },
      peak: { edv: 96.401, esv: 34.154, ef: 64.571 },
      rec: { edv: 103.033, esv: 37.562, ef: 63.543 },
    },
    rca: {
      rest: { edv: 107.264, esv: 40.087, ef: 62.628 },
      low: { edv: 101.902, esv: 31.545, ef: 69.044 },
      peak: { edv: 96.401, esv: 41.084, ef: 57.382 },
      rec: { edv: 103.033, esv: 37.899, ef: 63.216 },
    },
    lcx: {
      rest: { edv: 107.264, esv: 40.087, ef: 62.628 },
      low: { edv: 101.902, esv: 31.545, ef: 69.044 },
      peak: { edv: 96.401, esv: 34.334, ef: 64.384 },
      rec: { edv: 103.033, esv: 38.628, ef: 62.509 },
    },
    multi: {
      rest: { edv: 107.264, esv: 40.087, ef: 62.628 },
      low: { edv: 101.902, esv: 33.503, ef: 67.122 },
      peak: { edv: 99.667, esv: 47.043, ef: 52.8 },
      rec: { edv: 104.165, esv: 39.73, ef: 61.858 },
    },
    scar: {
      rest: { edv: 107.264, esv: 50.652, ef: 52.779 },
      low: { edv: 101.902, esv: 42.921, ef: 57.88 },
      peak: { edv: 96.401, esv: 38.572, ef: 59.988 },
      rec: { edv: 103.033, esv: 45.464, ef: 55.874 },
    },
    viable: {
      rest: { edv: 107.264, esv: 71.462, ef: 33.378 },
      low: { edv: 101.902, esv: 59.147, ef: 41.956 },
      peak: { edv: 98.58, esv: 59.742, ef: 39.397 },
      rec: { edv: 104.165, esv: 67.877, ef: 34.837 },
    },
  },
  amyloid: {
    normal: {
      rest: { edv: 69.725, esv: 32.135, ef: 53.912 },
      low: { edv: 66.173, esv: 26.106, ef: 60.549 },
      peak: { edv: 62.479, esv: 22.036, ef: 64.731 },
      rec: { edv: 66.863, esv: 27.383, ef: 59.046 },
    },
    lad: {
      rest: { edv: 69.725, esv: 32.135, ef: 53.912 },
      low: { edv: 66.173, esv: 26.106, ef: 60.549 },
      peak: { edv: 62.479, esv: 26.441, ef: 57.68 },
      rec: { edv: 66.863, esv: 28.344, ef: 57.609 },
    },
    rca: {
      rest: { edv: 69.725, esv: 32.135, ef: 53.912 },
      low: { edv: 66.173, esv: 26.106, ef: 60.549 },
      peak: { edv: 62.479, esv: 32.9, ef: 47.342 },
      rec: { edv: 66.863, esv: 31.285, ef: 53.21 },
    },
    lcx: {
      rest: { edv: 69.725, esv: 32.135, ef: 53.912 },
      low: { edv: 66.173, esv: 26.106, ef: 60.549 },
      peak: { edv: 62.479, esv: 28.134, ef: 54.971 },
      rec: { edv: 66.863, esv: 30.403, ef: 54.53 },
    },
    multi: {
      rest: { edv: 69.725, esv: 32.135, ef: 53.912 },
      low: { edv: 66.173, esv: 26.876, ef: 59.384 },
      peak: { edv: 64.502, esv: 35.081, ef: 45.613 },
      rec: { edv: 67.559, esv: 32.459, ef: 51.955 },
    },
    scar: {
      rest: { edv: 69.725, esv: 37.348, ef: 46.435 },
      low: { edv: 66.173, esv: 31.493, ef: 52.407 },
      peak: { edv: 62.479, esv: 27.727, ef: 55.622 },
      rec: { edv: 66.863, esv: 32.443, ef: 51.478 },
    },
    viable: {
      rest: { edv: 69.725, esv: 52.081, ef: 25.304 },
      low: { edv: 66.173, esv: 44.054, ef: 33.426 },
      peak: { edv: 63.819, esv: 44.685, ef: 29.983 },
      rec: { edv: 67.559, esv: 50.027, ef: 25.951 },
    },
  },
  icm: {
    normal: {
      rest: { edv: 219.94, esv: 106.665, ef: 51.503 },
      low: { edv: 208.849, esv: 86.837, ef: 58.421 },
      peak: { edv: 197.792, esv: 72.965, ef: 63.11 },
      rec: { edv: 211.1, esv: 94.16, ef: 55.395 },
    },
    lad: {
      rest: { edv: 219.94, esv: 106.665, ef: 51.503 },
      low: { edv: 208.849, esv: 86.837, ef: 58.421 },
      peak: { edv: 197.792, esv: 94.412, ef: 52.267 },
      rec: { edv: 211.1, esv: 102.334, ef: 51.523 },
    },
    rca: {
      rest: { edv: 219.94, esv: 106.665, ef: 51.503 },
      low: { edv: 208.849, esv: 86.837, ef: 58.421 },
      peak: { edv: 197.792, esv: 103.105, ef: 47.872 },
      rec: { edv: 211.1, esv: 101.401, ef: 51.965 },
    },
    lcx: {
      rest: { edv: 219.94, esv: 106.665, ef: 51.503 },
      low: { edv: 208.849, esv: 86.837, ef: 58.421 },
      peak: { edv: 197.792, esv: 90.46, ef: 54.265 },
      rec: { edv: 211.1, esv: 101.412, ef: 51.96 },
    },
    multi: {
      rest: { edv: 219.94, esv: 106.665, ef: 51.503 },
      low: { edv: 208.849, esv: 91.987, ef: 55.955 },
      peak: { edv: 204.393, esv: 115.904, ef: 43.293 },
      rec: { edv: 213.069, esv: 106.846, ef: 49.854 },
    },
    scar: {
      rest: { edv: 219.94, esv: 127.073, ef: 42.224 },
      low: { edv: 208.849, esv: 109.341, ef: 47.646 },
      peak: { edv: 197.792, esv: 103.159, ef: 47.845 },
      rec: { edv: 211.1, esv: 115.443, ef: 45.313 },
    },
    viable: {
      rest: { edv: 219.94, esv: 164.804, ef: 25.069 },
      low: { edv: 208.849, esv: 141.808, ef: 32.1 },
      peak: { edv: 202.188, esv: 141.518, ef: 30.007 },
      rec: { edv: 213.069, esv: 157.45, ef: 26.104 },
    },
  },
  barlow: {
    normal: {
      rest: { edv: 182.349, esv: 60.055, ef: 67.066 },
      low: { edv: 172.804, esv: 50.87, ef: 70.562 },
      peak: { edv: 163.744, esv: 46.992, ef: 71.301 },
      rec: { edv: 174.659, esv: 50.901, ef: 70.857 },
    },
    lad: {
      rest: { edv: 182.349, esv: 60.055, ef: 67.066 },
      low: { edv: 172.804, esv: 50.87, ef: 70.562 },
      peak: { edv: 163.744, esv: 69.815, ef: 57.363 },
      rec: { edv: 174.659, esv: 57.851, ef: 66.878 },
    },
    rca: {
      rest: { edv: 182.349, esv: 60.055, ef: 67.066 },
      low: { edv: 172.804, esv: 50.87, ef: 70.562 },
      peak: { edv: 163.744, esv: 69.33, ef: 57.66 },
      rec: { edv: 174.659, esv: 55.105, ef: 68.45 },
    },
    lcx: {
      rest: { edv: 182.349, esv: 60.055, ef: 67.066 },
      low: { edv: 172.804, esv: 50.87, ef: 70.562 },
      peak: { edv: 163.744, esv: 59.883, ef: 63.429 },
      rec: { edv: 174.659, esv: 55.465, ef: 68.244 },
    },
    multi: {
      rest: { edv: 182.349, esv: 60.055, ef: 67.066 },
      low: { edv: 172.804, esv: 54.105, ef: 68.69 },
      peak: { edv: 169.174, esv: 79.336, ef: 53.104 },
      rec: { edv: 176.558, esv: 60.098, ef: 65.961 },
    },
    scar: {
      rest: { edv: 182.349, esv: 85.386, ef: 53.174 },
      low: { edv: 172.804, esv: 77.817, ef: 54.968 },
      peak: { edv: 163.744, esv: 79.359, ef: 51.535 },
      rec: { edv: 174.659, esv: 78.782, ef: 54.894 },
    },
    viable: {
      rest: { edv: 182.349, esv: 116.447, ef: 36.141 },
      low: { edv: 172.804, esv: 94.069, ef: 45.563 },
      peak: { edv: 167.374, esv: 98.187, ef: 41.337 },
      rec: { edv: 176.558, esv: 111.017, ef: 37.122 },
    },
  },
  bav: {
    normal: {
      rest: { edv: 85.8, esv: 31.74, ef: 63.008 },
      low: { edv: 81.249, esv: 23.07, ef: 71.606 },
      peak: { edv: 76.895, esv: 19.179, ef: 75.058 },
      rec: { edv: 82.133, esv: 25.856, ef: 68.52 },
    },
    lad: {
      rest: { edv: 85.8, esv: 31.74, ef: 63.008 },
      low: { edv: 81.249, esv: 23.07, ef: 71.606 },
      peak: { edv: 76.895, esv: 25.663, ef: 66.627 },
      rec: { edv: 82.133, esv: 27.336, ef: 66.717 },
    },
    rca: {
      rest: { edv: 85.8, esv: 31.74, ef: 63.008 },
      low: { edv: 81.249, esv: 23.07, ef: 71.606 },
      peak: { edv: 76.895, esv: 32.033, ef: 58.341 },
      rec: { edv: 82.133, esv: 29.708, ef: 63.83 },
    },
    lcx: {
      rest: { edv: 85.8, esv: 31.74, ef: 63.008 },
      low: { edv: 81.249, esv: 23.07, ef: 71.606 },
      peak: { edv: 76.895, esv: 26.705, ef: 65.271 },
      rec: { edv: 82.133, esv: 29.514, ef: 64.065 },
    },
    multi: {
      rest: { edv: 85.8, esv: 31.74, ef: 63.008 },
      low: { edv: 81.249, esv: 24.105, ef: 70.331 },
      peak: { edv: 79.496, esv: 36.341, ef: 54.286 },
      rec: { edv: 83.023, esv: 30.602, ef: 63.141 },
    },
    scar: {
      rest: { edv: 85.8, esv: 39.342, ef: 54.147 },
      low: { edv: 81.249, esv: 31.273, ef: 61.51 },
      peak: { edv: 76.895, esv: 28.253, ef: 63.258 },
      rec: { edv: 82.133, esv: 33.908, ef: 58.716 },
    },
    viable: {
      rest: { edv: 85.8, esv: 55.494, ef: 35.322 },
      low: { edv: 81.249, esv: 45.605, ef: 43.87 },
      peak: { edv: 78.622, esv: 46.605, ef: 40.723 },
      rec: { edv: 83.023, esv: 52.828, ef: 36.369 },
    },
  },
};
