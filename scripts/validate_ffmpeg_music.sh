#!/bin/bash
# Validation script: Generate a 5-second video with voiceover + background music
# This tests the FFmpeg audio mixing pipeline fix

set -e

OUTPUT_DIR="/tmp/ffmpeg_validation"
mkdir -p "$OUTPUT_DIR"

echo "🎬 FFmpeg Music Mixing Validation"
echo "=================================="

# Step 1: Generate a 5-second synthetic voiceover (sine wave at 440Hz simulating speech)
echo "1/4: Generating synthetic voiceover..."
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" \
    -af "volume=0.8" \
    "$OUTPUT_DIR/voiceover.mp3" 2>/dev/null

# Step 2: Generate a 10-second synthetic music track (lower frequency hum)
echo "2/4: Generating synthetic background music..."
ffmpeg -y -f lavfi -i "sine=frequency=220:duration=10" \
    -af "volume=0.5" \
    "$OUTPUT_DIR/music.mp3" 2>/dev/null

# Step 3: Generate a simple colored image for the video
echo "3/4: Generating test frame..."
ffmpeg -y -f lavfi -i "color=c=blue:size=1080x1920:rate=24:duration=5" \
    -vframes 1 \
    "$OUTPUT_DIR/frame.png" 2>/dev/null

# Step 4: Render the final video with the fixed audio pipeline
echo "4/4: Rendering video with mixed audio (voiceover + music)..."

ffmpeg -y \
    -i "$OUTPUT_DIR/voiceover.mp3" \
    -stream_loop -1 -i "$OUTPUT_DIR/music.mp3" \
    -loop 1 -t 5 -i "$OUTPUT_DIR/frame.png" \
    -filter_complex "
        [2:v]scale=1080:1920,format=yuv420p[vbase];
        [1:a]volume=0.2[bq_music];
        [0:a][bq_music]amix=inputs=2:duration=first:dropout_transition=2,volume=2.0[audio_out]
    " \
    -map "[vbase]" -map "[audio_out]" \
    -t 5 \
    -c:v libx264 -preset veryfast -c:a aac -b:a 192k -ac 2 -pix_fmt yuv420p -movflags +faststart \
    "$OUTPUT_DIR/validation_output.mp4"

echo ""
echo "✅ Validation complete!"
echo "📁 Output video: $OUTPUT_DIR/validation_output.mp4"
echo ""

# Print file info
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/validation_output.mp4" | xargs -I{} echo "⏱️  Duration: {} seconds"
ffprobe -v error -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/validation_output.mp4" | head -2 | xargs echo "🎥 Codecs:"

echo ""
echo "🔊 Audio streams in output:"
ffprobe -v error -show_entries stream=index,codec_type,channels -of csv=p=0 "$OUTPUT_DIR/validation_output.mp4" | grep audio || echo "   (checking...)"

echo ""
echo "To view the video, run:"
echo "   open $OUTPUT_DIR/validation_output.mp4"
