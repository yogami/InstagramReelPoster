#!/usr/bin/env bash
# make-reel-kundalini-v3.sh — Kundalini Dark Night Series (all fixes applied)
#
# FIXES from v2:
#   1. MUSIC: Richer ambient via detuned oscillators + reverb + tremolo (not bare sine waves)
#   2. AUDIO: Re-encode all audio to AAC (no -c copy for MP3 concat — fixes DTS corruption)
#   3. VOICE: Josh voice + low stability (0.4) + high style (0.5) = human, emotional delivery
#   4. SUBTITLES: Smaller font (16), bottom-center (Alignment=2), proper MarginV (80), no cut-off

set -e

ELEVEN_KEY="sk_549fc660e2a3d283d77a7f3762139bc3e62d2e6b060ab3b2"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

# Josh — deep, warm, emotional male voice
NARRATOR="TxGEqnHWrfWFTfGW9XjX"

BRAIN="/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2"
IMGS=(
  "$BRAIN/kundalini_author1_1771968027053.png"
  "$BRAIN/kundalini_author2_1771968040577.png"
  "$BRAIN/kundalini_author3_1771968054892.png"
  "$BRAIN/kundalini_author4_1771968068832.png"
)
AMBIENT="/tmp/kundalini-music-v2/ambient.mp3"

WORK="/tmp/reel-v3-$(date +%s)"
mkdir -p "$WORK"
echo "📁 Working in: $WORK"

# ── 1. GENERATE NARRATION (humanized voice settings) ────────────────────────
echo "🎙️  Generating narration (Josh, emotional settings)..."

# Write quotes to temp files to avoid bash escaping hell
cat > "$WORK/q0.txt" <<'EOF'
For months, I could not sleep. Every time I closed my eyes, a stream of liquid light would shoot up my spine... and my heart would pound so violently, I was certain it would stop.
EOF
cat > "$WORK/q1.txt" <<'EOF'
The panic attacks came only at night. A crushing weight on my chest. A feeling that I was dying. No doctor could explain it.
EOF
cat > "$WORK/q2.txt" <<'EOF'
Patients described waking at three in the morning in absolute terror. Drenched in sweat. Their nervous system was rewiring itself... and it felt like annihilation.
EOF
cat > "$WORK/q3.txt" <<'EOF'
The insomnia was relentless. Three, four days without sleep. My body vibrating so intensely that lying down felt like being electrocuted.
EOF

AUTHORS=("Gopi Krishna" "Bonnie Greenwell" "Lee Sannella" "El Collie")
AUDIO_FILES=()
DURATIONS=()

for i in 0 1 2 3; do
  AUDIO_FILE="$WORK/narr_${i}.mp3"
  AUDIO_FILES+=("$AUDIO_FILE")

  printf "   %s... " "${AUTHORS[$i]}"

  # Build JSON payload via Python to avoid bash quoting hell
  PAYLOAD=$(python3 <<PYEOF
import json
text = open("$WORK/q${i}.txt").read().strip()
print(json.dumps({
    "text": text,
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.4,
        "similarity_boost": 0.85,
        "style": 0.5,
        "use_speaker_boost": True
    }
}))
PYEOF
)

  curl -s --max-time 30 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$NARRATOR" \
    -H "xi-api-key: $ELEVEN_KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -o "$AUDIO_FILE"

  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null || echo "5.0")
  DURATIONS+=("$DUR")
  echo "${DUR}s"
done
echo "✅ Narration done"

# ── 2. CREATE KEN BURNS CLIPS (re-encode audio to AAC, no -c copy) ──────────
echo "🎞️  Creating Ken Burns clips..."

CLIPS=()
PAUSE=1.5

for i in 0 1 2 3; do
  dur="${DURATIONS[$i]}"
  audio="${AUDIO_FILES[$i]}"
  img="${IMGS[$i]}"
  clip="$WORK/clip_${i}.mp4"
  CLIPS+=("$clip")

  FRAMES=$(python3 -c "import math; print(max(30, math.ceil($dur * 30)))")

  case $((i % 4)) in
    0) ZOOM="z='min(zoom+0.0010,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" ;;
    1) ZOOM="z='if(eq(on,1),1.10,max(zoom-0.0010,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" ;;
    2) ZOOM="z='min(zoom+0.0008,1.06)':x='if(eq(on,1),0,min(x+0.6,iw-iw/zoom))':y='ih/2-(ih/zoom/2)'" ;;
    3) ZOOM="z='min(zoom+0.0008,1.06)':x='if(eq(on,1),iw/8,max(x-0.6,0))':y='ih/2-(ih/zoom/2)'" ;;
  esac

  printf "   Shot %d (%s, %.1fs)... " "$((i+1))" "${AUTHORS[$i]}" "$dur"

  # FIX: Re-encode audio to AAC (not copy) to eliminate DTS corruption
  ffmpeg -y -loop 1 -i "$img" -i "$audio" \
    -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=${ZOOM}:d=${FRAMES}:fps=30:s=1080x1920" \
    -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 192k \
    -shortest -t "$dur" \
    "$clip" -loglevel error

  echo "done"
