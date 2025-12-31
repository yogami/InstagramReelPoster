"""
FFmpeg Video Rendering Endpoint for Beam.cloud - V21 NO NAMED STREAMS
Uses direct stream index mapping to avoid Beam.cloud bracket stripping.

Deploy with:
    beam deploy scripts/beam_ffmpeg_v21.py:render_video --name ffmpeg-v21-nonames
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

storage_volume = Volume(name="ffmpeg-v21-cache", mount_path="/cache")


@endpoint(
    name="ffmpeg-v21",
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
    """Minimal video rendering WITHOUT named streams."""
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    print(f"[V21] ===== Job {job_id} =====")
    
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
        print(f"[V21] Voiceover duration: {duration}s")
        
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
            print(f"[V21] Image downloaded")
        else:
            # Create black fallback
            from PIL import Image as PILImage
            PILImage.new('RGB', (1080, 1920), color='black').save(image_path)
            print(f"[V21] Created black fallback image")
        
        # 3. Build FFmpeg command WITHOUT named streams
        # Use direct stream mapping: no filter_complex output labels
        output_path = f"{job_dir}/output.mp4"
        
        # Simplified command: no named stream outputs, direct mapping
        cmd = [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'info',
            '-i', voiceover_path,  # Input 0: audio
            '-loop', '1', '-t', str(duration), '-i', image_path,  # Input 1: image
            '-filter_complex',
            # Video filter on input 1, audio filter on input 0
            # Using splits to create multiple outputs without named labels
            '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p',
            '-map', '0:a',  # Map audio from input 0
            '-t', str(duration),
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
            '-preset', 'veryfast', '-b:v', '2M',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            output_path
        ]
        
        print(f"[V21] FFmpeg command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"[V21] FFmpeg STDERR: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr[-500:]}")
        
        # 4. Verify output
        if not os.path.exists(output_path):
            raise Exception("Output file missing")
        
        size = os.path.getsize(output_path)
        print(f"[V21] Output size: {size} bytes")
        
        if size < 1000:
            raise Exception(f"Output too small: {size} bytes")
        
        # Verify it's a valid video with ffprobe
        verify = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name',
             '-of', 'default=noprint_wrappers=1:nokey=1', output_path],
            capture_output=True, text=True
        )
        print(f"[V21] Format: {verify.stdout.strip()}")
        
        if 'mp4' not in verify.stdout.lower() and 'mov' not in verify.stdout.lower():
            raise Exception(f"Invalid format: {verify.stdout}")
        
        # 5. Upload to Cloudinary
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            print(f"[V21] Uploading to Cloudinary...")
            import cloudinary.uploader
            cloudinary.config(cloudinary_url=cloudinary_url)
            r = cloudinary.uploader.upload(
                output_path, 
                resource_type="video", 
                folder="instagram-reels/renders", 
                public_id=f"re_{job_id}"
            )
            video_url = r['secure_url']
            print(f"[V21] Upload complete: {video_url}")
        else:
            with open(output_path, 'rb') as f:
                video_url = f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        
        return {"video_url": video_url, "render_id": job_id, "version": "V21"}
        
    except Exception as e:
        print(f"[V21] ERROR: {e}")
        raise
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)
