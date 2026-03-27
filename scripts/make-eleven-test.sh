#!/usr/bin/env bash
# make-eleven-test.sh — V3 with ElevenLabs High-Quality Conversational AI
set -e

ELEVEN_KEY="sk_549fc660e2a3d283d77a7f3762139bc3e62d2e6b060ab3b2"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

# Industry Standard Drama Voices
MALE_VOICE="N2lVS1w4EtoT3dr4eOWO"    # Callum - intense, deep
FEMALE_VOICE="21m00Tcm4TlvDq8ikWAM"  # Rachel - young, emotional

BG_IMAGE="/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/microdrama_bg_apartment_1771576323621.png"
WORK_DIR="/tmp/microdrama-el-$(date +%s)"
mkdir -p "$WORK_DIR"

echo "📁 Working in: $WORK_DIR"
echo ""

# ── 1. GENERATE TTS (ELEVENLABS) ──────────────────────────────────────────────
echo "🎙️  Generating voices (ElevenLabs V2)..."

# Using a specific previous generation ID in a real app would lock the style vector entirely.
# Here, we use higher stability to prevent Ren's voice from fluctuating in depth.
tts() {
  local prompt="$1" voice="$2" outfile="$3"
  printf "   → %s... " "$prompt"
  curl -s --max-time 30 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$voice" \
    -H "xi-api-key: $ELEVEN_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$prompt\",\"model_id\":\"eleven_multilingual_v2\",\"voice_settings\":{\"stability\":0.7,\"similarity_boost\":0.9,\"style\":0.0,\"use_speaker_boost\":true}}" \
    -o "$outfile"
  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$outfile" 2>/dev/null || echo "2.0")
  echo "${dur}s"
}

SILENCE="$WORK_DIR/silence.mp3"
ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t 0.6 -q:a 9 "$SILENCE" -loglevel error

LINE1_F="$WORK_DIR/line1.mp3"; tts "Huh... You're doing it again." "$FEMALE_VOICE" "$LINE1_F" > /tmp/d1
LINE2_M="$WORK_DIR/line2.mp3"; tts "Mm. Doing what?" "$MALE_VOICE" "$LINE2_M" > /tmp/d2
LINE3_F="$WORK_DIR/line3.mp3"; tts "Going somewhere... without moving." "$FEMALE_VOICE" "$LINE3_F" > /tmp/d3
LINE4_M="$WORK_DIR/line4.mp3"; tts "Uh, I'm right here." "$MALE_VOICE" "$LINE4_M" > /tmp/d4
LINE5_F="$WORK_DIR/line5.mp3"; tts "Yeah... That's the problem." "$FEMALE_VOICE" "$LINE5_F" > /tmp/d5

echo "✅ ElevenLabs TTS done"

# ── 2. COMBINE AUDIO ─────────────────────────────────────────────────────────
echo "🔗 Combining audio..."
LIST="$WORK_DIR/list.txt"
cat > "$LIST" <<EOF
file '$LINE1_F'
file '$SILENCE'
file '$LINE2_M'
file '$SILENCE'
file '$LINE3_F'
file '$SILENCE'
file '$LINE4_M'
file '$SILENCE'
file '$LINE5_F'
EOF

AUDIO="$WORK_DIR/voiceover.mp3"
ffmpeg -y -f concat -safe 0 -i "$LIST" -ar 44100 -ac 1 -c:a libmp3lame -q:a 2 "$AUDIO" -loglevel error
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO")
if (( $(echo "$DURATION < 10" | bc -l) )); then DURATION=10; fi
echo "✅ Audio merged: ${DURATION}s"

# ── 3. SCALE BACKGROUND ────────────────────────────────────────────
echo "🖼️  Scaling background..."
BG_SCALED="$WORK_DIR/bg.png"
ffmpeg -y -i "$BG_IMAGE" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  "$BG_SCALED" -loglevel error

# ── 4. SUBTITLES ───────────────────────────────────────────────────
D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE1_F")
D2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE2_M")
D3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE3_F")
D4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE4_M")
D5=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE5_F")
GAP=0.5

python3 - <<PYEOF
import sys

lines = [
    ("Zara", "You're doing it again."),
    ("Ren",  "Doing what?"),
    ("Zara", "Going somewhere without moving."),
    ("Ren",  "I'm right here."),
    ("Zara", "That's the problem."),
]
durations = [float("$D1"), float("$D2"), float("$D3"), float("$D4"), float("$D5")]
gap = float("$GAP")

def fmt(t):
    h = int(t//3600); m = int((t%3600)//60); s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

srt = []
cursor = 0.0
for i, ((name, text), dur) in enumerate(zip(lines, durations)):
    srt.append(f"{i+1}")
    srt.append(f"{fmt(cursor)} --> {fmt(cursor+dur)}")
    srt.append(f"<b>{name}</b>")
    srt.append(text)
    srt.append("")
    cursor += dur + gap

with open("$WORK_DIR/subs.srt", "w") as f:
    f.write("\n".join(srt))
PYEOF
echo "✅ Subtitles ready"

# ── 5. FINAL RENDER ───────────────────────────────────────────────
echo "🎬 Rendering final H.264 video..."
OUTPUT="$WORK_DIR/output.mp4"
ffmpeg -y \
  -loop 1 -i "$BG_SCALED" \
  -i "$AUDIO" \
  -vf "subtitles=$WORK_DIR/subs.srt:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=120'" \
  -c:v libx264 -preset fast -crf 22 \
  -c:a aac -b:a 128k \
  -shortest -t "$DURATION" \
  "$OUTPUT" -loglevel error

echo "✅ Video rendered: $OUTPUT"

# ── 6. UPLOAD ─────────────────────────────────────────────────────
echo "☁️  Uploading to Cloudinary..."
URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/test-elevenlabs" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║        ✅  ELEVENLABS VIDEO READY               ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $URL"
echo "╚════════════════════════════════════════════════╝"
cp "$OUTPUT" ~/Desktop/test-episode-elevenlabs.mp4
