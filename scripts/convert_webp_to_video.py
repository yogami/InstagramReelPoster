#!/usr/bin/env python3
"""
Convert animated WebP files to MP4 videos using Pillow and ffmpeg
"""
import os
import subprocess
import tempfile
from PIL import Image

ARTIFACTS_DIR = "/Users/user1000/.gemini/antigravity/brain/e45ae8ac-faba-46f9-90f3-8a7eb991b946"
OUTPUT_DIR = os.path.join(ARTIFACTS_DIR, "video_segments")
AUDIO_FILE = "/Users/user1000/gitprojects/InstagramReelPoster/scripts/output/aicanary_demo/final_audio.mp3"

# Create output directory
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Segment files in order
SEGMENTS = [
    "aicanary_demo_segment1_1770308947759.webp",
    "aicanary_demo_segment2_1770309057049.webp", 
    "aicanary_demo_segment3_1770309601767.webp",
    "aicanary_demo_segment4_1770310222962.webp",
    "aicanary_demo_segment5_1770310542188.webp",
    "aicanary_demo_segment6_1770310588561.webp",
    "aicanary_demo_segment7_1770310651509.webp",
]

def convert_webp_to_mp4(webp_path, output_path):
    """Convert animated WebP to MP4 using Pillow to extract frames"""
    print(f"Converting: {os.path.basename(webp_path)}")
    
    try:
        img = Image.open(webp_path)
        
        # Check if animated
        if not getattr(img, 'is_animated', False):
            print(f"  Not animated, creating static video...")
            # Create a short video from static image
            with tempfile.TemporaryDirectory() as tmpdir:
                frame_path = os.path.join(tmpdir, "frame.png")
                img.save(frame_path)
                # Create 5 second video from static image
                subprocess.run([
                    'ffmpeg', '-y', '-loop', '1', '-i', frame_path,
                    '-c:v', 'libx264', '-t', '5', '-pix_fmt', 'yuv420p',
                    '-vf', 'scale=1920:-2', output_path
                ], check=True, capture_output=True)
            return True
            
        # Extract all frames
        frames = []
        durations = []
        
        try:
            while True:
                frame = img.copy().convert('RGBA')
                # Create white background and paste
                bg = Image.new('RGBA', frame.size, (255, 255, 255, 255))
                bg.paste(frame, mask=frame.split()[3] if len(frame.split()) == 4 else None)
                frames.append(bg.convert('RGB'))
                durations.append(img.info.get('duration', 100))
                img.seek(img.tell() + 1)
        except EOFError:
            pass
        
        print(f"  Extracted {len(frames)} frames")
        
        if len(frames) == 0:
            print("  No frames extracted!")
            return False
        
        # Save frames to temp directory
        with tempfile.TemporaryDirectory() as tmpdir:
            for i, frame in enumerate(frames):
                frame_path = os.path.join(tmpdir, f"frame_{i:04d}.png")
                frame.save(frame_path)
            
            # Calculate FPS from duration (100ms per frame = 10 fps)
            avg_duration = sum(durations) / len(durations) if durations else 100
            fps = 1000 / avg_duration
            
            print(f"  Rendering at {fps:.1f} fps...")
            
            # Use ffmpeg to create video
            subprocess.run([
                'ffmpeg', '-y', '-framerate', str(fps),
                '-i', os.path.join(tmpdir, 'frame_%04d.png'),
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-vf', 'scale=1920:-2',
                output_path
            ], check=True, capture_output=True)
        
        return True
        
    except Exception as e:
        print(f"  Error: {e}")
        return False

def main():
    print("🎬 Converting WebP segments to MP4...\n")
    
    mp4_files = []
    
    for i, segment in enumerate(SEGMENTS, 1):
        webp_path = os.path.join(ARTIFACTS_DIR, segment)
        mp4_path = os.path.join(OUTPUT_DIR, f"segment_{i}.mp4")
        
        if not os.path.exists(webp_path):
            print(f"⚠️  Segment {i} not found: {segment}")
            continue
            
        if convert_webp_to_mp4(webp_path, mp4_path):
            print(f"  ✅ Created: {mp4_path}")
            mp4_files.append(mp4_path)
        else:
            print(f"  ❌ Failed: {segment}")
    
    if not mp4_files:
        print("\n❌ No video segments created!")
        return
    
    print(f"\n📎 Concatenating {len(mp4_files)} segments...")
    
    # Create concat file
    concat_file = os.path.join(OUTPUT_DIR, "concat.txt")
    with open(concat_file, 'w') as f:
        for mp4 in mp4_files:
            f.write(f"file '{mp4}'\n")
    
    # Concatenate videos
    raw_video = os.path.join(OUTPUT_DIR, "raw_video.mp4")
    subprocess.run([
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
        '-i', concat_file, '-c', 'copy', raw_video
    ], check=True)
    
    print("  ✅ Videos concatenated")
    
    # Add audio
    final_video = os.path.join(OUTPUT_DIR, "aicanary_demo_final.mp4")
    print(f"\n🎵 Adding audio track...")
    
    subprocess.run([
        'ffmpeg', '-y',
        '-i', raw_video,
        '-i', AUDIO_FILE,
        '-c:v', 'copy', '-c:a', 'aac',
        '-shortest', final_video
    ], check=True)
    
    print(f"  ✅ Final video: {final_video}")
    
    # Get video info
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=duration', '-of', 'csv=p=0', final_video
    ], capture_output=True, text=True)
    
    duration = result.stdout.strip()
    print(f"\n✨ Video duration: {duration} seconds")
    print(f"📁 Location: {final_video}")

if __name__ == "__main__":
    main()
