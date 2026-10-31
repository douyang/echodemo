// The text for YouTube of each chapter video, in video/out/youtube/, next to the videos that
// tools/render-video.mjs makes (git ignores video/out):
//   <key>.txt   the title, the description and the tags. The description links to the chapter's
//               address on the site and lists the video's chapters (timestamps).
//   <key>.srt   the captions of the video as subtitles. Only mteer-vo has a voice, so the
//               subtitles give YouTube and search engines the words on screen.
//   index.md    each video, the file to upload and its text
// views is the video of Views (cut B of the views video, video/cuts.js); tteer-reel is the T-TEER
// reel (video/shorts/tteer), which has a voice and no subtitle file.
//   node tools/youtube.mjs [--ch=all|tteer,as] [--base=http://127.0.0.1:8790]
// Serve the repository root first (python3 -m http.server 8790), as for the render. The tool
// reads each chapter video's captions from its page (window.__video.ready), which builds them from
// the chapter's own text; it draws no frames. YouTube shows chapters only when the first starts at
// 0:00, there are three or more, and each is 10 s or longer, so a shorter step joins the one before.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYS, VIDEOS } from '../video/chapters.js';
import { CUTS } from '../video/cuts.js';
import { layout, windowsOf } from '../video/timeline.js';
import { VIEWS, WINDOWS } from '../src/views.js';
import { PAGES, SITE, NAME, AUTHOR } from '../src/pages.js';
import { launch, openChapter } from './video-page.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'video', 'out', 'youtube');
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const base = arg('base', 'http://127.0.0.1:8790');
const ALL = ['views', ...KEYS, 'tteer-reel'];
const list = arg('ch', 'all');
const keys = list === 'all' ? ALL : list.split(',').map((k) => k.trim().toLowerCase());
for (const k of keys) if (!ALL.includes(k)) throw new Error(`no video ${k} (video/chapters.js)`);

