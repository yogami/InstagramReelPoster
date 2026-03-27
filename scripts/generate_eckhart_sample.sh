#!/bin/bash
set -e

echo "Generating Meister Eckhart Sample Video..."

# Setup directories
TEMP_DIR="/tmp/eckhart_sample"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 1. Generate Voiceovers using Mac 'say' (to simulate TTS quickly)
echo "Generating Voiceovers..."
say -v Alex -r 180 "Meister Eckhart was a heretic. Why? Because he taught what Patanjali knew." -o "$TEMP_DIR/act1.aiff"
say -v Alex -r 170 "They both realized: The divine isn't in the sky. It's in the absolute silence of Nirodha." -o "$TEMP_DIR/act2.aiff"

# Convert to mp3
ffmpeg -y -i "$TEMP_DIR/act1.aiff" -acodec libmp3lame "$TEMP_DIR/act1.mp3" >/dev/null 2>&1
ffmpeg -y -i "$TEMP_DIR/act2.aiff" -acodec libmp3lame "$TEMP_DIR/act2.mp3" >/dev/null 2>&1

# Get durations
DUR1=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$TEMP_DIR/act1.mp3")
DUR2=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$TEMP_DIR/act2.mp3")

echo "Act 1 Duration: $DUR1"
echo "Act 2 Duration: $DUR2"

# 2. Generate Video Segments using FFmpeg Drawtext (The "Kova Typography" mockup)
echo "Generating Video Segments..."

# Act 1: The Hook (Fast text, dark background, yellow highlight)
ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=$DUR1 \
  -vf "drawtext=text='MEISTER ECKHART':fontcolor=white:fontsize=90:x=(w-text_w)/2:y=(h-text_h)/2-100, \
       drawtext=text='WAS A HERETIC':fontcolor=yellow:fontsize=110:x=(w-text_w)/2:y=(h-text_h)/2+50" \
  -c:v libx264 -pix_fmt yuv420p "$TEMP_DIR/act1_vid.mp4" >/dev/null 2>&1

# Act 2: Patanjali / Nirodha
ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=$DUR2 \
  -vf "drawtext=text='SILENCE OF':fontcolor=white:fontsize=100:x=(w-text_w)/2:y=(h-text_h)/2-80, \
       drawtext=text='NIRODHA':fontcolor=yellow:fontsize=140:x=(w-text_w)/2:y=(h-text_h)/2+60" \
  -c:v libx264 -pix_fmt yuv420p "$TEMP_DIR/act2_vid.mp4" >/dev/null 2>&1

# 3. Combine Audio and Video for each act
echo "Muxing segments..."
ffmpeg -y -i "$TEMP_DIR/act1_vid.mp4" -i "$TEMP_DIR/act1.mp3" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "$TEMP_DIR/act1_final.mp4" >/dev/null 2>&1
ffmpeg -y -i "$TEMP_DIR/act2_vid.mp4" -i "$TEMP_DIR/act2.mp3" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "$TEMP_DIR/act2_final.mp4" >/dev/null 2>&1

# 4. Concatenate
echo "Concatenating..."
cat << EOF > "$TEMP_DIR/concat_list.txt"
file 'act1_final.mp4'
file 'act2_final.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i "$TEMP_DIR/concat_list.txt" -c copy "$TEMP_DIR/final_eckhart.mp4" >/dev/null 2>&1

echo "Uploading to Cloudinary..."
# Use environment variables
source /Users/user1000/gitprojects/InstagramReelPoster/.env

UPLOAD_JSON=$(curl -s -X POST "https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload" \
  -u "${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}" \
  -F "file=@${TEMP_DIR}/final_eckhart.mp4" \
  -F "public_id=meister_eckhart_kova_sample_$(date +%s)" \
  -F "resource_type=video")

echo "Cloudinary Response:"
echo "$UPLOAD_JSON" | grep -o '"secure_url":"[^"]*' | grep -o '[^"]*$' || echo "$UPLOAD_JSON"

echo "Done."
