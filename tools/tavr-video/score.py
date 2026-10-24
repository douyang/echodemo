"""The TAVR procedure video's soundtrack: Bright pulse (tools/score/pulse.py), as the chapter
videos have it, on this video's timeline (compose.py: its windows and its end card). Seed 9335,
the next number after the chapter videos'.

    python3 score.py video/out/tavr-procedure/score.wav [--repo .]
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def main():
    args = sys.argv[1:]
    repo = args[args.index('--repo') + 1] if '--repo' in args else os.path.dirname(os.path.dirname(HERE))
    sys.path.insert(0, os.path.join(repo, 'tools', 'score'))
    import compose                                  # noqa: E402
    import pulse                                    # noqa: E402
    T = compose.timeline()
    pulse.SEEDS['TAVRPROC'] = 9335
    pulse.SC.timeline = lambda cut: T
    pulse.score('TAVRPROC', args[0], -15.0, -2.5)


if __name__ == '__main__':
    main()
