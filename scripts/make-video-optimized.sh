#!/usr/bin/env bash
# make-video-optimized.sh — V5 Pipeline: ElevenLabs + InfiniteTalk Active Clips + Split Screen

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

WORK_DIR="/tmp/microdrama-optimized-$(date +%s)"
mkdir -p "$WORK_DIR"
echo "📁 Working in: $WORK_DIR"
echo ""

# ── 1. GENERATE TTS ──────────────────────────────────────────────────────────
echo "🎙️  Generating isolated voices (ElevenLabs V2)..."
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
R1="$WORK_DIR/r1.mp3"; tts "Mm. Doing what?" "$MALE_VOICE" "$R1" > /tmp/d2
Z2="$WORK_DIR/z2.mp3"; tts "Going somewhere without moving." "$FEMALE_VOICE" "$Z2" > /tmp/d3
R2="$WORK_DIR/r2.mp3"; tts "Uh, I'm right here." "$MALE_VOICE" "$R2" > /tmp/d4

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

Z1_URL=$(upload "$Z1")
R1_URL=$(upload "$R1")
Z2_URL=$(upload "$Z2")
R2_URL=$(upload "$R2")

echo "   Uploads complete."

# ── 3. LIPSYNC (INFINITETALK) ───────────────────────────────────────────────
echo "🎬 Starting Kie.ai LipSync tasks for active segments..."

start_lipsync() {
  local img="$1" aud="$2"
  curl -s -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
    -H "Authorization: Bearer $KIE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"infinitalk/from-audio\",\"input\":{\"image_url\":\"$img\",\"audio_url\":\"$aud\",\"prompt\":\"character speaking naturally with realistic lip movements, subtle head movement\",\"resolution\":\"720p\"}}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('taskId', d))"
}

T_Z1=$(start_lipsync "$ZARA_IMG_URL" "$Z1_URL")
T_R1=$(start_lipsync "$REN_IMG_URL" "$R1_URL")
T_Z2=$(start_lipsync "$ZARA_IMG_URL" "$Z2_URL")
T_R2=$(start_lipsync "$REN_IMG_URL" "$R2_URL")

echo "   Tasks triggered. Polling..."

poll_task() {
  local task="$1" out="$2"
  while true; do
    resp=$(curl -s "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=$task" -H "Authorization: Bearer $KIE_KEY")
    state=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('state','unknown'))")
    if [ "$state" = "success" ]; then
      url=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}).get('resultJson',''); parsed=json.loads(d) if d.startswith('{') or d.startswith('[') else d; print(parsed.get('resultUrls',[''])[0] if isinstance(parsed, dict) else (parsed[0] if isinstance(parsed, list) else parsed))")
      curl -s -o "$out" "$url"
      echo "✅ $task done"
      break
    elif [ "$state" = "fail" ]; then
      echo "❌ $task FAILED"
      exit 1
    fi
    sleep 3
  done
}

# Run polls in parallel for speed!
poll_task "$T_Z1" "$WORK_DIR/z1.mp4" &
P1=$!
poll_task "$T_R1" "$WORK_DIR/r1.mp4" &
P2=$!
poll_task "$T_Z2" "$WORK_DIR/z2.mp4" &
P3=$!
poll_task "$T_R2" "$WORK_DIR/r2.mp4" &
P4=$!

wait $P1 $P2 $P3 $P4
echo "🎉 All isolated lip-sync clips generated!"

# ── 4. PREPARE STATIC GAPS ───────────────────────────────────────────────────
echo "🎞️  Stitching logic via FFMPEG..."

# Get lengths
L_Z1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$Z1")
L_R1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$R1")
L_Z2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$Z2")
L_R2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$R2")
GAP=0.5

# We create master audio
MASTER_AUDIO="$WORK_DIR/master.mp3"
ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t $GAP -q:a 9 "$WORK_DIR/gap.mp3" -loglevel error
cat > "$WORK_DIR/list_audio.txt" <<EOM
file '$Z1'
file '$WORK_DIR/gap.mp3'
file '$R1'
file '$WORK_DIR/gap.mp3'
file '$Z2'
file '$WORK_DIR/gap.mp3'
file '$R2'
EOM
ffmpeg -y -f concat -safe 0 -i "$WORK_DIR/list_audio.txt" -c copy "$MASTER_AUDIO" -loglevel error
MASTER_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MASTER_AUDIO")

