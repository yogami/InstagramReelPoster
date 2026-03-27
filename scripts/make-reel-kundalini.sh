#!/usr/bin/env bash
# make-reel-kundalini.sh — Path A: Ken Burns + Jump Cuts + ElevenLabs
# No video generation API. Pure FFmpeg + still portraits.

set -e

ELEVEN_KEY="sk_549fc660e2a3d283d77a7f3762139bc3e62d2e6b060ab3b2"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

MALE_VOICE="N2lVS1w4EtoT3dr4eOWO"    # Callum (deep male)
FEMALE_VOICE="21m00Tcm4TlvDq8ikWAM"  # Rachel (warm female)

FEMALE_IMG="/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/kundalini_female_1771967573917.png"
MALE_IMG="/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/kundalini_male_1771967588924.png"

WORK="/tmp/reel-kundalini-$(date +%s)"
mkdir -p "$WORK"
echo "📁 Working in: $WORK"

# ── DIALOGUE ──────────────────────────────────────────────────────────────────
# Format: SPEAKER|TEXT
# F = Female (guide), M = Male (seeker)
LINES=(
  "F|When it first woke up in me... I thought I was losing my mind."
  "M|What did it feel like?"
  "F|Like electricity crawling up my spine. Every cell vibrating."
  "M|That's exactly what happened to me last night."
  "F|Then you already know... there's no going back."
)

# ── 1. GENERATE TTS ──────────────────────────────────────────────────────────
echo "🎙️  Generating voices..."
tts() {
  local text="$1" voice="$2" out="$3"
  curl -s --max-time 30 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$voice" \
    -H "xi-api-key: $ELEVEN_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$text\",\"model_id\":\"eleven_multilingual_v2\",\"voice_settings\":{\"stability\":0.7,\"similarity_boost\":0.9,\"style\":0.0,\"use_speaker_boost\":true}}" \
    -o "$out"
}

AUDIO_FILES=()
DURATIONS=()
SPEAKERS=()
TEXTS=()
GAP=0.6

for i in "${!LINES[@]}"; do
  IFS='|' read -r speaker text <<< "${LINES[$i]}"
  SPEAKERS+=("$speaker")
  TEXTS+=("$text")
  AUDIO_FILE="$WORK/line_${i}.mp3"
  AUDIO_FILES+=("$AUDIO_FILE")

  if [ "$speaker" = "F" ]; then
    VOICE="$FEMALE_VOICE"
  else
    VOICE="$MALE_VOICE"
  fi

  printf "   %s: %s... " "$speaker" "$text"
  tts "$text" "$VOICE" "$AUDIO_FILE"
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null || echo "2.0")
  DURATIONS+=("$DUR")
  echo "${DUR}s"
done
echo "✅ TTS done"

# ── 2. CREATE KEN BURNS CLIPS PER LINE ──────────────────────────────────────
echo "🎞️  Creating Ken Burns clips per line..."

# Ken Burns effect variations for visual variety
# Each line gets a slightly different zoom/pan direction
CLIPS=()
for i in "${!LINES[@]}"; do
  speaker="${SPEAKERS[$i]}"
  dur="${DURATIONS[$i]}"
  audio="${AUDIO_FILES[$i]}"
  clip="$WORK/clip_${i}.mp4"
  CLIPS+=("$clip")

  if [ "$speaker" = "F" ]; then
    IMG="$FEMALE_IMG"
  else
    IMG="$MALE_IMG"
  fi

  # Calculate frames needed (30fps)
  FRAMES=$(python3 -c "import math; print(max(30, math.ceil($dur * 30)))")

  # Alternate Ken Burns directions for visual variety
  case $((i % 4)) in
    0) # Slow zoom in (center)
      ZOOM="z='min(zoom+0.0015,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
      ;;
    1) # Slow zoom out
      ZOOM="z='if(eq(on,1),1.15,max(zoom-0.0015,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
      ;;
    2) # Slow pan right + zoom
      ZOOM="z='min(zoom+0.001,1.1)':x='if(eq(on,1),0,min(x+1,iw-iw/zoom))':y='ih/2-(ih/zoom/2)'"
      ;;
    3) # Slow pan left + zoom
      ZOOM="z='min(zoom+0.001,1.1)':x='if(eq(on,1),iw/5,max(x-1,0))':y='ih/2-(ih/zoom/2)'"
      ;;
  esac

  printf "   Shot %d (%s, %.1fs)... " "$((i+1))" "$speaker" "$dur"

  ffmpeg -y -loop 1 -i "$IMG" -i "$audio" \
    -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=${ZOOM}:d=${FRAMES}:fps=30:s=1080x1920" \
    -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 128k \
    -shortest -t "$dur" \
    "$clip" -loglevel error

  echo "done"
