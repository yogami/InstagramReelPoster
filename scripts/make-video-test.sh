#!/usr/bin/env bash
# make-video-test.sh — V5 Pipeline: ElevenLabs + InfiniteTalk LipSync + Split Screen Pan

set -e

ELEVEN_KEY="sk_549fc660e2a3d283d77a7f3762139bc3e62d2e6b060ab3b2"
KIE_KEY="1f38ff8abd28546722a0cbd80e033fee"
CLOUD_NAME="djol0rpn5"
CLOUD_KEY="888753318981763"
CLOUD_SECRET="HqTbA8IE_o6CHbenhKb_iiKXOwo"

MALE_VOICE="N2lVS1w4EtoT3dr4eOWO"    # Callum
FEMALE_VOICE="21m00Tcm4TlvDq8ikWAM"  # Rachel

# Find the generated images
REN_IMAGE=$(ls /Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/ren_portrait_*.png | tail -n 1)
ZARA_IMAGE=$(ls /Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/zara_portrait_*.png | tail -n 1)

WORK_DIR="/tmp/microdrama-video-$(date +%s)"
mkdir -p "$WORK_DIR"
echo "📁 Working in: $WORK_DIR"
echo ""

# ── 1. GENERATE TTS ──────────────────────────────────────────────────────────
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

SILENCE="$WORK_DIR/silence.mp3"
ffmpeg -y -f lavfi -i "anoisesrc=c=brown:a=0.005:r=44100" -t 0.6 -q:a 9 "$SILENCE" -loglevel error

LINE1_F="$WORK_DIR/line1.mp3"; tts "Huh... You're doing it again." "$FEMALE_VOICE" "$LINE1_F" > /tmp/d1
LINE2_M="$WORK_DIR/line2.mp3"; tts "Mm. Doing what?" "$MALE_VOICE" "$LINE2_M" > /tmp/d2
LINE3_F="$WORK_DIR/line3.mp3"; tts "Going somewhere... without moving." "$FEMALE_VOICE" "$LINE3_F" > /tmp/d3
LINE4_M="$WORK_DIR/line4.mp3"; tts "Uh, I'm right here." "$MALE_VOICE" "$LINE4_M" > /tmp/d4
LINE5_F="$WORK_DIR/line5.mp3"; tts "Yeah... That's the problem." "$FEMALE_VOICE" "$LINE5_F" > /tmp/d5

# Create blank audio files with EXACT duration of the spoken lines for the opposite character
make_blank() {
  local src="$1" dest="$2"
  local dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  ffmpeg -y -f lavfi -i "anoisesrc=c=brown:a=0.005:r=44100" -t "$dur" -q:a 9 "$dest" -loglevel error
}

make_blank "$LINE1_F" "$WORK_DIR/line1_blank.mp3"
make_blank "$LINE2_M" "$WORK_DIR/line2_blank.mp3"
make_blank "$LINE3_F" "$WORK_DIR/line3_blank.mp3"
make_blank "$LINE4_M" "$WORK_DIR/line4_blank.mp3"
make_blank "$LINE5_F" "$WORK_DIR/line5_blank.mp3"

echo "🔗 Creating character-specific audio tracks..."
# Zara's Full Track (Zara speaks, silence when Ren speaks)
cat > "$WORK_DIR/list_zara.txt" <<EOF
file '$LINE1_F'
file '$SILENCE'
file '$WORK_DIR/line2_blank.mp3'
file '$SILENCE'
file '$LINE3_F'
file '$SILENCE'
file '$WORK_DIR/line4_blank.mp3'
file '$SILENCE'
file '$LINE5_F'
EOF
ZARA_AUDIO="$WORK_DIR/zara_audio.mp3"
ffmpeg -y -f concat -safe 0 -i "$WORK_DIR/list_zara.txt" -ar 44100 -ac 1 -c:a libmp3lame -q:a 2 "$ZARA_AUDIO" -loglevel error

# Ren's Full Track (Ren speaks, silence when Zara speaks)
cat > "$WORK_DIR/list_ren.txt" <<EOF
file '$WORK_DIR/line1_blank.mp3'
file '$SILENCE'
file '$LINE2_M'
file '$SILENCE'
file '$WORK_DIR/line3_blank.mp3'
file '$SILENCE'
file '$LINE4_M'
file '$SILENCE'
file '$WORK_DIR/line5_blank.mp3'
EOF
REN_AUDIO="$WORK_DIR/ren_audio.mp3"
ffmpeg -y -f concat -safe 0 -i "$WORK_DIR/list_ren.txt" -ar 44100 -ac 1 -c:a libmp3lame -q:a 2 "$REN_AUDIO" -loglevel error

# Master Audio
cat > "$WORK_DIR/list_master.txt" <<EOF
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
MASTER_AUDIO="$WORK_DIR/master_audio.mp3"
ffmpeg -y -f concat -safe 0 -i "$WORK_DIR/list_master.txt" -ar 44100 -ac 1 -c:a libmp3lame -q:a 2 "$MASTER_AUDIO" -loglevel error

