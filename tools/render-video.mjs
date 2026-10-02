// Render a cut of the "Echo views" video (video/index.html), or a chapter video
// (video/chapter.html), to MP4, or to still frames.
//   node tools/render-video.mjs --cut=A [--base=http://127.0.0.1:8790] [--out=video/out]
//        [--jobs=2]                      render in parallel segments, then join them
//        [--from=0] [--to=12.5]          render part of the cut (seconds)
//        [--stills=3.2,14,40.5]          write PNG stills at these times instead of a video
//        [--audio=video/out/echo-views-A.wav]   mux this soundtrack (tools/score/pulse.py); a
//                                        part of the cut takes the same part of the soundtrack
//        [--theme=light|dark]            the other palette, for a trial
//   node tools/render-video.mjs --ch=as [--audio=video/out/chapter-as.wav] [--stills=...]
//   node tools/render-video.mjs --ch=all --jobs=3 --audio=auto    every chapter video, 3 at a time
//        A chapter video renders in order in one job (its frames depend on the frames before:
//        video/chapter.js); --jobs runs that many chapters at once. --audio=auto takes
//        video/out/chapter-<key>.wav (tools/score/pulse.py <key>).
//   node tools/render-video.mjs --reel --jobs=3 --audio=auto    the intro (video/reel.js)
//        Each clip renders in order in one job, --jobs clips at once. The tool joins the clips in
//        order into video/out/intro.mp4, with video/out/intro.wav (tools/score/pulse.py intro).
//        [--clips=0,3] renders only those clips. [--stills=4.8,30] writes PNG stills at those times.
// Serve the repository root first: python3 -m http.server 8790
//
// Chromium steps window.__video.frame(i) and captures the frame over CDP; ffmpeg encodes the
// JPEGs with libx264 (CRF 16, BT.709); the soundtrack goes in as AAC 256 kb/s with ffmpeg's fast
// rate loop (its default loop took the opening heartbeat past full scale at 160-224 kb/s). Every
// frame is a function of its time alone (video/app.js), so a segment needs no run-up: it draws
// two frames first only to compile the shaders, and parallel segments join without a seam.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { CUTS } from '../video/cuts.js';
import { VIDEOS, KEYS } from '../video/chapters.js';
import { FPS, layout } from '../video/timeline.js';
import { openCut, openChapter, openReel } from './video-page.mjs';
import { reelLayout } from '../video/reel.js';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const cut = arg('cut', 'A').toUpperCase();
const base = arg('base', 'http://127.0.0.1:8790');
const out = arg('out', 'video/out');
const stills = arg('stills', '');
const audio = arg('audio', '');
const theme = arg('theme', '');
const jobs = Math.max(1, Number(arg('jobs', '1')));
const worker = arg('segment', '');   // internal: frames a:b into this file
const ch = arg('ch', '');
const reel = process.argv.includes('--reel');
fs.mkdirSync(out, { recursive: true });

// the JPEGs are full-range BT.601; the video is limited-range BT.709
const ENCODE = ['-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];

const run = (cmd, args) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
});

