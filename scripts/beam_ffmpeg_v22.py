"""
FFmpeg Video Rendering Endpoint for Beam.cloud - V22 SIMPLE FILTERS
Uses -vf and -af instead of -filter_complex to avoid named stream issues.

Deploy with:
    beam deploy scripts/beam_ffmpeg_v22.py:render_video --name ffmpeg-v22-simple
"""

from beta9 import endpoint, Image, Volume
import os
import subprocess
import requests
import base64
import uuid

image = Image(
    python_version="python3.10",
    python_packages=[
        "requests",
        "Pillow",
        "cloudinary",
    ],
    commands=[
        "apt-get update && apt-get install -y ffmpeg fontconfig",
    ],
)

storage_volume = Volume(name="ffmpeg-v22-cache", mount_path="/cache")


@endpoint(
    name="ffmpeg-v22",
    image=image,
    cpu=4,
    memory="8Gi",
    volumes=[storage_volume],
    keep_warm_seconds=60,
    secrets=["CLOUDINARY_URL"],
)
def render_video(
    voiceover_url: str,
    segments: list = None,
    animated_video_url: str = None,
    animated_video_urls: list = None,
    music_url: str = None,
    subtitles_url: str = None,
    duration_seconds: float = 30,
    logo_url: str = None,
    logo_position: str = None,
    music_duration_seconds: float = None,
    branding: dict = None,
) -> dict:
    """Video rendering using -vf/-af instead of filter_complex."""
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    print(f"[V22] ===== Job {job_id} =====")
    
    try:
        # 1. Download voiceover
        voiceover_path = f"{job_dir}/voiceover.mp3"
        r = requests.get(voiceover_url, timeout=60)
        r.raise_for_status()
        with open(voiceover_path, 'wb') as f:
            f.write(r.content)
        
        # Get voiceover duration
        probe = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
             '-of', 'default=noprint_wrappers=1:nokey=1', voiceover_path],
            capture_output=True, text=True, check=True
        )
        duration = float(probe.stdout.strip())
        print(f"[V22] Voiceover duration: {duration}s")
        
        # 2. Download first image from animated_video_urls
        image_path = f"{job_dir}/image.png"
        if animated_video_urls and len(animated_video_urls) > 0:
            img_url = animated_video_urls[0].replace("turbo:", "")
            if img_url.startswith('data:'):
                _, data = img_url.split(',', 1)
                with open(image_path, 'wb') as f:
                    f.write(base64.b64decode(data))
            else:
                r = requests.get(img_url, timeout=60)
                r.raise_for_status()
                with open(image_path, 'wb') as f:
                    f.write(r.content)
            print(f"[V22] Image downloaded")
        else:
            # Create black fallback
            from PIL import Image as PILImage
            PILImage.new('RGB', (1080, 1920), color='black').save(image_path)
            print(f"[V22] Created black fallback image")
        
        # 3. Build FFmpeg command using -vf and -af (simple filters, auto-mapped)
        output_path = f"{job_dir}/output.mp4"
        
        # Use -vf for video filter (applies to last video input automatically)
        # Use -af for audio filter (applies to audio input automatically)
        video_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
        audio_filter = "aresample=44100,volume=2.0"
        
        cmd = [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'info',
            # Audio input first (will be audio source)
            '-i', voiceover_path,
            # Image input with loop (will be video source)
            '-loop', '1', '-t', str(duration), '-i', image_path,
            # Simple video filter on image input
            '-vf', video_filter,
            # Simple audio filter on audio input
            '-af', audio_filter,
            # Output duration
            '-t', str(duration),
            # Video codec settings
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
            '-preset', 'veryfast', '-b:v', '2M',
            # Audio codec settings
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            output_path
        ]
        
        print(f"[V22] FFmpeg command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        print(f"[V22] FFmpeg STDOUT: {result.stdout[:500] if result.stdout else 'none'}")
        print(f"[V22] FFmpeg STDERR: {result.stderr[:500] if result.stderr else 'none'}")
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg failed (code {result.returncode}): {result.stderr[-500:]}")
        
        # 4. Verify output
        if not os.path.exists(output_path):
            raise Exception("Output file missing")
        
        size = os.path.getsize(output_path)
        print(f"[V22] Output size: {size} bytes")
        
        if size < 1000:
            raise Exception(f"Output too small: {size} bytes")
        
        # Verify it's a valid video with ffprobe
        verify = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name',
             '-of', 'default=noprint_wrappers=1:nokey=1', output_path],
            capture_output=True, text=True
        )
        format_name = verify.stdout.strip()
        print(f"[V22] Format: {format_name}")
        
        if not format_name:
            # Try to get more info
            verify2 = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_format', output_path],
                capture_output=True, text=True
            )
            print(f"[V22] Full probe: {verify2.stdout[:500] if verify2.stdout else verify2.stderr[:500]}")
        
        if 'mp4' not in format_name.lower() and 'mov' not in format_name.lower() and format_name:
            raise Exception(f"Invalid format: {format_name}")
        
        # 5. Upload to Cloudinary
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            print(f"[V22] Uploading to Cloudinary...")
            import cloudinary.uploader
            cloudinary.config(cloudinary_url=cloudinary_url)
            r = cloudinary.uploader.upload(
                output_path, 
                resource_type="video", 
                folder="instagram-reels/renders", 
                public_id=f"re_{job_id}"
            )
            video_url = r['secure_url']
            print(f"[V22] Upload complete: {video_url}")
        else:
            with open(output_path, 'rb') as f:
                video_url = f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        
        return {"video_url": video_url, "render_id": job_id, "version": "V22"}
        
    except Exception as e:
        print(f"[V22] ERROR: {e}")
        raise
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)
