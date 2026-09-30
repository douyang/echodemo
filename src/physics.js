// Physical constants of the models, from one textbook table (iaea2014, Table 12.1) so the
// values agree with each other. Soft tissue has no single value; these are the table's entries.
export const PHYS = {
  c: 1540,        // m/s, the speed of sound every scanner assumes in soft tissue
  alpha: 0.5,     // dB/cm/MHz, soft-tissue average; used for time gain compensation
  z: {            // MRayl, acoustic impedance
    air: 0.0004,
    fat: 1.38,
    blood: 1.61,
    muscle: 1.70,
  },
  att: {          // dB/cm at 1 MHz; loss rises about in proportion to frequency
    air: 12,
    fat: 0.52,
    blood: 0.17,
    muscle: 1.2,
  },
};
