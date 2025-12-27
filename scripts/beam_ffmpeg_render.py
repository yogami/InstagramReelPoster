"""
FFmpeg Video Rendering Endpoint for Beam.cloud

Composites video from images + voiceover + music + subtitles using FFmpeg.
Does NOT require GPU - runs on CPU only.

Deploy with:
    beam deploy beam_ffmpeg_render.py:render_video
"""

from beam import endpoint, Image, Volume
import os
import subprocess
import requests
import base64
from urllib.parse import urlparse
import uuid


image = Image(
    python_version="python3.10",
    python_packages=[
        "requests",
    ],
    commands=[
        "apt-get update && apt-get install -y ffmpeg",
    ],
)

storage_volume = Volume(name="ffmpeg-render-cache", mount_path="/cache")


@endpoint(
    name="ffmpeg-render",
    image=image,
    cpu=4,
    memory="8Gi",
    volumes=[storage_volume],
    keep_warm_seconds=60,
    secrets=["CLOUDINARY_URL"],  # For uploading the result
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
) -> dict:
    """
    Render a video using FFmpeg.
    
    Args:
        voiceover_url: URL to the voiceover audio
        segments: List of {image_url, start, end} for image-based videos
        animated_video_url: Single animated video URL (alternative to segments)
        animated_video_urls: Multiple animated video URLs to concatenate
        music_url: Optional background music URL
        subtitles_url: Optional subtitles URL (SRT or data URI)
        duration_seconds: Target duration
        logo_url: Optional logo overlay URL
        logo_position: 'beginning', 'end', or 'overlay'
    
    Returns:
        dict with video_url (data URI or Cloudinary URL)
    """
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    try:
        print(f"[FFmpeg] Job {job_id}: Downloading assets...")
        
        # Download assets
        voiceover_path = download_file(voiceover_url, f"{job_dir}/voiceover.mp3")
        music_path = download_file(music_url, f"{job_dir}/music.mp3") if music_url else None
        subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt") if subtitles_url else None
        logo_path = download_file(logo_url, f"{job_dir}/logo.png") if logo_url else None
        
        # Download visual assets
        video_paths = []
        image_paths = []
        
        if animated_video_urls:
            for i, url in enumerate(animated_video_urls):
                video_paths.append(download_file(url, f"{job_dir}/video_{i}.mp4"))
        elif animated_video_url:
            video_paths.append(download_file(animated_video_url, f"{job_dir}/source_video.mp4"))
        elif segments:
            for i, seg in enumerate(segments):
                image_paths.append({
                    'path': download_file(seg['image_url'], f"{job_dir}/image_{i}.png"),
                    'start': seg['start'],
                    'end': seg['end'],
                })
        
        print(f"[FFmpeg] Job {job_id}: Building FFmpeg command...")
        
        output_path = f"{job_dir}/output.mp4"
        
        # Build FFmpeg command
        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            music_path=music_path,
            subtitles_path=subtitles_path,
            video_paths=video_paths,
            image_paths=image_paths,
            logo_path=logo_path,
            logo_position=logo_position,
            duration_seconds=duration_seconds,
            output_path=output_path,
        )
        
        print(f"[FFmpeg] Job {job_id}: Rendering...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"[FFmpeg] STDERR: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr[:500]}")
        
        print(f"[FFmpeg] Job {job_id}: Uploading result...")
        
        # Upload to Cloudinary if configured, else return base64
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            video_url = upload_to_cloudinary(output_path, job_id, cloudinary_url)
        else:
            video_url = file_to_data_uri(output_path)
        
        print(f"[FFmpeg] Job {job_id}: Complete!")
        
        return {
            "video_url": video_url,
            "render_id": job_id,
        }
    finally:
        # Cleanup
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)


def download_file(url: str, dest: str) -> str:
    """Download a file from URL or decode data URI."""
    if url.startswith('data:'):
        # Data URI
        _, data = url.split(',', 1)
        with open(dest, 'wb') as f:
            f.write(base64.b64decode(data))
        return dest
    
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    with open(dest, 'wb') as f:
        f.write(response.content)
    return dest


def build_ffmpeg_command(
    voiceover_path: str,
    music_path: str,
    subtitles_path: str,
    video_paths: list,
    image_paths: list,
    logo_path: str,
    logo_position: str,
    duration_seconds: float,
    output_path: str,
) -> list:
    """Build the FFmpeg command."""
    cmd = ['ffmpeg', '-y']
    filter_complex = []
    
    # Input 0: Voiceover
    cmd.extend(['-i', voiceover_path])
    
    # Input 1 (optional): Music
    audio_input_offset = 1
    if music_path:
        cmd.extend(['-stream_loop', '-1', '-i', music_path])
        audio_input_offset = 2
    
    # Visual inputs
    visual_input_start = audio_input_offset
    
    if video_paths:
        if len(video_paths) == 1:
            cmd.extend(['-stream_loop', '-1', '-i', video_paths[0]])
            filter_complex.append(f'[{visual_input_start}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vbase]')
        else:
            for vp in video_paths:
                cmd.extend(['-i', vp])
            concat_parts = ''
            for i in range(len(video_paths)):
                idx = visual_input_start + i
                filter_complex.append(f'[{idx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v{i}]')
                concat_parts += f'[v{i}]'
            filter_complex.append(f'{concat_parts}concat=n={len(video_paths)}:v=1:a=0[vbase]')
    elif image_paths:
        img_outputs = []
        for i, img in enumerate(image_paths):
            duration = img['end'] - img['start']
            cmd.extend(['-loop', '1', '-t', str(duration), '-i', img['path']])
            idx = visual_input_start + i
            filter_complex.append(f'[{idx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[img{i}]')
            img_outputs.append(f'[img{i}]')
        filter_complex.append(f'{"".join(img_outputs)}concat=n={len(image_paths)}:v=1:a=0[vbase]')
    else:
        raise Exception("No visual source provided")
    
    # Subtitles
    if subtitles_path:
        filter_complex.append(f"[vbase]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vburned]")
        video_out = 'vburned'
    else:
        video_out = 'vbase'
    
    # Audio mixing
    if music_path:
        filter_complex.append('[1:a]volume=0.2[bgmusic]')
        filter_complex.append('[0:a][bgmusic]amix=inputs=2:duration=first[audio_out]')
    else:
        filter_complex.append('[0:a]anull[audio_out]')
    
    # Build command
    cmd.extend(['-filter_complex', ';'.join(filter_complex)])
    cmd.extend(['-map', f'[{video_out}]', '-map', '[audio_out]'])
    cmd.extend(['-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-shortest', '-movflags', '+faststart'])
    cmd.append(output_path)
    
    return cmd


def upload_to_cloudinary(file_path: str, job_id: str, cloudinary_url: str) -> str:
    """Upload video to Cloudinary and return URL."""
    import cloudinary
    import cloudinary.uploader
    
    cloudinary.config(cloudinary_url=cloudinary_url)
    
    result = cloudinary.uploader.upload(
        file_path,
        resource_type="video",
        folder="instagram-reels/renders",
        public_id=f"reel_{job_id}",
    )
    return result['secure_url']


def file_to_data_uri(file_path: str) -> str:
    """Convert file to base64 data URI."""
    with open(file_path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('utf-8')
    return f"data:video/mp4;base64,{data}"
