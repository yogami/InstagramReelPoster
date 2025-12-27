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
        print(f"[FFmpeg] Job {job_id}: Processing...")
        print(f"[FFmpeg] Parameters: voiceover={bool(voiceover_url)}, music={bool(music_url)}, segments={len(segments) if segments else 0}")
        
        # Download voiceover
        try:
            voiceover_path = download_file(voiceover_url, f"{job_dir}/voiceover.mp3")
            voiceover_duration = get_duration(voiceover_path)
            print(f"[FFmpeg] Voiceover duration: {voiceover_duration}s")
        except Exception as e:
            raise Exception(f"Failed to download or parse voiceover: {e}")
            
        # Download music
        music_path = None
        if music_url:
            try:
                print(f"[FFmpeg] Downloading music from: {music_url[:50]}...")
                music_path = download_file(music_url, f"{job_dir}/music.mp3")
                print(f"[FFmpeg] Music downloaded successfully: {music_path}")
                # Verify music has audio stream
                mus_dur = get_duration(music_path)
                print(f"[FFmpeg] Music file duration: {mus_dur}s")
            except Exception as e:
                print(f"[FFmpeg] Warning: Music download or probe failed: {e}. Proceeding without music.")
                music_path = None
        
        # Download subtitles
        subtitles_path = None
        if subtitles_url:
            try:
                subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt")
            except:
                print("Warning: Subtitles download failed")
        
        # Logo handling
        logo_path = None
        if logo_url:
             try:
                logo_path = download_file(logo_url, f"{job_dir}/logo.png")
             except: pass
        if branding and branding.get('logoUrl'):
             try:
                 p = download_file(branding.get('logoUrl'), f"{job_dir}/branding_logo.png")
                 logo_path = p
             except: pass

        # Download visual assets
        video_paths = []
        image_paths = []
        
        # Create a blank black placeholder
        black_img = f"{job_dir}/black.png"
        from PIL import Image as PILImage
        PILImage.new('RGB', (1080, 1920), color='black').save(black_img)
        
        if animated_video_urls:
            for i, url in enumerate(animated_video_urls):
                try:
                    video_paths.append(download_file(url, f"{job_dir}/video_{i}.mp4"))
                except:
                    print(f"Error downloading video {i}")
        elif animated_video_url:
             try:
                video_paths.append(download_file(animated_video_url, f"{job_dir}/source_video.mp4"))
             except: pass
        elif segments:
            for i, seg in enumerate(segments):
                try:
                    path = download_file(seg['image_url'], f"{job_dir}/image_{i}.png")
                except:
                    print(f"Error downloading segment image {i}, using black placeholder")
                    path = black_img
                
                image_paths.append({
                    'path': path,
                    'start': seg['start'],
                    'end': seg['end'],
                })
        
        # Generate Branding Slides
        if branding:
            info_slide_path = f"{job_dir}/info_slide.png"
            create_info_slide(branding, info_slide_path)
            
            logo_slide_path = f"{job_dir}/logo_slide.png"
            create_logo_slide(branding, logo_slide_path, logo_path)
            
            # Use 4s each for branding slides
            info_dur = 4.0
            logo_dur = 4.0
            
            last_end = image_paths[-1]['end'] if image_paths else 0
            
            image_paths.append({
                'path': info_slide_path,
                'start': last_end,
                'end': last_end + info_dur
            })
            
            image_paths.append({
                'path': logo_slide_path,
                'start': last_end + info_dur,
                'end': last_end + info_dur + logo_dur
            })

        # OVERSHOOT FIX
        total_visual_dur = image_paths[-1]['end'] if image_paths else 0
        if total_visual_dur < voiceover_duration:
             needed = voiceover_duration - total_visual_dur + 0.5
             if image_paths:
                 image_paths[-1]['end'] += needed
             total_visual_dur = image_paths[-1]['end'] if image_paths else 0

        print(f"[FFmpeg] Final visual duration: {total_visual_dur}s")

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
            total_duration=total_visual_dur,
            output_path=output_path,
        )
        
        print(f"[FFmpeg] Job {job_id}: Executing FFmpeg...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if result.returncode != 0:
            print(f"[FFmpeg] ERROR: {result.stderr[-2000:]}")
            raise Exception(f"FFmpeg failed with exit code {result.returncode}")
        
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            video_url = upload_to_cloudinary(output_path, job_id, cloudinary_url)
        else:
            video_url = file_to_data_uri(output_path)
        
        print(f"[FFmpeg] Job {job_id}: Done!")
        return {
            "video_url": video_url,
            "render_id": job_id,
        }
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)


