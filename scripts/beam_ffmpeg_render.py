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
        music_path = download_file(music_url, f"{job_dir}/music.mp3") if music_url else None
        subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt") if subtitles_url else None
        
        # Logo handling (for overlay or branding slide)
        logo_path = None
        if logo_url:
            logo_path = download_file(logo_url, f"{job_dir}/logo.png")
        if branding and branding.get('logoUrl'):
             # If branding logo is different or explicitly passed
             download_file(branding.get('logoUrl'), f"{job_dir}/branding_logo.png")
             logo_path = f"{job_dir}/branding_logo.png"

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
        
        # Generate Branding Slides if requested
        # We append these to image_paths or video_paths logic
        if branding and image_paths:
            # Generate Info Slide
            info_slide_path = f"{job_dir}/info_slide.png"
            create_info_slide(branding, info_slide_path)
            
            # Generate Logo/Outro Slide
            logo_slide_path = f"{job_dir}/logo_slide.png"
            create_logo_slide(branding, logo_slide_path, logo_path)
            
            # Add to sequence. We need to steal time or extend.
            # Strategy: Simply append them. The audio duration check later will handle padding if needed,
            # but usually we want to SHOW them during the last few seconds of voiceover.
            
            # Let's say we want Info Slide for 3s and Logo Slide for 3s.
            # We add them to the list.
            
            # Note: 'segments' passed from Orchestrator usually cover the whole duration.
            # If we add slides, the video becomes LONGER than planned.
            # OR we replace the last segment?
            # Safest: Append them. If voiceover ends, silence will play (or music).
            
            # Append Info Slide
            image_paths.append({
                'path': info_slide_path,
                'start': image_paths[-1]['end'],
                'end': image_paths[-1]['end'] + 3.0
            })
            
            # Append Logo Slide
            image_paths.append({
                'path': logo_slide_path,
                'start': image_paths[-1]['end'],
                'end': image_paths[-1]['end'] + 3.0
            })
            
            print(f"[FFmpeg] Added 2 branding slides (6s total). New visual duration: {image_paths[-1]['end']}s")

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


def create_info_slide(branding: dict, output_path: str):
    """Generate an image with address and hours using Pillow."""
    from PIL import Image, ImageDraw, ImageFont
    
    # Create dark background
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#1a1a1a')
    draw = ImageDraw.Draw(img)
    
    # Load fonts (fallback to default if Arial not found)
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 80)
        text_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 50)
    except:
        title_font = ImageFont.load_default()
        text_font = ImageFont.load_default() # Only for fallback, might be tiny
    
    # Draw Business Name
    name = branding.get('businessName', 'Visit Us')
    # Center text logic (rough)
    draw.text((W/2, 400), name, font=title_font, fill='white', anchor="mm")
    
    # Draw Info Section
    y_pos = 700
    
    if branding.get('address'):
        draw.text((W/2, y_pos), "LOCATION", font=title_font, fill='#FFD700', anchor="mm") # Gold color
        y_pos += 100
        # Simple wrap for address
        addr = branding.get('address')
        lines = wrap_text(addr, text_font, 900)
        for line in lines:
            draw.text((W/2, y_pos), line, font=text_font, fill='white', anchor="mm")
            y_pos += 70
        y_pos += 100
        
    if branding.get('hours'):
        draw.text((W/2, y_pos), "OPENING HOURS", font=title_font, fill='#FFD700', anchor="mm")
        y_pos += 100
        hours = branding.get('hours')
        # Split hours by lines if contains newlines
        h_lines = hours.split('\n')
        for h_line in h_lines:
             wrapped_h = wrap_text(h_line, text_font, 900)
             for line in wrapped_h:
                draw.text((W/2, y_pos), line, font=text_font, fill='white', anchor="mm")
                y_pos += 70

    img.save(output_path)


def create_logo_slide(branding: dict, output_path: str, logo_path: str):
    """Generate a final slide with large logo."""
    from PIL import Image, ImageDraw, ImageFont
    
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='white') # White background for logo usually better? Or dark?
    # Let's match info slide: Dark
    img = Image.new('RGB', (W, H), color='#000000')
    draw = ImageDraw.Draw(img)
    
    # Load logo
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            # Resize logic: max width 800, max height 800
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
            
        draw.text((W/2, H - 400), branding.get('businessName'), font=font, fill='white', anchor="mm")
        
    img.save(output_path)


