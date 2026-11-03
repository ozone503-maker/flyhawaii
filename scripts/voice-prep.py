import json, re, sys, os, subprocess
L = json.load(open('voice-src/lines.json')); SAY = json.load(open('voice-src/say.json'))
keys = sorted(SAY, key=len, reverse=True)
def spoken(t):
    for k in keys: t = re.sub(r'(?<![\wʻ])' + re.escape(k) + r'(?![\wʻ])', SAY[k], t)
    t = re.sub(r'\]\]([,.!?;:])', r'\1]]', t)  # punctuation after a raw phoneme block must sit inside it
    return t.replace('ʻ', '').replace('ā','a').replace('ē','e').replace('ī','i').replace('ō','o').replace('ū','u')
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
items = [('lm-' + k, v) for k, v in L['landmarks'].items()] + [('town-' + slug(k), v) for k, v in L['towns'].items()] + [('cue-' + k, v) for k, v in L['cues'].items()]
if '--manifest' in sys.argv:
    out = {}
    for id, text in items:
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'public/voice/{id}.mp3'], capture_output=True, text=True).stdout or 0)
        out[id] = {'text': text, 'src': f'/voice/{id}.mp3', 'dur': round(dur, 2), 'bytes': os.path.getsize(f'public/voice/{id}.mp3')}
    print(json.dumps({'voice': 'Piper TTS, en_US-ljspeech-high (public domain)', 'lines': out}, ensure_ascii=False, indent=1))
else:
    for id, text in items: print(f'{id}\t{spoken(text)}')