def get_duration(file_path: str) -> float:
    """Get duration using ffprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
            '-of', 'default=noprint_wrappers=1:nokey=1', file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"[FFmpeg] Warning ffprobe failed for {file_path}: {e}")
        return 30.0

def create_info_slide(branding: dict, output_path: str):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#0a0a0a')
    draw = ImageDraw.Draw(img)
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 85)
        text_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 55)
        label_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 45)
    except:
        title_font = text_font = label_font = ImageFont.load_default()
    
    draw.text((W/2, 400), branding.get('businessName', 'Visit Us'), font=title_font, fill='#FFFFFF', anchor="mm")
    y = 750
    if branding.get('address'):
        draw.text((W/2, y), "LOCATION", font=label_font, fill='#FFD700', anchor="mm")
        y += 85
        lines = wrap_text(branding.get('address'), text_font, 900)
        for line in lines:
            draw.text((W/2, y), line, font=text_font, fill='#DDDDDD', anchor="mm")
            y += 75
        y += 110
    if branding.get('hours'):
        draw.text((W/2, y), "OPENING HOURS", font=label_font, fill='#FFD700', anchor="mm")
        y += 85
        for h_line in branding.get('hours').split('\n'):
             for line in wrap_text(h_line, text_font, 900):
                draw.text((W/2, y), line, font=text_font, fill='#DDDDDD', anchor="mm")
                y += 75
    img.save(output_path)

def create_logo_slide(branding: dict, output_path: str, logo_path: str):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#000000')
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo.thumbnail((800, 800), Image.Resampling.LANCZOS)
            img.paste(logo, (int((W-logo.size[0])/2), int((H-logo.size[1])/2)), logo)
        except: pass
    if branding.get('businessName'):
        draw = ImageDraw.Draw(img)
        try: font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 65)
        except: font = ImageFont.load_default()
        draw.text((W/2, H - 350), branding.get('businessName'), font=font, fill='white', anchor="mm")
    img.save(output_path)

def wrap_text(text, font, max_width):
    lines = []
    if not text: return lines
    words = text.split()
    current = []
    for word in words:
        current.append(word)
        try: w = font.getlength(' '.join(current))
        except: w = len(' '.join(current)) * 25
        if w > max_width:
            if len(current) == 1: lines.append(current.pop()); current = []
            else: last = current.pop(); lines.append(' '.join(current)); current = [last]
    if current: lines.append(' '.join(current))
    return lines

def download_file(url: str, dest: str) -> str:
    if not url: raise ValueError("URL is empty")
    if url.startswith('data:'):
        _, data = url.split(',', 1)
        with open(dest, 'wb') as f: f.write(base64.b64decode(data))
        return dest
    r = requests.get(url, timeout=45)
    r.raise_for_status()
    with open(dest, 'wb') as f: f.write(r.content)
    return dest

def build_ffmpeg_command(
    voiceover_path: str,
    voiceover_duration: float,
    music_path: str,
    subtitles_path: str,
    video_paths: list,
    image_paths: list,
    logo_path: str,
    logo_position: str,
    total_duration: float,
    output_path: str,
) -> list:
    cmd = ['ffmpeg', '-y']
    filter_complex = []
    
    # Inputs
    cmd.extend(['-i', voiceover_path]) # Input 0 (Audio or Video with Audio)
    if music_path:
        # Loop music infinitely
        cmd.extend(['-stream_loop', '-1', '-i', music_path]) # Input 1
        a_idx = 2
    else:
        a_idx = 1
    
    # Visuals start index
    v_start = a_idx
    
    # Visual Concatenation
    if video_paths:
        if len(video_paths) == 1:
            cmd.extend(['-stream_loop', '-1', '-i', video_paths[0]])
            filter_complex.append(f'[{v_start}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vbase]')
        else:
            for vp in video_paths: cmd.extend(['-i', vp])
            parts = ''
            for i in range(len(video_paths)):
                filter_complex.append(f'[{v_start+i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v{i}]')
                parts += f'[v{i}]'
            filter_complex.append(f'{parts}concat=n={len(video_paths)}:v=1:a=0[vbase]')
    elif image_paths:
        img_outs = []
        for i, img in enumerate(image_paths):
            dur = max(img['end'] - img['start'], 0.1)
            cmd.extend(['-loop', '1', '-t', str(dur), '-i', img['path']])
            filter_complex.append(f'[{v_start+i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[im{i}]')
            img_outs.append(f'[im{i}]')
        filter_complex.append(f'{"".join(img_outs)}concat=n={len(image_paths)}:v=1:a=0[vbase]')
    
    v_tag = 'vbase'
    if subtitles_path:
        filter_complex.append(f"[{v_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vburned]")
        v_tag = 'vburned'
    
    # AUDIO MIXING (V5 REMASTERED)
    # We explicitly target the first audio stream of each input [index:a:0]
    # We use pan to ensure stereo and then amix.
    
    # Voiceover Processing
    filter_complex.append(f'[0:a:0]aresample=44100,pan=stereo|c0=c0|c1=c1[vo_ready]')
    
    if music_path:
        # Music Processing (Higher volume 0.45)
        filter_complex.append(f'[1:a:0]aresample=44100,pan=stereo|c0=c0|c1=c1,volume=0.45[bg_ready]')
        
        # amix: duration=longest ensures music plays even if voiceover is slightly shorter (due to padding/slides)
        # We rely on -t to cut the infinite music stream.
        filter_complex.append(f'[vo_ready][bg_ready]amix=inputs=2:duration=longest:dropout_transition=2[a_mixed]')
        a_tag = 'a_mixed'
    else:
        a_tag = 'vo_ready'
        
    cmd.extend(['-filter_complex', ';'.join(filter_complex)])
    cmd.extend(['-map', f'[{v_tag}]', '-map', f'[{a_tag}]'])
    
    # Output Duration Control
    cmd.extend(['-t', str(total_duration)])
    
    # Output Format
    cmd.extend(['-c:v', 'libx264', '-c:a', 'aac', '-ac', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    cmd.append(output_path)
    return cmd

def upload_to_cloudinary(file_path: str, job_id: str, cloudinary_url: str) -> str:
    import cloudinary.uploader
    cloudinary.config(cloudinary_url=cloudinary_url)
    r = cloudinary.uploader.upload(file_path, resource_type="video", folder="instagram-reels/renders", public_id=f"re_{job_id}")
    return r['secure_url']

def file_to_data_uri(file_path: str) -> str:
    with open(file_path, 'rb') as f: return f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
