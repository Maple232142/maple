"""Build the long video and the three Shorts.
usage: python3 build.py VOICE_DIR OUT_DIR [long|shorts|all] [--preview]
"""
import sys, os, wave, hashlib, json
import numpy as np
from engine import *
import engine
from content import BEATS, SHORTS, phonetic
from piper import PiperVoice, SynthesisConfig

VOICE, OUT = sys.argv[1], sys.argv[2]
WHAT = sys.argv[3] if len(sys.argv) > 3 else "all"
PREVIEW = "--preview" in sys.argv
os.makedirs(OUT, exist_ok=True); CACHE = os.path.join(OUT, "tts"); os.makedirs(CACHE, exist_ok=True)
voice = PiperVoice.load(os.path.join(VOICE, "vi_VN-vais1000-medium.onnx"), config_path=os.path.join(VOICE, "vi_VN-vais1000-medium.onnx.json"))
CFG = SynthesisConfig(length_scale=0.93)

def tts(text):
    p = os.path.join(CACHE, hashlib.md5(text.encode()).hexdigest() + ".wav")
    if not os.path.exists(p):
        with wave.open(p, "wb") as w: voice.synthesize_wav(phonetic(text), w, syn_config=CFG)
    a, sr = read_wav(p); assert sr == SR, sr
    # trim leading/trailing near-silence
    idx = np.where(np.abs(a) > 0.01)[0]
    if len(idx): a = a[max(0, idx[0] - 400): idx[-1] + 800]
    return a

GAP, BEAT_GAP, LEAD = 0.22, 0.55, 0.15

def assemble(segments, wav_out, intro=None):
    """segments: list of (text, visual, bg, sfx). Returns shots list."""
    shots = []; audio = []; t = 0.0
    def put(a, at):
        need = int((at) * SR) + len(a)
        cur = sum(len(x) for x in audio)
        if need > cur: audio.append(np.zeros(need - cur, np.float32))
        buf = np.concatenate(audio) if len(audio) > 1 else audio[0]
        audio.clear(); audio.append(buf)
        s = int(at * SR); buf[s:s + len(a)] += a
    audio.append(np.zeros(1, np.float32))
    t = LEAD
    for i, seg in enumerate(segments):
        text, vis, bg, fx = seg[:4]
        gap_after = seg[4] if len(seg) > 4 else GAP
        a = tts(text)
        d = len(a) / SR
        start = t - (LEAD if i == 0 else 0)
        put(a, t)
        dur_shot = d + gap_after + (LEAD if i == 0 else 0)
        for frac, kind in fx:
            put(sfx(kind) * 0.8, max(0, t + frac * d))
        shots.append(dict(start=start, dur=dur_shot, draw=vis, bg=bg, sub=text))
        t += d + gap_after
    total = t + 0.6
    shots[-1]["dur"] = total - shots[-1]["start"]
    buf = audio[0]
    if len(buf) < int(total * SR): buf = np.concatenate([buf, np.zeros(int(total * SR) - len(buf), np.float32)])
    peak = np.max(np.abs(buf)); buf = buf / peak * 0.89 if peak > 0 else buf
    write_wav(wav_out, buf)
    return shots, total

def long_video():
    segs = []
    for name, beat in BEATS:
        for j, s in enumerate(beat):
            segs.append(tuple(s) + ((BEAT_GAP if j == len(beat) - 1 else GAP),))
    if PREVIEW: segs = segs[:6]
    wav = os.path.join(OUT, "long.wav")
    shots, total = assemble(segs, wav)
    # chapter marks from beat starts
    marks = []; k = 0
    for name, beat in BEATS:
        if k < len(shots): marks.append((name, shots[k]["start"]))
        k += len(beat)
    json.dump(marks, open(os.path.join(OUT, "chapters.json"), "w"))
    out = os.path.join(OUT, "mu-18-pochettino" + ("-preview" if PREVIEW else "") + ".mp4")
    render(shots, 1920, 1080, 25, wav, out, sub_y=0.885, sub_size=42)
    print("LONG", out, round(total, 1), "s"); return marks

def short_video(name, first, onscreen, beatkey, rng, repl):
    beat = dict(BEATS)[beatkey]
    picked = []
    for i in range(*rng):
        s = list(beat[i])
        if i in repl: s[0] = repl[i]
        picked.append(tuple(s))
    # first line: reuse the first picked visual
    first_seg = (first, picked[0][1], picked[0][2], [(0.0, "whoosh")])
    segs = [first_seg] + picked
    wav = os.path.join(OUT, name + ".wav")
    shots, total = assemble(segs, wav)
    W, H = 1080, 1920
    def header(img):
        d = ImageDraw.Draw(img); f = font(54)
        cur_t = header.t
        if cur_t < 2.0:
            # big on-screen hook text for the first 2 seconds
            k = ease_back(cur_t / 0.3)
            ff = font(110 * k) if k > 0.05 else None
            if ff:
                d.rounded_rectangle([60, 170, W - 60, 420], radius=30, fill=(218, 41, 28))
                d.text((W / 2, 295), onscreen, font=ff, fill=WHITE, anchor="mm", stroke_width=4, stroke_fill=(0, 0, 0))
        else:
            d.text((W / 2, 230), "MU · thứ 18 · 20/11/2026", font=f, fill=(200, 200, 200), anchor="mm")
    header.t = 0
    # wrap render to expose time to header
    fps = 30
    def hdr(img):
        header(img); header.t += 1 / fps
    out = os.path.join(OUT, name + ".mp4")
    render(shots, W, H, fps, wav, out, sub_y=0.80, sub_size=52, header=hdr, zoom=0.05)
    print("SHORT", out, round(total, 1), "s")
    return total

if __name__ == "__main__":
    if WHAT in ("long", "all"): long_video()
    if WHAT in ("shorts", "all") and not PREVIEW:
        for sh in SHORTS: short_video(*sh)
