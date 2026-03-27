#!/usr/bin/env bash
# make-test-video.sh — Pure shell test. No TypeScript. No hanging.
# Run: bash scripts/make-test-video.sh

set -e
FISH_KEY="cfcfa3c247e04d24a29f6eece228c261"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

# Voice IDs — confirmed working from first run
MALE_VOICE="802e3bc2b27e49c2995d23ef70e6ac89"    # Male voice (working)
FEMALE_VOICE="3895f5f7c6ac43f092bec1b2c04f431f"  # Female voice (working)

BG_IMAGE="/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/microdrama_bg_apartment_1771576323621.png"
WORK_DIR="/tmp/microdrama-$(date +%s)"
mkdir -p "$WORK_DIR"

echo "📁 Working in: $WORK_DIR"
echo ""

# ── 1. GENERATE TTS ──────────────────────────────────────────────────────────
echo "🎙️  Generating voices (Fish Audio)..."

tts() {
  local text="$1" voice="$2" outfile="$3"
  printf "   → %s... " "$text"
  curl -s --max-time 30 -X POST "https://api.fish.audio/v1/tts" \
    -H "Authorization: Bearer $FISH_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$text\",\"reference_id\":\"$voice\",\"format\":\"mp3\",\"model\":\"s1\",\"latency\":\"normal\"}" \
    -o "$outfile"
  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$outfile" 2>/dev/null || echo "2.0")
  echo "${dur}s"
  echo "$dur"
}

SILENCE="$WORK_DIR/silence.mp3"
ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t 0.6 -q:a 9 "$SILENCE" -loglevel error

# Script lines: Zara then Ren alternating
LINE1_F="$WORK_DIR/line1.mp3"; tts "You're doing it again." "$FEMALE_VOICE" "$LINE1_F" > /tmp/d1
LINE2_M="$WORK_DIR/line2.mp3"; tts "Doing what."            "$MALE_VOICE"   "$LINE2_M" > /tmp/d2
LINE3_F="$WORK_DIR/line3.mp3"; tts "Going somewhere without moving." "$FEMALE_VOICE" "$LINE3_F" > /tmp/d3
LINE4_M="$WORK_DIR/line4.mp3"; tts "I'm right here."        "$MALE_VOICE"   "$LINE4_M" > /tmp/d4
LINE5_F="$WORK_DIR/line5.mp3"; tts "That's the problem."    "$FEMALE_VOICE" "$LINE5_F" > /tmp/d5

echo ""
echo "✅ TTS done"

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
# Ensure at least 10s
if (( $(echo "$DURATION < 10" | bc -l) )); then DURATION=10; fi
echo "✅ Audio: ${DURATION}s"

# ── 3. SCALE BACKGROUND TO 1080x1920 ─────────────────────────────────────────
echo "🖼️  Scaling background..."
BG_SCALED="$WORK_DIR/bg.png"
ffmpeg -y -i "$BG_IMAGE" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  "$BG_SCALED" -loglevel error
echo "✅ Background ready"

# ── 4. CALCULATE SUBTITLE TIMING ─────────────────────────────────────────────
# Get durations
D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE1_F")
D2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE2_M")
D3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE3_F")
D4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE4_M")
D5=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LINE5_F")
GAP=0.6

python3 - <<PYEOF
import sys

lines = [
    ("Zara", "You're doing it again."),
    ("Ren",  "Doing what."),
    ("Zara", "Going somewhere without moving."),
    ("Ren",  "I'm right here."),
    ("Zara", "That's the problem."),
]
durations = [float("$D1"), float("$D2"), float("$D3"), float("$D4"), float("$D5")]
gap = float("$GAP")

def fmt(t):
    h = int(t//3600); m = int((t%3600)//60)
    s = t % 60
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
print("✅ Subtitles generated")
PYEOF

# ── 5. FFMPEG FINAL RENDER ────────────────────────────────────────────────────
echo "🎬 Rendering final video..."
OUTPUT="$WORK_DIR/output.mp4"
ffmpeg -y \
  -loop 1 -i "$BG_SCALED" \
  -i "$AUDIO" \
  -vf "subtitles=$WORK_DIR/subs.srt:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=120'" \
  -c:v libx264 -preset fast -crf 22 \
  -c:a aac -b:a 128k \
  -shortest -t "$DURATION" \
  -movflags +faststart \
  "$OUTPUT" -loglevel error

echo "✅ Video rendered: $OUTPUT"

# ── 6. UPLOAD TO CLOUDINARY ───────────────────────────────────────────────────
echo "☁️  Uploading to Cloudinary..."
URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/test-v2" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║        ✅  VIDEO READY                          ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $URL"
echo "╚════════════════════════════════════════════════╝"

# Copy to Desktop too
cp "$OUTPUT" ~/Desktop/test-episode-v2.mp4
echo ""
echo "📱 Also saved to: ~/Desktop/test-episode-v2.mp4"