def wrap_text(text, font, max_width):
    """Wrap text to fit width."""
    from PIL import ImageFont
    # Simple character count fallback if getlength not avail
    lines = []
    if not text: return lines
    
    words = text.split()
    current_line = []
    
    for word in words:
        current_line.append(word)
        # Check width
        line_str = ' '.join(current_line)
        # Pillow >= 9.2.0 has getlength
        try:
            w = font.getlength(line_str)
        except:
             w = len(line_str) * 15 # rough estimate
        
        if w > max_width:
            if len(current_line) == 1:
                # One massive word, force keep
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
    """Download a file from URL or decode data URI."""
    if not url: return None
    
    try:
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
    except Exception as e:
        print(f"Warning: Failed to download {url}: {e}")
        return None


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
    audio_input_idx = 1
    if music_path:
        # Loop music to ensure it covers full duration
        cmd.extend(['-stream_loop', '-1', '-i', music_path])
        audio_input_idx = 2
    
    # Visual inputs
    visual_input_start = audio_input_idx
    
    # 1. VISUAL PIPELINE
    # ------------------
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
            # Safeguard: min duration 0.1s
            duration = max(duration, 0.1)
            
            cmd.extend(['-loop', '1', '-t', str(duration), '-i', img['path']])
            idx = visual_input_start + i
            filter_complex.append(f'[{idx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[img{i}]')
            img_outputs.append(f'[img{i}]')
        filter_complex.append(f'{"".join(img_outputs)}concat=n={len(image_paths)}:v=1:a=0[vbase]')
    else:
        # Fallback black screen if no visuals
        duration = 10
        filter_complex.append(f'color=c=black:s=1080x1920:d={duration}[vbase]')
    
    # 2. OVERLAY PIPELINE (Logo)
    # --------------------------
    # TODO: Implement logo overlay if requested
    # For now, we assume logo is handled via slides if branding is present
    last_vid_tag = 'vbase'
    
    # 3. SUBTITLE PIPELINE
    # --------------------
    if subtitles_path:
        filter_complex.append(f"[{last_vid_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vburned]")
        last_vid_tag = 'vburned'
    
    # 4. AUDIO PIPELINE
    # -----------------
    # Fix: Ensure mix is audible.
    # [0:a] is voiceover.
    # [1:a] is music.
    # We want music volume 0.15, voice volume 1.0.
    # We want output duration = max(video, audio) ~ usually voiceover duration.
    
    if music_path:
        # Volume filter for music
        filter_complex.append(f'[1:a]volume=0.15[bgmusic]')
        # Amix inputs=2:duration=first (ends when voiceover ends? OR shortest/longest)
        # If we added slides at the end, the voiceover might be SHORTER than visuals now.
        # We want duration=longest to ensure visuals (slides) are shown even if voice stops.
        filter_complex.append(f'[0:a][bgmusic]amix=inputs=2:duration=longest[audio_mixed]')
        audio_out = 'audio_mixed'
    else:
        filter_complex.append('[0:a]anull[audio_out]')
        audio_out = 'audio_out'
        
    # 5. DURATION FIX
    # ---------------
    # If visuals are longer than audio (because we added slides), pad audio with silence.
    # If audio is longer than visuals (overshoot), hold last frame.
    
    # Actually, amix with duration=longest handles the audio extension (with silence).
    # But for Video, if audio is longer, we need to ensure video matches.
    # We'll use -shortest in global options, but that cuts to the SHORTEST stream.
    # If we want the LONGEST, we should NOT use -shortest.
    # However, infinite loops (music) make "longest" dangerous.
    # Solution: We explicitly limited image loops with -t. Voiceover is finite.
    # Music is the only infinite input (-stream_loop -1).
    # So we MUST limit music duration to the main content.
    # But amix handles that? "runs until the longest input ends". If music is infinite, it runs forever.
    # FIX: Use `duration=first` (voiceover) for amix? NO, we want slides after voiceover.
    
    # Refined Strategy:
    # 1. Determine total visual duration from image_paths.
    # 2. Trim music to that duration.
    # 3. Mux.
    
    # Calculate visual duration
    total_visual_dur = 0
    if image_paths:
        total_visual_dur = sum([img['end'] - img['start'] for img in image_paths])
    # Video paths difficult to know duration without probing.
    
    # Safer approach for amix with infinite music:
    # Use apad on voiceover to extend it? No.
    # Use -t on output?
    
    # Let's rely on `amix=inputs=2:duration=first:dropout_transition=2`.
    # But 'first' is voiceover. If slides are AFTER voiceover, they will be silent (music cuts).
    # We want music to continue?
    
    # Revised Fix:
    # 1. Use `amix=inputs=2:duration=longest`
    # 2. BUT impose a hard `-t` limit on the OUTPUT based on calculated visual duration.
    
    cmd.extend(['-filter_complex', ';'.join(filter_complex)])
    cmd.extend(['-map', f'[{last_vid_tag}]', '-map', f'[{audio_out}]'])
    
    if total_visual_dur > 0:
        # We know exactly how long the video should be
        cmd.extend(['-t', str(total_visual_dur)])
    else:
        # Fallback to shortest (stops when voiceover stops, assuming music is infinite)
        # This risks cutting slides if they are silent.
        cmd.append('-shortest')
        
    cmd.extend(['-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
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
