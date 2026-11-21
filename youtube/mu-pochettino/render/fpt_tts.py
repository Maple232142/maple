"""FPT.AI TTS v5 helper. The api-key header is injected by the session proxy (placeholder here)."""
import json, time, urllib.request, sys

def synth(text, out_path, voice="leminh", speed="0", tries=40):
    req = urllib.request.Request("https://api.fpt.ai/hmi/tts/v5", data=text.encode("utf-8"), method="POST",
                                 headers={"api-key": "proxy-injected", "voice": voice, "speed": speed, "format": "mp3"})
    r = json.loads(urllib.request.urlopen(req, timeout=60).read())
    if r.get("error"): raise RuntimeError(r)
    url = r["async"]
    for _ in range(tries):
        time.sleep(1.5)
        try:
            data = urllib.request.urlopen(url, timeout=60).read()
            if len(data) > 1000:
                open(out_path, "wb").write(data); return out_path
        except Exception as e:
            last = e
    raise RuntimeError(f"audio not ready: {url}")

if __name__ == "__main__":
    print(synth(sys.argv[1], sys.argv[2], *sys.argv[3:]))