done
echo "✅ All clips rendered"

# ── 3. CREATE GAP CLIP (brief pause between lines) ──────────────────────────
echo "⏸️  Creating gap clips..."
# Black frame gap
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30:d=$GAP" \
  -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -t "$GAP" \
  "$WORK/gap.mp4" -loglevel error
echo "✅ Gap ready"

# ── 4. CONCATENATE ALL CLIPS ────────────────────────────────────────────────
echo "🔗 Concatenating clips with gaps..."

CONCAT_LIST="$WORK/concat.txt"
> "$CONCAT_LIST"
for i in "${!CLIPS[@]}"; do
  echo "file '${CLIPS[$i]}'" >> "$CONCAT_LIST"
  # Add gap between lines, but not after the last one
  if [ "$i" -lt "$((${#CLIPS[@]} - 1))" ]; then
    echo "file '$WORK/gap.mp4'" >> "$CONCAT_LIST"
  fi
done

BASE_VIDEO="$WORK/base.mp4"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$BASE_VIDEO" -loglevel error
echo "✅ Base video created"

TOTAL_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BASE_VIDEO")
echo "   Total duration: ${TOTAL_DUR}s"

# ── 5. GENERATE SUBTITLES ───────────────────────────────────────────────────
echo "📝 Generating subtitles..."

python3 - <<PYEOF
lines = [
$(for i in "${!LINES[@]}"; do
  IFS='|' read -r speaker text <<< "${LINES[$i]}"
  if [ "$speaker" = "F" ]; then name="Her"; else name="Him"; fi
  echo "    (\"$name\", \"$text\"),"
done)
]
durations = [$(IFS=,; echo "${DURATIONS[*]}")]
gap = $GAP

def fmt(t):
    h = int(t//3600); m = int((t%3600)//60)
    s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

srt = []
cursor = 0.0
for i, ((name, text), dur) in enumerate(zip(lines, durations)):
    srt.append(f"{i+1}")
    srt.append(f"{fmt(cursor)} --> {fmt(cursor+dur)}")
    srt.append(text)
    srt.append("")
    cursor += dur + gap

with open("$WORK/subs.srt", "w") as f:
    f.write("\n".join(srt))
print("✅ Subtitles generated")
PYEOF

# ── 6. BURN IN SUBTITLES ────────────────────────────────────────────────────
echo "🔥 Burning subtitles into video..."
OUTPUT="$WORK/final.mp4"
ffmpeg -y -i "$BASE_VIDEO" \
  -vf "subtitles=$WORK/subs.srt:force_style='FontName=Arial,FontSize=24,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=140'" \
  -c:v libx264 -preset fast -crf 20 \
  -c:a copy \
  -movflags +faststart \
  "$OUTPUT" -loglevel error
echo "✅ Final video ready"

# ── 7. UPLOAD ────────────────────────────────────────────────────────────────
echo "☁️  Uploading to Cloudinary..."
FINAL_URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/kundalini-reel" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

cp "$OUTPUT" ~/Desktop/kundalini-reel.mp4

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║     ✅  KUNDALINI REEL READY                   ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $FINAL_URL"
echo "╚════════════════════════════════════════════════╝"
echo "📱 Saved to ~/Desktop/kundalini-reel.mp4"