/** Frames [a, b) into an MP4 with no audio. */
async function segment(a, b, file, label = '', open = () => openCut({ cut, base, theme })) {
  const { capture, frame, errors, close } = await open();
  for (let i = Math.max(0, a - 2); i < a; i++) await frame(i);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'mjpeg', '-i', '-', ...ENCODE, file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  const t0 = Date.now();
  for (let i = a; i < b; i++) {
    await frame(i);
    const buf = await capture();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - a) % 30 === 0 && i > a) {   // every 30 frames: often enough to follow a long render
      const el = (Date.now() - t0) / 1000, n = i - a;
      console.log(`${label}frame ${i}/${b} · ${(el / n).toFixed(2)} s/frame · eta ${(((b - i) * el) / n / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await done;
  await close();
  const sec = (Date.now() - t0) / 1000;
  console.log(`${label}${path.basename(file)}: ${b - a} frames in ${(sec / 60).toFixed(1)} min (${(sec / Math.max(1, b - a)).toFixed(2)} s/frame)`);
  if (errors.length) console.log(errors.join('\n'));
  return errors;
}

if (ch) {
  await chapters(ch);
  process.exit(0);
}
if (reel) {
  await intro();
  process.exit(0);
}
if (!CUTS[cut]) throw new Error(`no cut ${cut}`);

if (worker) {
  const [a, b] = arg('frames', '0:0').split(':').map(Number);
  const errs = await segment(a, b, worker, `[${path.basename(worker)}] `);
  process.exit(errs.length ? 2 : 0);
}

if (stills) {
  const { info, capture, frame, errors, close } = await openCut({ cut, base, theme });
  const t0 = Date.now();
  const list = stills.split(',').map(Number);
  for (const s of list) {
    const i = Math.min(info.frames - 1, Math.round(s * info.fps));
    if (i > 0) await frame(i - 1);   // compiles the shaders on the first still
    await frame(i);
    const file = path.join(out, `still-${cut}${theme ? `-${theme}` : ''}-${s.toFixed(2).padStart(7, '0')}.png`);
    fs.writeFileSync(file, await capture('png'));
    console.log('still', file);
  }
  await close();
  console.log(`${list.length} stills in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(errors.length ? errors.join('\n') : 'no console errors or warnings');
  process.exit(errors.length ? 2 : 0);
}

// the whole cut, or part of it, in one or more parallel segments
const L = layout(CUTS[cut]);
const from = Number(arg('from', '0')), to = Number(arg('to', String(L.duration)));
const a0 = Math.max(0, Math.round(from * FPS));
const b0 = Math.min(L.frames, Math.round(to * FPS));
const part = a0 > 0 || b0 < L.frames ? `-${a0}-${b0}` : '';
const stem = `echo-views-${cut}${theme ? `-${theme}` : ''}${part}`;
const mp4 = path.join(out, `${stem}${audio ? '' : '-silent'}.mp4`);
console.log(`cut ${cut} (${CUTS[cut].name}, ${CUTS[cut].aspect}, ${theme || CUTS[cut].theme}): ${L.duration.toFixed(2)} s, frames ${a0}-${b0}, ${jobs} job(s)`);
const t0 = Date.now();
const n = Math.min(jobs, Math.max(1, Math.floor((b0 - a0) / FPS)));
const bounds = [];
for (let k = 0; k <= n; k++) bounds.push(Math.round(a0 + ((b0 - a0) * k) / n));
const self = fileURLToPath(import.meta.url);
const segs = [], tasks = [];
for (let k = 0; k < n; k++) {
  const file = path.join(out, `.seg-${stem}-${k}.mp4`);
  segs.push(file);
  tasks.push(run('node', [self, `--cut=${cut}`, `--base=${base}`, `--out=${out}`, `--segment=${file}`, `--frames=${bounds[k]}:${bounds[k + 1]}`, ...(theme ? [`--theme=${theme}`] : [])]));
}
await Promise.all(tasks);
const list = path.join(out, `.segs-${stem}.txt`);
fs.writeFileSync(list, segs.map((f) => `file '${path.resolve(f)}'`).join('\n'));
const video = audio ? path.join(out, `.${stem}-video.mp4`) : mp4;
await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', video]);
for (const f of [...segs, list]) fs.unlinkSync(f);
if (audio) {
  const dur = (b0 - a0) / FPS;
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-ss', (a0 / FPS).toFixed(4), '-t', dur.toFixed(4), '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-aac_coder', 'fast', '-b:a', '256k', '-shortest', '-movflags', '+faststart', mp4]);
  fs.unlinkSync(video);
}
const min = (Date.now() - t0) / 60000;
console.log('wrote', mp4, `in ${min.toFixed(1)} min (${((min * 60) / Math.max(1, b0 - a0)).toFixed(2)} s/frame of wall time with ${n} job(s))`);

// ---------------------------------------------------------------- chapter videos
/** One chapter video, or several (one process each, `jobs` at a time). */
async function chapters(list) {
  const keys = list === 'all' ? KEYS : list.split(',').map((k) => k.trim().toLowerCase());
  for (const k of keys) if (!VIDEOS[k]) throw new Error(`no chapter video ${k} (video/chapters.js)`);
  if (keys.length > 1) {
    const self = fileURLToPath(import.meta.url), t0 = Date.now(), failed = [];
    let next = 0;
    const lane = async () => {
      while (next < keys.length) {
        const k = keys[next++];
        const a = audio === 'auto' ? [`--audio=${path.join(out, `chapter-${k}.wav`)}`] : [];
        await run('node', [self, `--ch=${k}`, `--base=${base}`, `--out=${out}`, ...a]).catch((e) => failed.push(`${k}: ${e.message}`));
      }
    };
    await Promise.all(Array.from({ length: Math.min(jobs, keys.length) }, lane));
    console.log(`${keys.length - failed.length} of ${keys.length} chapter videos in ${((Date.now() - t0) / 60000).toFixed(1)} min${failed.length ? `; failed: ${failed.join('; ')}` : ''}`);
    if (failed.length) process.exit(2);
    return;
  }
  const k = keys[0], stem = `chapter-${k}`;
  const open = () => openChapter({ ch: k, base });
  const wav = audio === 'auto' ? path.join(out, `${stem}.wav`) : audio;
  if (stills) {
    const { info, capture, frame, errors, close } = await open();
    for (const s of stills.split(',').map(Number).sort((x, y) => x - y)) {
      await frame(Math.min(info.frames - 1, Math.round(s * info.fps)));
      const file = path.join(out, `still-${stem}-${s.toFixed(2).padStart(7, '0')}.png`);
      fs.writeFileSync(file, await capture('png'));
      console.log('still', file);
    }
    await close();
    console.log(errors.length ? errors.join('\n') : 'no console errors or warnings');
    if (errors.length) process.exit(2);
    return;
  }
  const L = (await import('../video/chapters.js')).chapterLayout(VIDEOS[k]);
  const t0 = Date.now();
  const silent = path.join(out, `.${stem}-video.mp4`), mp4 = path.join(out, `${stem}${wav ? '' : '-silent'}.mp4`);
  console.log(`chapter ${k}: ${L.duration.toFixed(2)} s, ${L.frames} frames, in order in one job`);
  const errs = await segment(0, L.frames, silent, `[${k}] `, open);
  if (wav) {
    // the soundtrack runs to the last frame: padded with silence where a frame ends after it (with
    // -shortest, ffmpeg cut the last frames of the end card when the video ran 10 ms past the audio)
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-af', 'apad', '-c:a', 'aac', '-aac_coder', 'fast', '-b:a', '256k', '-t', (L.frames / FPS).toFixed(4), '-movflags', '+faststart', mp4]);
    fs.unlinkSync(silent);
  } else {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, '-c', 'copy', '-movflags', '+faststart', mp4]);
    fs.unlinkSync(silent);
  }
  console.log('wrote', mp4, `in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  if (errs.length) process.exit(2);
}

// ---------------------------------------------------------------- the intro
/** The intro: its clips (one process each, `jobs` at a time), joined in order, with the score. */
async function intro() {
  const R = reelLayout(), self = fileURLToPath(import.meta.url);
  const clip = arg('clip', '');
  if (clip !== '') {
    // one clip, in order in one job, into the file that the parent names
    const k = Number(clip), c = R.clips[k];
    const errs = await segment(0, c.frames, arg('file', ''), `[${k} ${c.ch}] `, () => openReel({ k, base }));
    process.exit(errs.length ? 2 : 0);
  }
  if (stills) {
    for (const s of stills.split(',').map(Number).sort((x, y) => x - y)) {
      const g = Math.min(R.frames - 1, Math.round(s * FPS)), c = R.clips.find((x) => g >= x.F0 && g < x.F1);
      const { capture, frame, errors, close } = await openReel({ k: c.k, base });
      await frame(g - c.F0);
      const file = path.join(out, `still-intro-${s.toFixed(2).padStart(7, '0')}.png`);
      fs.writeFileSync(file, await capture('png'));
      await close();
      console.log('still', file, `(clip ${c.k}, ${c.ch})`, errors.length ? errors.join('; ') : '');
    }
    return;
  }
  const only = arg('clips', '') ? arg('clips', '').split(',').map(Number) : R.clips.map((c) => c.k);
  const t0 = Date.now(), failed = [], files = R.clips.map((c) => path.join(out, `.intro-${c.k}.mp4`));
  console.log(`intro: ${R.duration.toFixed(2)} s, ${R.frames} frames, ${R.clips.length} clips; rendering ${only.join(',')}, ${jobs} at a time`);
  // the longest clips first, so that the lanes finish together
  const queue = [...only].sort((a, b) => R.clips[b].frames - R.clips[a].frames);
  const lane = async () => {
    while (queue.length) {
      const k = queue.shift();
      await run('node', [self, '--reel', `--clip=${k}`, `--file=${files[k]}`, `--base=${base}`, `--out=${out}`]).catch((e) => failed.push(`${k}: ${e.message}`));
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, only.length) }, lane));
  if (failed.length) throw new Error(`clips failed: ${failed.join('; ')}`);
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) {
    console.log(`rendered ${only.join(',')}; not joined: ${missing.length} clip(s) still to render`);
    return;
  }
  // the clips have the same encoder settings, so they join without a new encode
  const list = path.join(out, '.intro-clips.txt'), silent = path.join(out, '.intro-video.mp4');
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f)}'`).join('\n'));
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
  fs.unlinkSync(list);
  const wav = audio === 'auto' ? path.join(out, 'intro.wav') : audio;
  const mp4 = path.join(out, `intro${wav ? '' : '-silent'}.mp4`);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, ...(wav ? ['-i', wav, '-map', '0:v', '-map', '1:a'] : []),
    '-c:v', 'copy', ...(wav ? ['-af', 'apad', '-c:a', 'aac', '-aac_coder', 'fast', '-b:a', '256k'] : []),
    '-t', (R.frames / FPS).toFixed(4), '-movflags', '+faststart', mp4]);
  fs.unlinkSync(silent);
  console.log('wrote', mp4, `in ${((Date.now() - t0) / 60000).toFixed(1)} min; clips kept in ${out}/.intro-*.mp4`);
}
