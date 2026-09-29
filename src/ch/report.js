// 14 Report: one study, written up. Four simulated teaching cases; the report follows the ASE
// 2025 reporting guideline: summary statement at the top, then each structure, structure
// before function, then the measurements. Sex sets the normal ranges.
import { langGrade, lvGeometry, LANG, lvefBand, glsBand, tapseGrade, sPrimeGrade, trvGrade, rapFromIvc } from '../norms.js';
import { lapAlgorithm } from './fill.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bsa = (h, w) => Math.sqrt((h * w) / 3600);

// Simulated cases for teaching (not patient data).
const CASES = {
  normal: {
    title: 'Normal study',
    age: 45, height: 172, weight: 72, bp: '118/76', hr: 64, rhythm: 'sinus rhythm', indication: 'Heart murmur.',
    lvidd: 4.6, ivs: 0.9, pw: 0.9, lvmi: 78, edv: 105, esv: 40, gls: -20, wm: 'none',
    E: 0.75, A: 0.6, sep: 8.5, lat: 11, tr: 2.3, lavi: 26, lars: 36, sd: 1.3, ivrt: 88,
    tapse: 22, sPrime: 12, rvb: 3.6, ivcD: 1.6, ivcCollapse: true,
    av: { text: 'The aortic valve is trileaflet and normal in structure. There is no aortic stenosis or regurgitation.' },
    mv: { text: 'The mitral valve is normal in structure. Trace mitral regurgitation.' },
    trText: 'The tricuspid valve is normal in structure. Trace tricuspid regurgitation.',
    positives: [], negatives: ['No significant valve disease.'],
  },
  hfref: {
    title: 'Dilated LV with severe secondary MR',
    age: 63, height: 178, weight: 84, bp: '104/68', hr: 88, rhythm: 'sinus rhythm', indication: 'Heart failure with breathlessness on exertion.',
    lvidd: 6.6, ivs: 0.8, pw: 0.8, lvmi: 142, edv: 230, esv: 170, gls: -8, wm: 'global hypokinesis',
    E: 1.1, A: 0.4, sep: 4.0, lat: 5.5, tr: 3.2, lavi: 52, lars: 9, sd: 0.4, ivrt: 55,
    tapse: 14, sPrime: 8.5, rvb: 4.3, ivcD: 2.3, ivcCollapse: false,
    av: { text: 'The aortic valve is trileaflet and normal in structure. There is no aortic stenosis or regurgitation.' },
    mv: { text: 'The mitral leaflets are normal in structure; they are tethered by the dilated ventricle. Severe secondary mitral regurgitation: EROA 0.42 cm² (PISA), regurgitant volume 63 mL, vena contracta 0.7 cm.', severe: 'Severe secondary mitral regurgitation.' },
    trText: 'The tricuspid valve is normal in structure. Mild tricuspid regurgitation.',
    positives: [], negatives: ['No LV thrombus seen.'],
  },
  as: {
    title: 'Severe aortic stenosis',
    age: 78, height: 168, weight: 76, bp: '146/78', hr: 68, rhythm: 'sinus rhythm', indication: 'Systolic murmur and breathlessness on exertion.',
    lvidd: 4.6, ivs: 1.4, pw: 1.3, lvmi: 132, edv: 95, esv: 38, gls: -15, wm: 'none',
    E: 1.0, A: 1.1, sep: 5.0, lat: 6.5, tr: 2.9, lavi: 40, lars: 17, sd: 0.9, ivrt: 78,
    tapse: 21, sPrime: 11.5, rvb: 3.7, ivcD: 1.7, ivcCollapse: true,
    av: { text: 'The aortic valve is trileaflet and severely calcified, with restricted opening. Severe aortic stenosis: peak velocity 4.4 m/s, mean gradient 48 mmHg, aortic valve area 0.75 cm² by the continuity equation (indexed 0.40 cm²/m²), velocity ratio 0.22. Stroke volume index 38 mL/m²: normal flow. Trace aortic regurgitation.', severe: 'Severe aortic stenosis (peak velocity 4.4 m/s, mean gradient 48 mmHg, valve area 0.75 cm²).' },
    mv: { text: 'The mitral valve has mild annular calcification. Mild mitral regurgitation.' },
    trText: 'The tricuspid valve is normal in structure. Trace tricuspid regurgitation.',
    positives: [], negatives: [],
  },
  hfpef: {
    title: 'Hypertensive heart, raised filling pressure',
    age: 72, height: 160, weight: 82, bp: '152/84', hr: 72, rhythm: 'sinus rhythm', indication: 'Breathlessness on exertion.',
    lvidd: 4.4, ivs: 1.2, pw: 1.2, lvmi: 100, edv: 90, esv: 34, gls: -16.5, wm: 'none',
    E: 0.95, A: 0.8, sep: 5.5, lat: 7.0, tr: 3.0, lavi: 44, lars: 16, sd: 0.8, ivrt: 66,
    tapse: 20, sPrime: 11, rvb: 3.8, ivcD: 2.2, ivcCollapse: true,
    av: { text: 'The aortic valve is trileaflet with mild thickening. There is no aortic stenosis or regurgitation.' },
    mv: { text: 'The mitral valve is normal in structure. Trace mitral regurgitation.' },
    trText: 'The tricuspid valve is normal in structure. Mild tricuspid regurgitation.',
    positives: [], negatives: ['No significant valve disease.'],
  },
};

