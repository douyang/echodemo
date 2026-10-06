// Calibration of chapter Complications of myocardial infarction (src/ch/mi.js), measured on the
// heart mesh for each heart the header can show.
//
// The true aneurysm (dx_miAneu, gl/mimesh.js): its mouth and its largest width parallel to the
// mouth (cm), as aneurysmCalipers measures them on the apical four-chamber view at end-diastole,
// for the weights 0, 0.1, ... 1. The chapter sets the weight in those steps, so the page prints
// the width that the calipers measure on the image.
export const ANEU = {
  normal: [[3.977, 3.977], [3.985, 3.985], [3.993, 3.993], [4.002, 4.002], [4.011, 4.011], [4.020, 4.020], [4.030, 4.031], [4.040, 4.115], [4.050, 4.232], [4.060, 4.352], [4.071, 4.472]],
  amyloid: [[3.210, 3.210], [3.212, 3.212], [3.215, 3.215], [3.218, 3.218], [3.221, 3.221], [3.225, 3.225], [3.228, 3.228], [3.232, 3.280], [3.236, 3.385], [3.239, 3.497], [3.244, 3.610]],
  icm: [[5.385, 5.385], [5.415, 5.415], [5.445, 5.445], [5.477, 5.477], [5.510, 5.510], [5.545, 5.545], [5.580, 5.616], [5.617, 5.696], [5.655, 5.800], [5.695, 5.922], [5.736, 6.047]],
  barlow: [[4.903, 4.903], [4.922, 4.922], [4.941, 4.941], [4.960, 4.960], [4.980, 4.980], [5.000, 5.000], [5.020, 5.031], [5.041, 5.114], [5.063, 5.222], [5.084, 5.342], [5.107, 5.462]],
  bav: [[3.554, 3.554], [3.561, 3.561], [3.568, 3.568], [3.575, 3.575], [3.582, 3.582], [3.590, 3.590], [3.598, 3.598], [3.606, 3.654], [3.614, 3.766], [3.623, 3.882], [3.632, 3.999]],
};
