#!/usr/bin/env bash
# make-video-kling.sh — V6 Pipeline: ElevenLabs Audio + Kling 3.0 Video Generation

set -e

ELEVEN_KEY="sk_549fc660e2a3d283d77a7f3762139bc3e62d2e6b060ab3b2"
KIE_KEY="1f38ff8abd28546722a0cbd80e033fee"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

MALE_VOICE="N2lVS1w4EtoT3dr4eOWO"    # Callum
FEMALE_VOICE="21m00Tcm4TlvDq8ikWAM"  # Rachel

WORK_DIR="/tmp/microdrama-kling-$(date +%s)"
mkdir -p "$WORK_DIR"
echo "📁 Working in: $WORK_DIR"
echo ""

# ── 1. GENERATE TTS (ElevenLabs) ─────────────────────────────────────────────
echo "🎙️  Generating voices (ElevenLabs V2)..."
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

Z1="$WORK_DIR/z1.mp3"; tts "Huh... You're doing it again." "$FEMALE_VOICE" "$Z1" > /tmp/d1
R1="$WORK_DIR/r1.mp3"; tts "Mm. Doing what?"               "$MALE_VOICE"   "$R1" > /tmp/d2
Z2="$WORK_DIR/z2.mp3"; tts "Going somewhere without moving." "$FEMALE_VOICE" "$Z2" > /tmp/d3
R2="$WORK_DIR/r2.mp3"; tts "Uh, I'm right here."           "$MALE_VOICE"   "$R2" > /tmp/d4
Z3="$WORK_DIR/z3.mp3"; tts "That's the problem."           "$FEMALE_VOICE" "$Z3" > /tmp/d5

echo "✅ TTS done"

# ── 2. COMBINE AUDIO & SUBTITLES ─────────────────────────────────────────────
echo "🔗 Combining audio & calculating subtitles..."

GAP=0.5
SILENCE="$WORK_DIR/gap.mp3"
ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t $GAP -q:a 9 "$SILENCE" -loglevel error

cat > "$WORK_DIR/list_audio.txt" <<EOM
file '$Z1'
file '$SILENCE'
file '$R1'
file '$SILENCE'
file '$Z2'
file '$SILENCE'
file '$R2'
file '$SILENCE'
file '$Z3'
EOM

MASTER_AUDIO="$WORK_DIR/master.mp3"
ffmpeg -y -f concat -safe 0 -i "$WORK_DIR/list_audio.txt" -c copy "$MASTER_AUDIO" -loglevel error
MASTER_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MASTER_AUDIO")
if (( $(echo "$MASTER_DUR < 10" | bc -l) )); then MASTER_DUR=10; fi
echo "✅ Audio: ${MASTER_DUR}s"

D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$Z1")
D2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$R1")
D3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$Z2")
D4=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$R2")
D5=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$Z3")

python3 - <<PYEOF
import sys

lines = [
    ("Zara", "You're doing it again."),
    ("Ren",  "Mm. Doing what?"),
    ("Zara", "Going somewhere without moving."),
    ("Ren",  "Uh, I'm right here."),
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
PYEOF
echo "✅ Subtitles generated"


# ── 3. GENERATE KLING 3.0 VIDEO ──────────────────────────────────────────────
echo "🎬 Generating animated base video with Kling..."

PROMPT="A stylized 2D cartoon animation of two people having a tense conversation in a modern dimly lit apartment. A handsome man with dark hair and a beautiful blonde woman are arguing. Style: high quality 2D digital animation, cel-shaded, flat colors, clean line art, stylized characters. Smooth camera pan. 9:16 vertical format, Instagram Reel."

PAYLOAD=$(cat <<JSON
{
  "model": "kling-2.6/text-to-video",
  "input": {
    "prompt": "$PROMPT",
    "negative_prompt": "photorealistic, 3D render, live action, real people, watermark, text overlay, blur, overexposed, low quality",
    "aspect_ratio": "9:16",
    "duration": "10",
    "sound": false,
    "mode": "std"
  }
}
JSON
)

RESP=$(curl -s -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer $KIE_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

TASK_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('taskId', ''))")

if [ -z "$TASK_ID" ]; then
  echo "❌ Failed to start Kling generation! Response:"
  echo "$RESP"
  exit 1
fi

echo "   Task started: $TASK_ID. Polling for completion (this takes ~3-5 mins)..."

KLING_VIDEO="$WORK_DIR/kling_base.mp4"
while true; do
  INFO=$(curl -s "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=$TASK_ID" -H "Authorization: Bearer $KIE_KEY")
  STATE=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('state','unknown'))")
  
  if [ "$STATE" = "success" ]; then
    URL=$(echo "$INFO" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}).get('resultJson',''); parsed=json.loads(d) if d.startswith('{') or d.startswith('[') else d; print(parsed.get('resultUrls',[''])[0] if isinstance(parsed, dict) else (parsed[0] if isinstance(parsed, list) else parsed))")
    echo "✅ Kling Video ready! Downloading..."
    curl -s -o "$KLING_VIDEO" "$URL"
    break
  elif [ "$STATE" = "fail" ]; then
    echo "❌ Kling task failed!"
    echo "$INFO"
    exit 1
  fi
  sleep 10
done

# ── 4. FINAL COMPOSITE FFMPEG ────────────────────────────────────────────────
echo "🎞️  Compositing final video..."

OUTPUT="$WORK_DIR/final_kling.mp4"
ffmpeg -y -i "$KLING_VIDEO" -i "$MASTER_AUDIO" \
  -vf "subtitles=$WORK_DIR/subs.srt:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=120'" \
  -c:v libx264 -preset fast -crf 22 \
  -c:a aac -b:a 128k \
  -shortest \
  -movflags +faststart \
  "$OUTPUT" -loglevel error

echo "✅ Final composite created"

# ── 5. UPLOAD TO CLOUDINARY ──────────────────────────────────────────────────
echo "☁️  Uploading to Cloudinary..."
FINAL_URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/test-kling-final" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║        ✅  VIDEO READY                          ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $FINAL_URL"
echo "╚════════════════════════════════════════════════╝"

cp "$OUTPUT" ~/Desktop/kling-episode.mp4
echo "📱 Saved to ~/Desktop/kling-episode.mp4"
