#!/usr/bin/env bash
# Pre-generate co-pilot voice lines ONCE, offline, with Piper TTS (en_US-ljspeech-high, public domain voice).
# Needs: a python venv with piper-tts, the voice model, and ffmpeg. Output: public/voice/*.mp3 + lines.json
set -euo pipefail
PIPER=${PIPER:-/workspace/tts-venv/bin/piper}
MODEL=${MODEL:-/workspace/tts-voices/en_US-ljspeech-high.onnx}
python3 scripts/voice-prep.py > /tmp/voice-jobs.tsv
mkdir -p public/voice /tmp/voice-wav
while IFS=$'\t' read -r id say; do
  echo "$say" | "$PIPER" -m "$MODEL" --length-scale 1.08 --sentence-silence 0.25 -f "/tmp/voice-wav/$id.wav" >/dev/null 2>&1
  ffmpeg -y -loglevel error -i "/tmp/voice-wav/$id.wav" -af "loudnorm=I=-16:TP=-1.5,afade=t=in:d=0.03" -ac 1 -ar 22050 -c:a libmp3lame -b:a 40k "public/voice/$id.mp3"
done < /tmp/voice-jobs.tsv
python3 scripts/voice-prep.py --manifest > public/voice/lines.json
ls -la public/voice | tail -n +2 | awk '{s+=$5} END {print "total bytes", s}'