const NAME = { eject: 'Eject', fill: 'Fill', pressure: 'Pressure', as: 'Aortic stenosis', mr: 'Mitral regurgitation' };
const GO = (key, n) => `<a class="go" href="#${key}" data-go="${key}">${n} ${NAME[key] || key} →</a>`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const f1 = (v) => v.toFixed(1), f0 = (v) => v.toFixed(0);

export function buildReport(caseId, sex) {
  const c = CASES[caseId];
  const B = bsa(c.height, c.weight);
  const ef = Math.round(((c.edv - c.esv) / c.edv) * 100);
  const edvi = c.edv / B, esvi = c.esv / B;
  const rwt = (2 * c.pw) / c.lvidd;
  const geo = lvGeometry(c.lvmi, rwt, sex);
  const size = langGrade('edvi', edvi, sex), sizeD = langGrade('lvidd', c.lvidd, sex);
  const lvSize = [size, sizeD].includes('severely') ? 'severely' : [size, sizeD].includes('moderately') ? 'moderately' : [size, sizeD].includes('mildly') ? 'mildly' : 'normal';
  const band = lvefBand(ef, sex);
  const wallHi = langGrade('ivs', c.ivs, sex) !== 'normal' || langGrade('pw', c.pw, sex) !== 'normal';
  const avg = (c.sep + c.lat) / 2;
  const dv = { E: c.E, A: c.A, sep: c.sep, lat: c.lat, avg, ea: c.E / c.A, eeSep: (c.E * 100) / c.sep, eeLat: (c.E * 100) / c.lat, eeAvg: (c.E * 100) / avg, tr: c.tr, lavi: c.lavi, lars: c.lars, sd: c.sd, ivrt: c.ivrt };
  const lap = lapAlgorithm(dv);
  const rap = rapFromIvc(c.ivcD, c.ivcCollapse);
  const rvsp = Math.round(4 * c.tr * c.tr + rap);
  const la = langGrade('lavi', c.lavi, sex);
  const rvF = tapseGrade(c.tapse), rvS = sPrimeGrade(c.sPrime);
  const rvFun = rvF === 'normal' && rvS === 'normal' ? 'normal' : rvF === 'normal' ? rvS : rvF;
  const gls = glsBand(c.gls);
  const diaText = lap.grade === null ? 'Diastolic function: LA pressure is normal; the grade cannot be assigned.'
    : lap.grade === 0 ? 'Normal diastolic function; normal LA pressure.'
      : `Grade ${lap.grade} diastolic dysfunction; ${lap.lap === 'raised' ? 'raised' : 'normal'} LA pressure.`;
  const lvFun = band === 'normal' || band === 'hyperdynamic' ? 'normal' : band;

  // summary statement (Taub 2025: LV and RV function, significant valve disease, positives, pertinent negatives, comparison)
  const sum = [];
  sum.push(`${lvFun === 'normal' ? 'Normal' : cap(lvFun)} LV systolic function, LVEF ${ef}% (biplane). ${rvFun === 'normal' ? 'Normal RV systolic function.' : `${cap(rvFun)} RV systolic function.`}`);
  const valves = [c.av.severe, c.mv.severe].filter(Boolean);
  sum.push(valves.length ? valves.join(' ') : 'No significant valve disease.');
  if (lvSize !== 'normal') sum.push(`${cap(lvSize)} dilated left ventricle.`);
  if (geo !== 'normal geometry') sum.push(`${cap(geo)} of the left ventricle.`);
  if (lap.grade) sum.push(`Grade ${lap.grade} diastolic dysfunction with ${lap.lap} LA pressure.`);
  if (c.tr >= 2.9) sum.push(`Peak TR velocity ${f1(c.tr)} m/s; estimated RV systolic pressure ${rvsp} mmHg.`);
  for (const n of c.negatives) if (!sum.includes(n)) sum.push(n);
  sum.push('No prior study is available for comparison.');

  const rows = [
    ['LV diameter, end-diastole', `${f1(c.lvidd)} cm`, rng('lvidd', sex), langGrade('lvidd', c.lvidd, sex)],
    ['Septum, end-diastole', `${f1(c.ivs)} cm`, rng('ivs', sex), langGrade('ivs', c.ivs, sex)],
    ['Inferolateral wall, end-diastole', `${f1(c.pw)} cm`, rng('pw', sex), langGrade('pw', c.pw, sex)],
    ['Relative wall thickness', rwt.toFixed(2), '≤0.42', rwt > 0.42 ? 'increased' : 'normal'],
    ['LV mass index', `${f0(c.lvmi)} g/m²`, rng('lvmi', sex), langGrade('lvmi', c.lvmi, sex)],
    ['LV end-diastolic volume index', `${f0(edvi)} mL/m²`, rng('edvi', sex), size],
    ['LV end-systolic volume index', `${f0(esvi)} mL/m²`, rng('esvi', sex), langGrade('esvi', esvi, sex)],
    ['LVEF, biplane', `${ef}%`, sex === 'F' ? '54–74%' : '52–72%', band],
    ['Global longitudinal strain', `${String(c.gls).replace('-', '−')}%`, 'more negative than −18%', gls],
    ['LA volume index', `${f0(c.lavi)} mL/m²`, '16–34 mL/m²', la],
    ['Mitral E / A', `${c.E.toFixed(2)} / ${c.A.toFixed(2)} m/s`, '', ''],
    ['Average e′ · average E/e′', `${f1(avg)} cm/s · ${f1(dv.eeAvg)}`, '>6.5 cm/s · <14', avg <= 6.5 || dv.eeAvg >= 14 ? 'abnormal' : 'normal'],
    ['TAPSE', `${f0(c.tapse)} mm`, '>17 mm', rvF],
    ['RV S′', `${f1(c.sPrime)} cm/s`, '>9.5 cm/s', rvS],
    ['Peak TR velocity', `${f1(c.tr)} m/s`, '<2.8 m/s', trvGrade(c.tr)],
    ['RA pressure (IVC)', `${rap} mmHg`, '3 mmHg', rap > 3 ? 'raised' : 'normal'],
    ['RV systolic pressure', `${rvsp} mmHg`, '', ''],
  ];

  const html = `
    <div class="sheet">
      <h2>Transthoracic echocardiogram</h2>
      <p class="note">Simulated teaching case: ${esc(c.title)}. Not a patient record.</p>
      <div class="meta">
        <div><span>Age · sex</span>${c.age} · ${sex === 'F' ? 'female' : 'male'}</div>
        <div><span>Height · weight</span>${c.height} cm · ${c.weight} kg</div>
        <div><span>Body surface area</span>${B.toFixed(2)} m²</div>
        <div><span>Blood pressure</span>${c.bp} mmHg</div>
        <div><span>Heart rate · rhythm</span>${c.hr}/min · ${c.rhythm}</div>
        <div><span>Indication</span>${esc(c.indication)}</div>
        <div><span>Protocol · priority</span>Comprehensive · routine</div>
        <div><span>Image quality</span>Good; all windows obtained</div>
      </div>
      <h3>Summary statement</h3>
      <ol class="impression">${sum.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <h3>Findings</h3>
      <div class="finding"><p><b>Left ventricle.</b> ${lvSize === 'normal' ? 'Normal size' : `${cap(lvSize)} dilated`} (LV diameter ${f1(c.lvidd)} cm; end-diastolic volume index ${f0(edvi)} mL/m²). ${wallHi ? 'Wall thickness is increased' : 'Wall thickness is normal'} (septum ${f1(c.ivs)} cm, inferolateral wall ${f1(c.pw)} cm); ${geo}. ${lvFun === 'normal' ? 'Normal' : cap(lvFun)} systolic function: LVEF ${ef}% by the biplane method of disks; global longitudinal strain ${String(c.gls).replace('-', '−')}% (${gls}). ${c.wm === 'none' ? 'No regional wall motion abnormality.' : `${cap(c.wm)}.`} ${diaText}</p>${GO('eject', '09')}</div>
      <div class="finding"><p><b>Right ventricle.</b> ${langRV(c.rvb)} RV systolic function is ${rvFun} (TAPSE ${f0(c.tapse)} mm, S′ ${f1(c.sPrime)} cm/s).</p>${GO('eject', '09')}</div>
      <div class="finding"><p><b>Left atrium.</b> ${la === 'normal' ? 'Normal size' : `${cap(la)} dilated`} (LA volume index ${f0(c.lavi)} mL/m²).</p>${GO('fill', '11')}</div>
      <div class="finding"><p><b>Right atrium.</b> Normal size.</p><span></span></div>
      <div class="finding"><p><b>Aortic valve.</b> ${esc(c.av.text)}</p>${GO('as', '12')}</div>
      <div class="finding"><p><b>Mitral valve.</b> ${esc(c.mv.text)}</p>${GO('mr', '14')}</div>
      <div class="finding"><p><b>Tricuspid valve.</b> ${esc(c.trText)} Peak TR velocity ${f1(c.tr)} m/s; estimated RV systolic pressure ${rvsp} mmHg.</p>${GO('pressure', '08')}</div>
      <div class="finding"><p><b>Pulmonic valve.</b> Normal in structure. Trace pulmonic regurgitation.</p><span></span></div>
      <div class="finding"><p><b>Aorta.</b> The aortic root and proximal ascending aorta are normal in size.</p><span></span></div>
      <div class="finding"><p><b>Inferior vena cava.</b> ${f1(c.ivcD)} cm; collapses ${c.ivcCollapse ? 'more' : 'less'} than 50% with a sniff. Estimated RA pressure ${rap} mmHg.</p>${GO('pressure', '08')}</div>
      <div class="finding"><p><b>Pericardium.</b> No pericardial effusion.</p><span></span></div>
      <h3>Measurements</h3>
      <div class="table-wrap"><table class="vt"><thead><tr><th>Measurement</th><th class="num">Value</th><th>Normal (${sex === 'F' ? 'women' : 'men'})</th><th>Grade</th></tr></thead>
        <tbody>${rows.map(([k, v, n, g]) => `<tr class="${g && !/^normal|^$/.test(g) ? 'hit' : ''}"><td>${k}</td><td class="num">${v}</td><td>${n}</td><td>${g === 'below' ? 'below range' : g}</td></tr>`).join('')}</tbody></table></div>
      <p class="sign">Report status: draft. Interpreting physician: trainee exercise. Critical findings: none.</p>
    </div>`;
  return { html, ef, band, lap, rvsp, rap, geo, lvSize, B, c, sum, rows };
}

