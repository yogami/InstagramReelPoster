#!/usr/bin/env bash
# make-reel-kundalini-dark.sh — Kundalini Dark Night Series
# Real author accounts of insomnia + nocturnal panic attacks
# Isochronic ambient music + deep emotional narration + Ken Burns animated portraits

set -e

ELEVEN_KEY="sk_549fc660e2a3d283d77a7f3762139bc3e62d2e6b060ab3b2"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

# Deep emotional male voice — "Daniel" (British, deep, contemplative)
NARRATOR="onwK4e9ZLuTAKqWW03F9"

BRAIN="/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2"
IMGS=(
  "$BRAIN/kundalini_author1_1771968027053.png"
  "$BRAIN/kundalini_author2_1771968040577.png"
  "$BRAIN/kundalini_author3_1771968054892.png"
  "$BRAIN/kundalini_author4_1771968068832.png"
)
AMBIENT="/tmp/kundalini-music/ambient.mp3"

WORK="/tmp/reel-dark-$(date +%s)"
mkdir -p "$WORK"
echo "📁 Working in: $WORK"

# ── AUTHOR QUOTES (paraphrased from real accounts) ───────────────────────────
AUTHORS=(
  "Gopi Krishna"
  "Bonnie Greenwell"
  "Lee Sannella"
  "El Collie"
)
QUOTES=(
  "For months, I could not sleep. Every time I closed my eyes, a stream of liquid light would shoot up my spine... and my heart would pound so violently, I was certain it would stop."
  "The panic attacks came only at night. A crushing weight on my chest. A feeling that I was dying. No doctor could explain it."
  "Patients described waking at three in the morning in absolute terror. Drenched in sweat. Their nervous system was rewiring itself... and it felt like annihilation."
  "The insomnia was relentless. Three, four days without sleep. My body vibrating so intensely that lying down felt like being electrocuted."
)

# ── 1. GENERATE NARRATION ────────────────────────────────────────────────────
echo "🎙️  Generating deep narration..."
tts() {
  local text="$1" out="$2"
  curl -s --max-time 30 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$NARRATOR" \
    -H "xi-api-key: $ELEVEN_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$text\",\"model_id\":\"eleven_multilingual_v2\",\"voice_settings\":{\"stability\":0.85,\"similarity_boost\":0.75,\"style\":0.3,\"use_speaker_boost\":true}}" \
    -o "$out"
}

AUDIO_FILES=()
DURATIONS=()
PAUSE=1.2  # longer pause between quotes for gravitas

for i in "${!QUOTES[@]}"; do
  AUDIO_FILE="$WORK/quote_${i}.mp3"
  AUDIO_FILES+=("$AUDIO_FILE")
  printf "   %s: %.50s... " "${AUTHORS[$i]}" "${QUOTES[$i]}"
  tts "${QUOTES[$i]}" "$AUDIO_FILE"
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null || echo "4.0")
  DURATIONS+=("$DUR")
  echo "${DUR}s"
done
echo "✅ Narration done"

# ── 2. CREATE KEN BURNS CLIPS PER QUOTE ──────────────────────────────────────
echo "🎞️  Creating Ken Burns clips..."

CLIPS=()
for i in "${!QUOTES[@]}"; do
  dur="${DURATIONS[$i]}"
  audio="${AUDIO_FILES[$i]}"
  img="${IMGS[$i]}"
  clip="$WORK/clip_${i}.mp4"
  CLIPS+=("$clip")

  FRAMES=$(python3 -c "import math; print(max(30, math.ceil($dur * 30)))")

  # Each quote gets a different Ken Burns motion
  case $((i % 4)) in
    0) ZOOM="z='min(zoom+0.0012,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" ;;
    1) ZOOM="z='if(eq(on,1),1.12,max(zoom-0.0012,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" ;;
    2) ZOOM="z='min(zoom+0.001,1.08)':x='if(eq(on,1),0,min(x+0.8,iw-iw/zoom))':y='ih/2-(ih/zoom/2)'" ;;
    3) ZOOM="z='min(zoom+0.001,1.08)':x='if(eq(on,1),iw/6,max(x-0.8,0))':y='ih/2-(ih/zoom/2)'" ;;
  esac

  printf "   Shot %d (%s, %.1fs)... " "$((i+1))" "${AUTHORS[$i]}" "$dur"

  ffmpeg -y -loop 1 -i "$img" -i "$audio" \
    -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=${ZOOM}:d=${FRAMES}:fps=30:s=1080x1920" \
    -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 128k \
    -shortest -t "$dur" \
    "$clip" -loglevel error

  echo "done"
