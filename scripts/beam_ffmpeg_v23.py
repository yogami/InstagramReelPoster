"""
FFmpeg Video Rendering Endpoint for Beam.cloud - V23 EXPLICIT MAPPING
Uses explicit -map with -vf/-af to ensure proper stream muxing.

Deploy with:
    beam deploy scripts/beam_ffmpeg_v23.py:render_video --name ffmpeg-v23-mapped
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

storage_volume = Volume(name="ffmpeg-v23-cache", mount_path="/cache")


@endpoint(
    name="ffmpeg-v23",
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
    """Video rendering with explicit stream mapping."""
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    print(f"[V23] ===== Job {job_id} =====")
    
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
        print(f"[V23] Voiceover duration: {duration}s")
        
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
            print(f"[V23] Image downloaded")
        else:
            # Create black fallback
            from PIL import Image as PILImage
            PILImage.new('RGB', (1080, 1920), color='black').save(image_path)
            print(f"[V23] Created black fallback image")
        
        # 3. Build FFmpeg command with explicit mapping
        output_path = f"{job_dir}/output.mp4"
        
        # Video filter for the image input (input 1)
        video_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
        
        # Build command with EXPLICIT mapping of both streams
        cmd = [
            'ffmpeg', '-y',
            # Image input with loop (will be video source - input 0)
            '-loop', '1', '-framerate', '24', '-t', str(duration), '-i', image_path,
            # Audio input (input 1)
            '-i', voiceover_path,
            # Apply video filter to input 0 (image)
            '-vf', video_filter,
            # Explicitly map filtered video (from input 0) and audio (from input 1)
            '-map', '0:v',
            '-map', '1:a',
            # Limit to voiceover duration
            '-t', str(duration),
            '-shortest',
            # Video codec - use slower preset for better output
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
            # Audio codec
            '-c:a', 'aac', '-b:a', '128k',
            # Pixel format and faststart
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            output_path
        ]
        
        print(f"[V23] FFmpeg command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        print(f"[V23] FFmpeg return code: {result.returncode}")
        if result.stderr:
            # Only print last 1000 chars of stderr
            print(f"[V23] FFmpeg STDERR (last 1000): {result.stderr[-1000:]}")
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg failed (code {result.returncode})")
        
        # 4. Verify output exists and has size
        if not os.path.exists(output_path):
            raise Exception("Output file missing")
        
        size = os.path.getsize(output_path)
        print(f"[V23] Output size: {size} bytes")
        
        if size < 1000:
            raise Exception(f"Output too small: {size} bytes")
        
        # Verify moov atom exists
        verify = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name,duration',
             '-show_entries', 'stream=codec_type,codec_name',
             '-of', 'json', output_path],
            capture_output=True, text=True
        )
        print(f"[V23] Probe result: {verify.stdout[:500] if verify.stdout else verify.stderr[:500]}")
        
        # Check for valid format
        if verify.returncode != 0:
            raise Exception(f"Output not valid: {verify.stderr}")
        
        # 5. Upload to Cloudinary
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            print(f"[V23] Uploading to Cloudinary...")
            import cloudinary.uploader
            cloudinary.config(cloudinary_url=cloudinary_url)
            r = cloudinary.uploader.upload(
                output_path, 
                resource_type="video", 
                folder="instagram-reels/renders", 
                public_id=f"re_{job_id}"
            )
            video_url = r['secure_url']
            print(f"[V23] Upload complete: {video_url}")
        else:
            with open(output_path, 'rb') as f:
                video_url = f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        
        return {"video_url": video_url, "render_id": job_id, "version": "V23"}
        
    except Exception as e:
        print(f"[V23] ERROR: {e}")
        raise
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)
