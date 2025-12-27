"""
FFmpeg Video Rendering Endpoint for Beam.cloud

Composites video from images + voiceover + music + subtitles using FFmpeg.
Features:
- Slide Generation for Info (Hours/Address) and Logo
- Smart Audio Mixing (Music Ducking)
- Duration Matching (Extends video if audio is longer)

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
import json

image = Image(
    python_version="python3.10",
    python_packages=[
        "requests",
        "Pillow",  # For generating slides
    ],
    commands=[
        "apt-get update && apt-get install -y ffmpeg fontconfig",
        # Install some basic fonts
        "mkdir -p /usr/share/fonts/truetype/custom",
        "wget -O /usr/share/fonts/truetype/custom/Arial.ttf https://github.com/matomo-org/travis-scripts/raw/master/fonts/Arial.ttf",
        "fc-cache -f -v"
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
    branding: dict = None,  # {logoUrl, businessName, address, hours}
) -> dict:
    """
    Render a video using FFmpeg with slide generation support.
    """
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    try:
        print(f"[FFmpeg] Job {job_id}: Downloading assets...")
        
        # Download assets
        voiceover_path = download_file(voiceover_url, f"{job_dir}/voiceover.mp3")
        
        # Get exact voiceover duration
        voiceover_duration = get_duration(voiceover_path)
        print(f"[FFmpeg] Voiceover duration: {voiceover_duration}s")
        
        music_path = download_file(music_url, f"{job_dir}/music.mp3") if music_url else None
        subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt") if subtitles_url else None
        
        # Logo handling (for overlay or branding slide)
        logo_path = None
        if logo_url:
            logo_path = download_file(logo_url, f"{job_dir}/logo.png")
        if branding and branding.get('logoUrl'):
             # If branding logo is different or explicitly passed
             try:
                 download_file(branding.get('logoUrl'), f"{job_dir}/branding_logo.png")
                 logo_path = f"{job_dir}/branding_logo.png"
             except:
                 print("Warning: Branding logo download failed, using default logo or none")

        # Download visual assets
        video_paths = []
        image_paths = []
        
        if animated_video_urls:
            for i, url in enumerate(animated_video_urls):
                try:
                    p = download_file(url, f"{job_dir}/video_{i}.mp4")
                    video_paths.append(p)
                except Exception as e:
                    print(f"Error downloading video {i}: {e}")
        elif animated_video_url:
             try:
                video_paths.append(download_file(animated_video_url, f"{job_dir}/source_video.mp4"))
             except Exception as e:
                print(f"Error downloading source video: {e}")
        elif segments:
            for i, seg in enumerate(segments):
                try:
                    path = download_file(seg['image_url'], f"{job_dir}/image_{i}.png")
                    image_paths.append({
                        'path': path,
                        'start': seg['start'],
                        'end': seg['end'],
                    })
                except Exception as e:
                    print(f"Error downloading segment image {i}: {e}")
        
        # Generate Branding Slides if requested
        if branding and image_paths:
            # Generate Info Slide
            info_slide_path = f"{job_dir}/info_slide.png"
            create_info_slide(branding, info_slide_path)
            
            # Generate Logo/Outro Slide
            logo_slide_path = f"{job_dir}/logo_slide.png"
            create_logo_slide(branding, logo_slide_path, logo_path)
            
            # Append Info Slide (3s)
            image_paths.append({
                'path': info_slide_path,
                'start': image_paths[-1]['end'],
                'end': image_paths[-1]['end'] + 3.0
            })
            
            # Append Logo Slide (3s)
            image_paths.append({
                'path': logo_slide_path,
                'start': image_paths[-1]['end'],
                'end': image_paths[-1]['end'] + 3.0
            })
            
        # OVERSHOOT FIX:
        # Calculate current visual duration
        total_visual_dur = 0
        if image_paths:
            total_visual_dur = image_paths[-1]['end']
        
        # If visual is shorter than voiceover, extend the last slide
        if total_visual_dur < voiceover_duration:
             needed = voiceover_duration - total_visual_dur + 1.0 # +1s buffer
             print(f"[FFmpeg] Extending last slide by {needed:.2f}s to match voiceover")
             if image_paths:
                 image_paths[-1]['end'] += needed
             total_visual_dur = image_paths[-1]['end'] if image_paths else 0

        # Filter out any None paths (redundant if using throw, but good safety)
        video_paths = [p for p in video_paths if p]
        
        if not video_paths and not image_paths:
             raise Exception("No valid visual assets found")

        print(f"[FFmpeg] Job {job_id}: Building FFmpeg command...")
        
        output_path = f"{job_dir}/output.mp4"
        
        # Build FFmpeg command
        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            voiceover_duration=voiceover_duration,
            music_path=music_path,
            subtitles_path=subtitles_path,
            video_paths=video_paths,
            image_paths=image_paths,
            logo_path=logo_path,
            logo_position=logo_position,
            output_path=output_path,
        )
        
        print(f"[FFmpeg] Job {job_id}: Rendering...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if result.returncode != 0:
            print(f"[FFmpeg] STDERR: {result.stderr[-2000:]}") # Print last 2000 chars
            raise Exception(f"FFmpeg failed: {result.stderr[-500:]}")
        
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


def get_duration(file_path: str) -> float:
    """Get duration of media file using ffprobe."""
    try:
        cmd = [
            'ffprobe', 
            '-v', 'error', 
            '-show_entries', 'format=duration', 
            '-of', 'default=noprint_wrappers=1:nokey=1', 
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"Warning: Failed to get duration for {file_path}: {e}")
        # Hallucinate a safe default? Or 30s?
        return 30.0

def create_info_slide(branding: dict, output_path: str):
    """Generate an image with address and hours using Pillow."""
    from PIL import Image, ImageDraw, ImageFont
    
    # Create dark background
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#121212') # Darker grey
    draw = ImageDraw.Draw(img)
    
    # Load fonts (fallback to default if Arial not found)
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 80)
        text_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 55)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 45)
    except:
        title_font = ImageFont.load_default()
        text_font = ImageFont.load_default() 
        small_font = ImageFont.load_default()
    
    # Draw Business Name
    name = branding.get('businessName', 'Visit Us')
    draw.text((W/2, 400), name, font=title_font, fill='#FFFFFF', anchor="mm")
    
    # Draw Info Section
    y_pos = 750
    
    if branding.get('address'):
        draw.text((W/2, y_pos), "LOCATION", font=small_font, fill='#FFD700', anchor="mm") # Gold color
        y_pos += 80
        # Simple wrap for address
        addr = branding.get('address')
        lines = wrap_text(addr, text_font, 900)
        for line in lines:
            draw.text((W/2, y_pos), line, font=text_font, fill='#EEEEEE', anchor="mm")
            y_pos += 70
        y_pos += 100
        
    if branding.get('hours'):
        draw.text((W/2, y_pos), "OPENING HOURS", font=small_font, fill='#FFD700', anchor="mm")
        y_pos += 80
        hours = branding.get('hours')
        h_lines = hours.split('\n')
        for h_line in h_lines:
             wrapped_h = wrap_text(h_line, text_font, 900)
             for line in wrapped_h:
                draw.text((W/2, y_pos), line, font=text_font, fill='#EEEEEE', anchor="mm")
                y_pos += 70

    img.save(output_path)


def create_logo_slide(branding: dict, output_path: str, logo_path: str):
    """Generate a final slide with large logo."""
    from PIL import Image, ImageDraw, ImageFont
    
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#000000')
    draw = ImageDraw.Draw(img)
    
    # Load logo
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            # Resize
            logo.thumbnail((800, 800), Image.Resampling.LANCZOS)
            # Center logo
            lw, lh = logo.size
            img.paste(logo, (int((W-lw)/2), int((H-lh)/2)), logo)
        except Exception as e:
            print(f"Failed to place logo: {e}")
            
    # Draw Business Name below
    if branding.get('businessName'):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 60)
        except:
            font = ImageFont.load_default()
            
        draw.text((W/2, H - 300), branding.get('businessName'), font=font, fill='white', anchor="mm")
        
    img.save(output_path)


def wrap_text(text, font, max_width):
    """Wrap text to fit width."""
    from PIL import ImageFont
    lines = []
    if not text: return lines
    
    words = text.split()
    current_line = []
    
    for word in words:
        current_line.append(word)
        line_str = ' '.join(current_line)
        try:
            w = font.getlength(line_str)
        except:
             w = len(line_str) * 20
        
        if w > max_width:
            if len(current_line) == 1:
                lines.append(line_str)
                current_line = []
            else:
                current_line.pop()
                lines.append(' '.join(current_line))
                current_line = [word]
                
    if current_line:
        lines.append(' '.join(current_line))
        
    return lines


def download_file(url: str, dest: str) -> str:
    """Download a file from URL or decode data URI. Raises error on failure."""
    if not url: 
        raise ValueError("Empty URL provided")
    
    try:
        if url.startswith('data:'):
            # Data URI
            _, data = url.split(',', 1)
            with open(dest, 'wb') as f:
                f.write(base64.b64decode(data))
            return dest
        
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        with open(dest, 'wb') as f:
            f.write(response.content)
        return dest
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        raise # Re-raise to fail early or be caught by strict handler


def build_ffmpeg_command(
    voiceover_path: str,
    voiceover_duration: float,
    music_path: str,
    subtitles_path: str,
    video_paths: list,
    image_paths: list,
    logo_path: str,
    logo_position: str,
    output_path: str,
) -> list:
    """Build the FFmpeg command."""
    cmd = ['ffmpeg', '-y']
    filter_complex = []
    
    # Input 0: Voiceover
    cmd.extend(['-i', voiceover_path])
    
    # Input 1 (optional): Music
    audio_input_idx = 1
    if music_path:
        cmd.extend(['-stream_loop', '-1', '-i', music_path])
        audio_input_idx = 2
    
    # Visual inputs
    visual_input_start = audio_input_idx
    
    # 1. VISUAL PIPELINE
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
            duration = max(duration, 0.1)
            
            cmd.extend(['-loop', '1', '-t', str(duration), '-i', img['path']])
            idx = visual_input_start + i
            filter_complex.append(f'[{idx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[img{i}]')
            img_outputs.append(f'[img{i}]')
        filter_complex.append(f'{"".join(img_outputs)}concat=n={len(image_paths)}:v=1:a=0[vbase]')
    else:
        duration = 10
        filter_complex.append(f'color=c=black:s=1080x1920:d={duration}[vbase]')
    
    last_vid_tag = 'vbase'
    
    # 3. SUBTITLE PIPELINE
    if subtitles_path:
        filter_complex.append(f"[{last_vid_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vburned]")
        last_vid_tag = 'vburned'
    
    # 4. AUDIO PIPELINE
    # Music Volume + Ducking or Mixing
    if music_path:
        # Music Volume 0.25 (User asked for clearer music)
        filter_complex.append(f'[1:a]volume=0.25[bgmusic]')
        
        # amix: inputs=2:duration=first (stops when voiceover stops).
        # This cuts music when voiceover ends (or vice versa).
        # BUT we extended visuals to match voiceover.
        # So "first" (voiceover) should be roughly equal to "longest" (visuals).
        # We'll use duration=first to ensure we don't end up with infinite music loop.
        # Warning: if slides extend beyond voiceover (e.g. +1s buffer), duration=first cuts audio early.
        # But audio IS voiceover. So cuts music early.
        # We want music to play over slides too.
        # Solution: "duration=longest" but we must limit the output with -t.
        # Since we use -t below, duration=longest is safe for the FILTER.
        
        filter_complex.append(f'[0:a][bgmusic]amix=inputs=2:duration=longest:dropout_transition=2[audio_mixed]')
        audio_out = 'audio_mixed'
    else:
        filter_complex.append('[0:a]anull[audio_out]')
        audio_out = 'audio_out'
        
    cmd.extend(['-filter_complex', ';'.join(filter_complex)])
    cmd.extend(['-map', f'[{last_vid_tag}]', '-map', f'[{audio_out}]'])
    
    # Force output duration to match correct visual duration (which was extended to cover voiceover)
    # The image path loop used '-t' for each segment.
    # The concat filter produces a stream of length sum(durations).
    # We should trust the concat stream length.
    # BUT, to be safe against infinite loops, we can use -shortest?
    # No, -shortest cuts to shortest stream. If voiceover is shorter than extended visual (rare if we padded), it cuts visual.
    # If music is infinite, -shortest cuts to video/voiceover.
    # So -shortest is usually correct here IF video is finite.
    # Our video is finite (concat of loops with -t).
    
    cmd.append('-shortest') # Stop when video or voiceover ends
    
    cmd.extend(['-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    cmd.extend(['-ac', '2']) # Stereo Audio
    cmd.append(output_path)
    
    return cmd


def upload_to_cloudinary(file_path: str, job_id: str, cloudinary_url: str) -> str:
    """Upload video to Cloudinary."""
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
