"""Two-pass loudness normalization: python3 loudnorm2.py in.wav out.wav TP [fade_start fade_dur]
Targets -15 LUFS integrated; TP is the true-peak ceiling in dBTP (-1.5 short web video, -2.0 with AAC 160 kb/s)."""
import json, subprocess, sys
src, dst, tp = sys.argv[1], sys.argv[2], sys.argv[3]
r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af', f'loudnorm=I=-15:TP={tp}:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
m = json.loads(r[r.rfind('{'):r.rfind('}') + 1])
af = (f"loudnorm=I=-15:TP={tp}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
      f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
if len(sys.argv) > 5:
    af += f",afade=t=out:st={sys.argv[4]}:d={sys.argv[5]}"
subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '48000', '-c:a', 'pcm_s16le', dst], check=True)
print('ok', dst)