done
echo "✅ All clips rendered"

# ── 3. DARK TRANSITION ──────────────────────────────────────────────────────
echo "⏸️  Creating transitions..."
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30:d=$PAUSE" \
  -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t "$PAUSE" \
  "$WORK/gap.mp4" -loglevel error

# ── 4. CONCATENATE (re-encode to fix stream compatibility) ───────────────────
echo "🔗 Concatenating..."
CONCAT_LIST="$WORK/concat.txt"
> "$CONCAT_LIST"
for i in "${!CLIPS[@]}"; do
  echo "file '${CLIPS[$i]}'" >> "$CONCAT_LIST"
  if [ "$i" -lt "$((${#CLIPS[@]} - 1))" ]; then
    echo "file '$WORK/gap.mp4'" >> "$CONCAT_LIST"
  fi
done

NARRATION_VIDEO="$WORK/narration.mp4"
# FIX: Re-encode during concat to ensure consistent stream params
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  "$NARRATION_VIDEO" -loglevel error

TOTAL_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$NARRATION_VIDEO")
echo "✅ Narration video: ${TOTAL_DUR}s"

# ── 5. MIX AMBIENT MUSIC UNDERNEATH ─────────────────────────────────────────
echo "🎵 Layering ambient music..."
FADEOUT_START=$(python3 -c "print(max(0, $TOTAL_DUR - 4))")

MIXED="$WORK/mixed.mp4"
ffmpeg -y -i "$NARRATION_VIDEO" -i "$AMBIENT" \
  -filter_complex "\
    [0:a]volume=1.0[narr]; \
    [1:a]atrim=0:$TOTAL_DUR,afade=t=in:st=0:d=3,afade=t=out:st=$FADEOUT_START:d=4,volume=0.35[bg]; \
    [narr][bg]amix=inputs=2:duration=shortest:dropout_transition=3[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  "$MIXED" -loglevel error
echo "✅ Audio mixed (music at 35% under narration)"

# ── 6. SUBTITLES (fixed: smaller font, bottom-center, no cut-off) ───────────
echo "📝 Generating subtitles..."
python3 <<PYEOF
import subprocess

authors = ["Gopi Krishna", "Bonnie Greenwell", "Lee Sannella", "El Collie"]
quotes = []
for i in range(4):
    with open(f"$WORK/q{i}.txt") as f:
        quotes.append(f.read().strip())

durations = []
for i in range(4):
    r = subprocess.run(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"$WORK/narr_{i}.mp3"],
        capture_output=True, text=True
    )
    durations.append(float(r.stdout.strip()))

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
    # Attribution line + quote on separate lines
    srt.append(f"\u2014 {author}")
    srt.append(quote)
    srt.append("")
    cursor += dur + pause

with open("$WORK/subs.srt", "w") as f:
    f.write("\n".join(srt))
print("SRT OK")
PYEOF

# FIX: Font size 16 (was 20), Alignment=2 (bottom center), MarginV=80 (was 160)
OUTPUT="$WORK/final.mp4"
ffmpeg -y -i "$MIXED" \
  -vf "subtitles=$WORK/subs.srt:force_style='FontName=Arial,FontSize=16,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=80,MarginL=60,MarginR=60'" \
  -c:v libx264 -preset fast -crf 20 \
  -c:a copy \
  -movflags +faststart \
  "$OUTPUT" -loglevel error
echo "✅ Final video with subtitles ready"

# ── 7. UPLOAD ────────────────────────────────────────────────────────────────
echo "☁️  Uploading..."
FINAL_URL=$(curl -s --max-time 120 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/kundalini-dark-v3" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

cp "$OUTPUT" ~/Desktop/kundalini-dark-v3.mp4

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅  REEL READY (v3 — all fixes)                ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $FINAL_URL"
echo "╚════════════════════════════════════════════════╝"
echo "📱 ~/Desktop/kundalini-dark-v3.mp4"