// the titles that the chapter's name and kicker do not give well
const TITLES = {
  pulse: 'How echocardiography works: the pulse-echo principle',
  image: 'Ultrasound image formation and artifacts in echocardiography',
  shift: 'The Doppler effect in echocardiography',
  windows: 'The standard transthoracic echocardiography views',
  cycle: 'The cardiac cycle on echocardiography',
  loop: 'LV pressure–volume loops and echocardiography',
  strain: 'Strain echocardiography: global longitudinal strain by speckle tracking',
  ai: 'AI interpretation and measurement of echocardiograms',
  tee: 'TEE: the probe, its movements and the standard views',
  tavr: 'TAVR step by step: what TEE shows at each step',
  mteer: 'M-TEER step by step: what TEE shows at each step',
  tteer: 'T-TEER step by step: what TEE shows at each step',
  rv: 'The right ventricle on echocardiography: size, function and overload',
  amyloid: 'Cardiac amyloidosis: the echocardiographic signs',
  shunts: 'Shunts on echocardiography: ASD, VSD and PFO',
};
/** The chapter's name on echocardiography, and its kicker when the two fit in 70 characters. */
function titleOf(key) {
  const p = PAGES[key];
  if (TITLES[key]) return TITLES[key];
  const lead = /echocardiograph/i.test(p.name) ? p.name : `${p.name} on echocardiography`;
  const k = p.kicker.replace(/^[A-Z][a-z]+\b/, (w) => w.toLowerCase());
  return k && !k.includes(':') && `${lead}: ${k}`.length <= 70 ? `${lead}: ${k}` : lead;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const mmss = (t) => `${Math.floor(t / 60)}:${pad(Math.floor(t % 60))}`;
function srtTime(t) {
  const ms = Math.round(t * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
const srt = (cues) => cues.map((c, i) => `${i + 1}\n${srtTime(c.t0)} --> ${srtTime(c.t1)}\n${c.text}\n`).join('\n');

/**
 * YouTube's chapters from the start (s) and the name of each step: whole seconds, 0:00 first,
 * each 10 s or longer (a shorter step joins the one before), three or more, else none.
 */
function chaptersOf(starts, names, duration) {
  const g = [];
  starts.forEach((t, i) => {
    const s = i ? Math.floor(t) : 0;
    if (!g.length || s - g[g.length - 1].s >= 10) g.push({ s, names: [names[i]] });
    else g[g.length - 1].names.push(names[i]);
  });
  if (g.length > 1 && duration - g[g.length - 1].s < 10) g[g.length - 2].names.push(...g.pop().names);
  return g.length >= 3 ? g.map((c) => `${mmss(c.s)} ${c.names.join(' · ')}`) : [];
}

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
/** The chapter's dek (the paragraph under its title) as plain text, else its description. */
function dekOf(key) {
  const a = HTML.match(new RegExp(`<article class="chapter[^"]*" id="ch-${key}"[^>]*>([\\s\\S]*?)</article>`))?.[1] ?? '';
  const d = a.match(/<p class="dek"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (!d) return PAGES[key].description;
  return d.replace(/<span class="cite"[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENT[e]).replace(/\s+/g, ' ').trim();
}
const by = `${AUTHOR.name}${AUTHOR.suffix ? `, ${AUTHOR.suffix}` : ''}`;
/** The description: the chapter's dek, its address, the chapters, the site. */
function describe(key, chapters, notes = []) {
  const p = PAGES[key];
  return [
    dekOf(key), '',
    `The interactive chapter, with its sources: ${p.url}`, '',
    ...(chapters.length ? [...chapters, ''] : []),
    ...(notes.length ? [...notes, ''] : []),
    `${NAME}: an interactive guide to echocardiography by ${by}. ${SITE}`, '',
    '#echocardiography #cardiology #medicaleducation',
  ].join('\n');
}
/** The tags: the chapter's name, its kicker when it is short, the field and the site. */
const tagsOf = (key) => {
  const { name, kicker } = PAGES[key];
  return [name, ...(kicker && kicker.length <= 40 && !kicker.includes(':') ? [kicker] : []), 'echocardiography', 'echo', 'cardiac ultrasound', 'cardiology', 'medical education', NAME];
};
/** The first file of these that exists, else the first. */
const fileOf = (...f) => f.find((x) => fs.existsSync(path.join(ROOT, x))) ?? f[0];

/** The video of Views: cut B of the views video, its chapters by window and a subtitle for each view. */
function views() {
  const L = layout(CUTS.B);
  const holds = L.segs.filter((s) => s.kind === 'hold'), end = L.segs.find((s) => s.kind === 'end').t0;
  const wins = windowsOf(CUTS.B, L);
  const winName = (w) => {
    const n = WINDOWS.find((x) => x.key === w.win).name;
    return /^Parasternal/.test(n) ? `${n} axis` : `${n} ${w.views.length > 1 ? 'views' : 'view'}`;
  };
  return {
    key: 'views', ch: 'windows', duration: L.duration,
    chapters: chaptersOf(wins.map((w) => w.t0), wins.map(winName), L.duration),
    cues: holds.map((s, i) => ({ t0: s.t0, t1: holds[i + 1]?.t0 ?? end, text: VIEWS[s.view].name })),
    file: 'video/out/echo-views-B.mp4',
  };
}

/** A chapter video: its captions from the page, a subtitle for each step (or each spoken line). */
async function chapter(key, browser) {
  const v = VIDEOS[key], ch = v.chapters?.[0] ?? key;
  const page = await openChapter({ ch: key, base, browser });
  const { caps, segs, duration } = page.info;
  const errors = page.errors;
  await page.close();
  if (errors.length) throw new Error(`chapter video ${key}: ${errors.join('; ')}`);
  const holds = segs.filter((s) => s.kind === 'hold'), end = segs.find((s) => s.kind === 'end').t0;
  // the caption changes in the middle of the move into a step (video/chapter.js, updateCaption)
  const change = (k) => { const m = segs.find((s) => s.kind === 'move' && s.to === k); return (m.t0 + m.t1) / 2; };
  let cues;
  if (v.vo) {
    const at = (x, t0, what) => { if (typeof x.at !== 'number' || typeof x.dur !== 'number') throw new Error(`${key}: no time for ${what}`); return { t0: t0 + x.at, t1: t0 + x.at + x.dur, text: x.text }; };
    cues = [at(v.vo.title, 0, 'the title'), ...v.steps.flatMap((st, k) => st.vo.lines.map((ln, j) => at(ln, holds[k].t0, `line ${j} of step ${k}`)))];
  } else {
    cues = caps.map((c, k) => ({ t0: k ? change(k) : holds[0].t0, t1: k < caps.length - 1 ? change(k + 1) : end, text: `${c.name}\n${c.line}` }));
  }
  return {
    key, ch, duration, vo: !!v.vo,
    chapters: chaptersOf(caps.map((_, k) => (k ? change(k) : 0)), caps.map((c) => c.name), duration),
    cues,
    file: fileOf(`video/out/chapter-${key}.mp4`, `video/renders/chapter-${key}.mp4`),
  };
}

fs.mkdirSync(OUT, { recursive: true });
const browser = keys.some((k) => VIDEOS[k]) ? await launch() : null;
const rows = [];
for (const key of keys) {
  let d;
  if (key === 'views') d = views();
  else if (key === 'tteer-reel') d = { key, ch: 'tteer', chapters: [], cues: null, file: fileOf('video/out/shorts/tteer/out/tteer-voice.mp4', 'video/renders/tteer-voice.mp4'), reel: true };
  else d = await chapter(key, browser);
  const title = d.reel ? 'T-TEER: the tricuspid repair on TEE, step by step' : `${titleOf(d.ch)}${d.vo ? ' (narrated)' : ''}`;
  if (title.length > 100) throw new Error(`${key}: the title is longer than 100 characters`);
  const desc = describe(d.ch, d.chapters, d.vo || d.reel ? ['The voice is synthetic (ElevenLabs).'] : []);
  const tags = tagsOf(d.ch);
  fs.writeFileSync(path.join(OUT, `${key}.txt`), `TITLE\n${title}\n\nDESCRIPTION\n${desc}\n\nTAGS\n${tags.join(', ')}\n`);
  if (d.cues) fs.writeFileSync(path.join(OUT, `${key}.srt`), srt(d.cues));
  const have = fs.existsSync(path.join(ROOT, d.file));
  rows.push(`| ${key} | ${title} | \`${d.file}\`${have ? '' : ' (not rendered)'} | ${d.duration ? mmss(d.duration) : ''} | ${d.chapters.length || ''} | ${d.cues ? `${key}.srt` : ''} |`);
  console.log(`${key.padEnd(12)} ${have ? 'video' : 'no video'}  ${d.chapters.length} chapters  ${d.cues ? d.cues.length : 0} subtitles  ${title}`);
}
if (browser) await browser.close();
if (list === 'all') {
  fs.writeFileSync(path.join(OUT, 'index.md'), [
    '# The chapter videos for YouTube', '',
    'Each video\'s title, description and tags are in `<key>.txt`; its subtitles are in `<key>.srt` (YouTube Studio: Subtitles, Upload file, With timing). Written by `node tools/youtube.mjs`.', '',
    '| Key | Title | File | Length | Chapters | Subtitles |', '|---|---|---|---|---|---|', ...rows, '',
  ].join('\n'));
}
console.log(`wrote ${keys.length} videos' text to ${path.relative(ROOT, OUT)}`);