# Render Zara Full (z1 + gap + r1_dur + gap + z2 + gap + r2_dur)
# It's easier to just use standard filter_complex for arranging the video tracks exactly on the master timeline.
# Zara timeline elements: z1 [0:v], zara_img [1:v], z2 [2:v]

# Calculate start times for the clips
T_Z1_START=0
T_R1_START=$(echo "$L_Z1 + $GAP" | bc -l)
T_Z2_START=$(echo "$T_R1_START + $L_R1 + $GAP" | bc -l)
T_R2_START=$(echo "$T_Z2_START + $L_Z2 + $GAP" | bc -l)

# Make base static canvases of length MASTER_DUR
ffmpeg -y -loop 1 -t "$MASTER_DUR" -i "$ZARA_IMAGE" -c:v libx264 -pix_fmt yuv420p -s 720x1280 "$WORK_DIR/zara_base.mp4" -loglevel error
ffmpeg -y -loop 1 -t "$MASTER_DUR" -i "$REN_IMAGE" -c:v libx264 -pix_fmt yuv420p -s 720x1280 "$WORK_DIR/ren_base.mp4" -loglevel error

# Overlay Zara's talking heads onto her base at specific timestamps!
ffmpeg -y -i "$WORK_DIR/zara_base.mp4" \
  -i "$WORK_DIR/z1.mp4" -i "$WORK_DIR/z2.mp4" \
  -filter_complex "[0:v][1:v]overlay=enable='between(t,$T_Z1_START,${T_R1_START})'[v1]; [v1][2:v]overlay=enable='between(t,$T_Z2_START,${T_R2_START})'[z_final]" \
  -map "[z_final]" -c:v libx264 "$WORK_DIR/zara_full.mp4" -loglevel error

# Overlay Ren's talking heads onto his base
RE1_END=$(echo "$T_R1_START + $L_R1" | bc -l)
RE2_END=$(echo "$T_R2_START + $L_R2 + 1.0" | bc -l)
ffmpeg -y -i "$WORK_DIR/ren_base.mp4" \
  -i "$WORK_DIR/r1.mp4" -i "$WORK_DIR/r2.mp4" \
  -filter_complex "[0:v][1:v]overlay=enable='between(t,$T_R1_START,${RE1_END})'[v1]; [v1][2:v]overlay=enable='between(t,$T_R2_START,${RE2_END})'[r_final]" \
  -map "[r_final]" -c:v libx264 "$WORK_DIR/ren_full.mp4" -loglevel error


# Stack them
SPLIT_VIDEO="$WORK_DIR/split.mp4"
ffmpeg -y -i "$WORK_DIR/zara_full.mp4" -i "$WORK_DIR/ren_full.mp4" -filter_complex "[0:v][1:v]vstack=inputs=2,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.001,1.1)':d=1:fps=30:s=1080x1920[v]" -map "[v]" -c:v libx264 -preset fast -crf 22 "$SPLIT_VIDEO" -loglevel error

# Combine with audio
OUTPUT="$WORK_DIR/final_optimized.mp4"
ffmpeg -y -i "$SPLIT_VIDEO" -i "$MASTER_AUDIO" -c:v copy -c:a aac -shortest "$OUTPUT" -loglevel error

URL=$(curl -s --max-time 60 -X POST \
  "https://api.cloudinary.com/v1_1/$CLOUD_NAME/video/upload" \
  -u "$CLOUD_KEY:$CLOUD_SECRET" \
  -F "file=@$OUTPUT" \
  -F "public_id=microdrama/test-lipsync-optimized" \
  -F "overwrite=true" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secure_url','upload failed'))")

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║        ✅  OPTIMIZED VIDEO READY               ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  $URL"
echo "╚════════════════════════════════════════════════╝"
cp "$OUTPUT" ~/Desktop/optimized-lipsync.mp4