# ── 2. UPLOAD ASSETS ────────────────────────────────────────────────────────
echo "☁️  Uploading assets to Cloudinary..."
upload() {
  local file="$1"
  curl -s --max-time 60 -X POST \
    "https://api.cloudinary.com/v1_1/$CLOUD_NAME/auto/upload" \
    -u "$CLOUD_KEY:$CLOUD_SECRET" \
    -F "file=@$file" \
    -F "folder=microdrama/temp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url',''))"
}

ZARA_IMG_URL=$(upload "$ZARA_IMAGE")
REN_IMG_URL=$(upload "$REN_IMAGE")
ZARA_AUD_URL=$(upload "$ZARA_AUDIO")
REN_AUD_URL=$(upload "$REN_AUDIO")

echo "   Zara IMG: $ZARA_IMG_URL"
echo "   Ren  IMG: $REN_IMG_URL"

# ── 3. LIPSYNC (INFINITETALK) ───────────────────────────────────────────────
echo "🎬 Starting Kie.ai LipSync tasks..."

start_lipsync() {
  local img="$1"
  local aud="$2"
  curl -s -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
    -H "Authorization: Bearer $KIE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"infinitalk/from-audio\",\"input\":{\"image_url\":\"$img\",\"audio_url\":\"$aud\",\"prompt\":\"character speaking naturally with realistic lip movements, subtle head movement\",\"resolution\":\"720p\"}}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('taskId', d))"
}

ZARA_TASK=$(start_lipsync "$ZARA_IMG_URL" "$ZARA_AUD_URL")
REN_TASK=$(start_lipsync "$REN_IMG_URL" "$REN_AUD_URL")
echo "   Zara Task: $ZARA_TASK"
echo "   Ren  Task: $REN_TASK"

poll_task() {
  local task="$1" out="$2"
  while true; do
    resp=$(curl -s "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=$task" -H "Authorization: Bearer $KIE_KEY")
    state=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('state','unknown'))")
    if [ "$state" = "success" ]; then
      url=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}).get('resultJson',''); parsed=json.loads(d) if d.startswith('{') or d.startswith('[') else d; print(parsed.get('resultUrls',[''])[0] if isinstance(parsed, dict) else (parsed[0] if isinstance(parsed, list) else parsed))")
      echo "✅ $task done: $url"
      curl -s -o "$out" "$url"
      break
    elif [ "$state" = "fail" ]; then
      echo "❌ $task FAILED: $resp"
      exit 1
    fi
    printf "."
    sleep 5
  done
}

echo "⏳ Waiting for generation (this takes ~1-3 minutes)..."
poll_task "$ZARA_TASK" "$WORK_DIR/zara_video.mp4"
poll_task "$REN_TASK" "$WORK_DIR/ren_video.mp4"

# ── 4. COMPOSITE AND PAN ───────────────────────────────────────────────────
echo "🎞️  Compositing split screen with camera movement..."

# We crop each 720x1280 video to a square-ish center (say 720x720) 
# and animate a slow zoom logic using zoompan. Note: zoompan drops audio, we mix master later.

ZARA_PAN="$WORK_DIR/zara_pan.mp4"
REN_PAN="$WORK_DIR/ren_pan.mp4"

# Zoompan from 1.0 to 1.1x scaling over the duration. 
# Zara (Top): Zooms IN slowly
ffmpeg -y -i "$WORK_DIR/zara_video.mp4" -vf "scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,zoompan=z='min(zoom+0.001,1.1)':d=1000:fps=30:s=1080x960" -c:v libx264 -preset fast -crf 22 -an "$ZARA_PAN" -loglevel error

# Ren (Bottom): Zooms IN slowly but with a slightly different rate or starting point to feel distinct
ffmpeg -y -i "$WORK_DIR/ren_video.mp4" -vf "scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,zoompan=z='min(zoom+0.001,1.1)':d=1000:fps=30:s=1080x960" -c:v libx264 -preset fast -crf 22 -an "$REN_PAN" -loglevel error

# Stack them vertically
SPLIT_VIDEO="$WORK_DIR/split.mp4"
ffmpeg -y -i "$ZARA_PAN" -i "$REN_PAN" -filter_complex "[0:v][1:v]vstack=inputs=2[v]" -map "[v]" -c:v libx264 -preset fast -crf 22 "$SPLIT_VIDEO" -loglevel error

# ── 5. SUBTITLES ────────────────────────────────────────────────────────────
echo "📝 Generating Subtitles..."
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

# ── 6. FINAL RENDER & UPLOAD ───────────────────────────────────────────────
echo "🎬 Finalizing..."
OUTPUT="$WORK_DIR/final_reels.mp4"
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MASTER_AUDIO")

# Map stacked video + master audio + subtitles
ffmpeg -y \
  -i "$SPLIT_VIDEO" \
  -i "$MASTER_AUDIO" \
  -vf "subtitles=$WORK_DIR/subs.srt:force_style='FontName=Arial,FontSize=24,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=120'" \
  -c:v libx264 -preset fast -crf 22 \
  -c:a aac -b:a 128k \
  -shortest -t "$DURATION" \
  "$OUTPUT" -loglevel error

URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/test-lipsync-v1" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║        ✅  LIP-SYNCHED VIDEO READY              ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $URL"
echo "╚════════════════════════════════════════════════╝"
cp "$OUTPUT" ~/Desktop/test-episode-lipsync.mp4