function rng(key, sex) {
  const [lo, hi] = LANG[key][sex];
  const d = LANG[key].unit === 'cm' ? 1 : 0;
  return `${lo.toFixed(d)}–${hi.toFixed(d)} ${LANG[key].unit}`;
}
function langRV(rvb) {
  // Mukherjee 2025 Table 1: RV basal diameter <4.1 cm normal; 4.1-4.4 mild; >4.4-4.9 moderate; >4.9 severe
  const g = rvb < 4.1 ? 'Normal size' : rvb <= 4.4 ? 'Mildly dilated' : rvb <= 4.9 ? 'Moderately dilated' : 'Severely dilated';
  return `${g} (basal diameter ${rvb.toFixed(1)} cm).`;
}

let host = null;

export default {
  key: 'report',
  part: 'report',
  title: 'Report',
  dwell: 14,
  defaults: { caseId: 'normal', sex: 'M' },
  watch: ['caseId', 'sex'],
  figure(fig) { host = fig.querySelector('#report-host'); return null; },
  init() { host = document.getElementById('report-host'); },
  tourEnter(set) { set({ caseId: 'normal', sex: 'M' }); },
  tourTick(tt, set) { set({ caseId: tt < 3.5 ? 'normal' : tt < 7 ? 'hfref' : tt < 10.5 ? 'as' : 'hfpef' }); },
  text(s, { cite }) {
    const R = buildReport(s.caseId, s.sex);
    return {
      readouts: [
        { k: 'LVEF', v: String(R.ef), u: '%', flag: R.band !== 'normal' && R.band !== 'hyperdynamic' },
        { k: 'Diastolic function', v: R.lap.grade === null ? 'normal LAP' : R.lap.grade === 0 ? 'normal' : `grade ${R.lap.grade}`, text: true, flag: !!R.lap.grade && R.lap.grade > 1 },
        { k: 'RV systolic pressure', v: String(R.rvsp), u: 'mmHg', flag: R.c.tr >= 2.8 },
      ],
      live: `The summary statement sits at the top and answers the indication: <i>${esc(R.c.indication)}</i> Structure comes before function under each heading, and every number is called normal or abnormal against the ${s.sex === 'F' ? 'women’s' : 'men’s'} range${cite('taub2025,lang2015')}.`,
      extra: (art) => {
        if (host) host.innerHTML = R.html;
        const tb = art.querySelector('#report-inputs tbody');
        if (tb) {
          const link = (key, n) => `<a href="#${key}" data-go="${key}">${n}</a>`;
          tb.innerHTML = [
            ['LVEF (biplane)', `${R.ef}%`, link('eject', '09 Eject')],
            ['LV geometry', R.geo, link('eject', '09 Eject')],
            ['Diastolic grade', R.lap.grade === null ? 'normal LAP' : R.lap.grade === 0 ? 'normal' : `grade ${R.lap.grade}`, link('fill', '11 Fill')],
            ['RA pressure', `${R.rap} mmHg`, link('pressure', '08 Pressure')],
            ['RV systolic pressure', `${R.rvsp} mmHg`, link('pressure', '08 Pressure')],
          ].map(([a, b, c]) => `<tr><td>${a}</td><td class="num">${b}</td><td>${c}</td></tr>`).join('');
        }
      },
    };
  },
};
