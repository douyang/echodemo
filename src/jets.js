// The color Doppler format of the valve pages (chapters 12 to 16).
//   'plume': each jet from a model of its flow (echo2d.js jet()): flow convergence (PISA) upstream
//     of the orifice and a flame-shaped jet downstream, at the page's aliasing velocity, over the
//     grey image. Jets only.
//   'scanner': the image a scanner makes from all the flow (cflow.js): the pulse-pair estimate on
//     beam lines, normal flow through the beat, jets at 60 cm/s and, on the MR and TR pages, a
//     Jet/PISA switch (zoom, baseline shift). Kept for later use.
export const JETS = 'plume';
