"""Capture the TAVR chapter on this video's clock: a copy of the repository (git archive of HEAD)
whose video/chapters.js has the capture script below in place of VIDEOS.tavr, served on a free
port, then tools/render-video.mjs --ch=tavr in it. Writes chapter-tavr.mp4 (1920 x 1080, silent).

    python capture.py [--out video/out/tavr-procedure] [--keep]

The script: baseline (Measure, 0-6 s), position (the crimped valve at its place, 6-13.71 s), the
balloon's inflation under pacing (13.71-22.71 s: the Blender clock's 52-61 s of the first cut:
pacing from 13.71, the slider from 0.4805 to 0.6395 over 15.21-18.21 as the balloon fills, held
paced to 22.71), and the check (22.71-30.43 s). compose.py reads these times (CAP_*).
"""
import argparse
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SPEC = '''  tavr: {
    pane: '',
    side: false,
    intro: 0,
    outro: 1,
    exact: true,
    quant: { tavrT: 0.0005 },
    steps: [
      { set: { tavrT: 0.08, tavrValve: 'be', tavrLeak: 'none' }, track: 'Measure', pick: [0], hold: 7 },
      { set: { tavrT: 0.43 }, track: 'Position', pick: [0], move: 0, hold: 9 },
      { set: { tavrT: 0.4805 }, track: 'Deploy', pick: [0], move: 0, hold: 1.75 },
      { set: { tavrT: 0.6395 }, join: true, pick: [0], move: 0, hold: 3.5, path: (p) => ({ tavrT: 0.4805 + p * 0.159 }) },
      { set: { tavrT: 0.6395 }, join: true, pick: [0], move: 0, hold: 5.25 },
      { set: { tavrT: 0.9 }, track: 'Check', pick: [0], move: 0, hold: 9 },
    ],
  },
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(REPO, 'video', 'out', 'tavr-procedure'))
    ap.add_argument('--keep', action='store_true', help='keep the copy of the repository')
    a = ap.parse_args()
    tree = tempfile.mkdtemp(prefix='tavr-capture-')
    subprocess.run(f'git -C "{REPO}" archive HEAD | tar -x -C "{tree}"', shell=True, check=True)
    p = os.path.join(tree, 'video', 'chapters.js')
    s = open(p, encoding='utf-8').read()
    i = s.index('  tavr: {\n')
    j = s.index('\n  },\n', i) + len('\n  },\n')
    open(p, 'w', encoding='utf-8').write(s[:i] + SPEC + s[j:])
    with socket.socket() as so:
        so.bind(('127.0.0.1', 0))
        port = so.getsockname()[1]
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=tree,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.0)
        os.makedirs(a.out, exist_ok=True)
        subprocess.run(['node', 'tools/render-video.mjs', '--ch=tavr', f'--base=http://127.0.0.1:{port}', f'--out={a.out}'],
                       cwd=tree, check=True)
        shutil.move(os.path.join(a.out, 'chapter-tavr-silent.mp4'), os.path.join(a.out, 'chapter-tavr.mp4'))
        print('wrote', os.path.join(a.out, 'chapter-tavr.mp4'))
    finally:
        srv.terminate()
        if not a.keep:
            shutil.rmtree(tree, ignore_errors=True)


if __name__ == '__main__':
    main()