done
echo "✅ All clips rendered"

# ── 3. CREATE TRANSITION CLIPS (dark fade gaps) ─────────────────────────────
echo "⏸️  Creating dark transitions..."
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30:d=$PAUSE" \
  -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -t "$PAUSE" \
  "$WORK/transition.mp4" -loglevel error
echo "✅ Transitions ready"

# ── 4. CONCATENATE CLIPS ────────────────────────────────────────────────────
echo "🔗 Concatenating..."

CONCAT_LIST="$WORK/concat.txt"
> "$CONCAT_LIST"
for i in "${!CLIPS[@]}"; do
  echo "file '${CLIPS[$i]}'" >> "$CONCAT_LIST"
  if [ "$i" -lt "$((${#CLIPS[@]} - 1))" ]; then
    echo "file '$WORK/transition.mp4'" >> "$CONCAT_LIST"
  fi
done

NARRATION_VIDEO="$WORK/narration.mp4"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$NARRATION_VIDEO" -loglevel error

TOTAL_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$NARRATION_VIDEO")
echo "✅ Narration video: ${TOTAL_DUR}s"

# ── 5. LAYER AMBIENT MUSIC UNDER NARRATION ──────────────────────────────────
echo "🎵 Layering isochronic ambient music..."

# Trim ambient to match video length, mix with narration audio
MIXED="$WORK/mixed.mp4"
ffmpeg -y -i "$NARRATION_VIDEO" -i "$AMBIENT" \
  -filter_complex "\
    [0:a]volume=1.0[narration]; \
    [1:a]atrim=0:$TOTAL_DUR,afade=t=in:st=0:d=2,afade=t=out:st=$(python3 -c "print(max(0, $TOTAL_DUR - 3))"):d=3,volume=0.25[music]; \
    [narration][music]amix=inputs=2:duration=shortest:dropout_transition=3[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  "$MIXED" -loglevel error
echo "✅ Audio mixed"

# ── 6. GENERATE & BURN SUBTITLES ────────────────────────────────────────────
echo "📝 Generating subtitles..."

python3 - <<PYEOF
authors = [$(printf '"%s",' "${AUTHORS[@]}")]
quotes = [$(printf '"%s",' "${QUOTES[@]}" | sed 's/"/\\"/g; s/\\\\"/"/g')]
durations = [$(IFS=,; echo "${DURATIONS[*]}")]
pause = $PAUSE

def fmt(t):
    h = int(t//3600); m = int((t%3600)//60)
    s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

srt = []
cursor = 0.0
for i, (author, quote, dur) in enumerate(zip(authors, quotes, durations)):
    srt.append(f"{i+1}")
    srt.append(f"{fmt(cursor)} --> {fmt(cursor+dur)}")
    srt.append(f"— {author}")
    srt.append(quote)
    srt.append("")
    cursor += dur + pause

with open("$WORK/subs.srt", "w") as f:
    f.write("\n".join(srt))
print("✅ Subtitles generated")
PYEOF

OUTPUT="$WORK/final.mp4"
ffmpeg -y -i "$MIXED" \
  -vf "subtitles=$WORK/subs.srt:force_style='FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=160,MarginL=40,MarginR=40'" \
  -c:v libx264 -preset fast -crf 20 \
  -c:a copy \
  -movflags +faststart \
  "$OUTPUT" -loglevel error
echo "✅ Final video ready"

# ── 7. UPLOAD ────────────────────────────────────────────────────────────────
echo "☁️  Uploading..."
FINAL_URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/kundalini-dark-night" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

cp "$OUTPUT" ~/Desktop/kundalini-dark-night.mp4

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅  KUNDALINI DARK NIGHT REEL READY            ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $FINAL_URL"
echo "╚════════════════════════════════════════════════╝"
echo "📱 Saved to ~/Desktop/kundalini-dark-night.mp4"
