"""
FFmpeg Video Rendering Endpoint for Beam.cloud

Updates (V7):
- Fixed missing music bug by switching amix duration to 'first'.
- Added Cinematic Ducking (Sidechain Compression): Music volume dips when voiceover is active.
- Refined audio pipeline with better stream selection and normalization.
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
        "Pillow",
    ],
    commands=[
        "apt-get update && apt-get install -y ffmpeg fontconfig",
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
    branding: dict = None,
) -> dict:
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    try:
        print(f"[FFmpeg] Job {job_id}: Target Renderer V7 (Audio Fixes)")
        print(f"[FFmpeg] Incoming Music URL: {music_url}")
        
        # Download voiceover
        try:
            voiceover_path = download_file(voiceover_url, f"{job_dir}/voiceover.mp3")
            voiceover_duration = get_duration(voiceover_path)
            print(f"[FFmpeg] Voiceover downloaded. Duration: {voiceover_duration}s")
        except Exception as e:
            raise Exception(f"Failed to download or parse voiceover: {e}")
            
        # Download music
        music_path = None
        if music_url:
            try:
                music_path = download_file(music_url, f"{job_dir}/music.mp3")
                print(f"[FFmpeg] Music downloaded from {music_url[:50]}...")
            except Exception as e:
                print(f"[FFmpeg] Warning: Music download failed: {e}")
        
        # Download subtitles
        subtitles_path = None
        if subtitles_url:
            try:
                subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt")
            except:
                print("Warning: Subtitles download failed")
        
        # Logo handling
        logo_path = None
        primary_logo_url = (branding.get('logoUrl') if branding else None) or logo_url
        if primary_logo_url:
             try:
                logo_path = download_file(primary_logo_url, f"{job_dir}/logo.png")
             except: 
                print(f"[FFmpeg] Could not download logo")

        video_paths = []
        image_paths = []
        black_img = f"{job_dir}/black.png"
        from PIL import Image as PILImage
        PILImage.new('RGB', (1080, 1920), color='black').save(black_img)
        
        if animated_video_urls:
            for i, url in enumerate(animated_video_urls):
                try: 
                    clean_url = url.replace("turbo:", "")
                    is_turbo = "turbo:" in url
                    suffix = ".png" if is_turbo else ".mp4"
                    path = download_file(clean_url, f"{job_dir}/video_{i}{suffix}")
                    
                    if is_turbo:
                        # Add to image_paths for Ken Burns motion
                        # Estimate duration or get from somewhere? For now use 10s blocks
                        image_paths.append({'path': path, 'start': i*10, 'end': (i+1)*10})
                    else:
                        video_paths.append(path)
                except: 
                    video_paths.append(black_img)
        elif animated_video_url:
             try: video_paths.append(download_file(animated_video_url, f"{job_dir}/source_video.mp4"))
             except: pass
        elif segments:
            for i, seg in enumerate(segments):
                try: path = download_file(seg['image_url'], f"{job_dir}/image_{i}.png")
                except: path = black_img
                image_paths.append({'path': path, 'start': seg['start'], 'end': seg['end']})
        
        # Unified Conclusion Slide
        if branding:
            conclusion_slide_path = f"{job_dir}/conclusion_slide.png"
            create_conclusion_slide(branding, conclusion_slide_path, logo_path)
            conc_dur = 5.0
            last_end = image_paths[-1]['end'] if image_paths else 0
            image_paths.append({'path': conclusion_slide_path, 'start': last_end, 'end': last_end + conc_dur})

        # OVERSHOOT FIX
        total_visual_dur = image_paths[-1]['end'] if image_paths else 0
        if total_visual_dur < voiceover_duration:
             needed = voiceover_duration - total_visual_dur + 0.5
             if image_paths: image_paths[-1]['end'] += needed
             total_visual_dur = image_paths[-1]['end'] if image_paths else 0

        output_path = f"{job_dir}/output.mp4"
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
        
        print(f"[FFmpeg] Executing command...")
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=540) # 9 min internal timeout
        except subprocess.TimeoutExpired as te:
            print(f"[FFmpeg] CRITICAL: FFmpeg stalled for 9 minutes.")
            if te.stderr: print(f"Last Stderr: {te.stderr[-1000:]}")
            raise Exception("FFmpeg timed out rendering (9 minute cap reached)")
        
        if result.returncode != 0:
            print(f"[FFmpeg] ERROR (Code {result.returncode}): {result.stderr[-2000:]}")
            raise Exception(f"FFmpeg failed")
        
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            video_url = upload_to_cloudinary(output_path, job_id, cloudinary_url)
        else:
            video_url = file_to_data_uri(output_path)
        
        return {"video_url": video_url, "render_id": job_id}
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)


def get_duration(file_path: str) -> float:
    cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file_path]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())

def create_conclusion_slide(branding: dict, output_path: str, logo_path: str):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#0f172a')
    draw = ImageDraw.Draw(img)
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 95)
        info_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 50)
        label_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 40)
    except: title_font = info_font = label_font = ImageFont.load_default()
    y = 300
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo.thumbnail((500, 500), Image.Resampling.LANCZOS)
            img.paste(logo, (int((W-logo.size[0])/2), y), logo)
            y += logo.size[1] + 80
        except: pass
    name = branding.get('businessName', 'Visit Us')
    draw.text((W/2, y), name.upper(), font=title_font, fill='#f8fafc', anchor="mm")
    y += 150
    draw.rectangle([W/2 - 100, y - 40, W/2 + 100, y - 35], fill='#fbbf24')
    def draw_section(label, content, current_y):
        if not content: return current_y
        draw.text((W/2, current_y), label, font=label_font, fill='#94a3b8', anchor="mm")
        current_y += 60
        words = content.split(); lines = []; current = []
        for word in words:
            current.append(word)
            try: w = info_font.getlength(' '.join(current))
            except: w = len(' '.join(current)) * 25
            if w > 950:
                if len(current) == 1: lines.append(current.pop()); current = []
                else: last = current.pop(); lines.append(' '.join(current)); current = [last]
        if current: lines.append(' '.join(current))
        for line in lines:
            draw.text((W/2, current_y), line, font=info_font, fill='#e2e8f0', anchor="mm")
            current_y += 70
        return current_y + 60
    y = draw_section("LOCATION", branding.get('address'), y)
    y = draw_section("OPENING HOURS", branding.get('hours'), y)
    contact_parts = []
    if branding.get('phone'): contact_parts.append(branding.get('phone'))
    if branding.get('email'): contact_parts.append(branding.get('email'))
    if contact_parts: y = draw_section("CONTACT", " | ".join(contact_parts), y)
    img.save(output_path)

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
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'info']
    filter_complex = []
    
    # Input 0: Voiceover
    cmd.extend(['-i', voiceover_path])
    
    a_idx = 1
    if music_path:
        # Input 1: Music (Looped)
        cmd.extend(['-stream_loop', '-1', '-i', music_path])
        a_idx = 2

    v_start = a_idx
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
            # Duration in frames (at 24 fps)
            num_frames = int(dur * 24)
            cmd.extend(['-loop', '1', '-t', str(dur), '-i', img['path']])
            
            # Application of Ken Burns (Zoom/Pan) effect
            # We scale up first to 1280x2276 to have margin for zooming/panning
            zoom_cmd = (
                f"[{v_start+i}:v]scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,"
                f"zoompan=z='min(zoom+0.0015,1.5)':d={num_frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,"
                f"format=yuv420p[im{i}]"
            )
            filter_complex.append(zoom_cmd)
            img_outs.append(f'[im{i}]')
        filter_complex.append(f'{"".join(img_outs)}concat=n={len(image_paths)}:v=1:a=0[vbase]')
    
    v_tag = 'vbase'
    if subtitles_path:
        filter_complex.append(f"[{v_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vburned]")
        v_tag = 'vburned'
    
    # AUDIO MIXING (V7 ULTIMATE)
    # 0:a = Voiceover, 1:a = Music
    
    # Standardize VO
    filter_complex.append(f'[0:a]aresample=44100,pan=stereo|c0=c0|c1=c1,volume=2.0[vo_standard]')
    
    if music_path:
        # Standardize Music and apply initial volume
        filter_complex.append(f'[1:a]aresample=44100,pan=stereo|c0=c0|c1=c1,volume=0.4[bg_standard]')
        
        # DUCKING: Reduce music volume when voiceover is detected.
        # Sidechain compress: [music] [vo] sidechaincompress [outcome]
        filter_complex.append(f'[bg_standard][vo_standard]sidechaincompress=threshold=0.1:ratio=4:attack=50:release=500[bg_ducked]')
        
        # MIX: 'duration=first' ensures we stop when Voiceover ends (most stable)
        # dropout_transition=2 avoids clicking at the end if streams differ slightly
        filter_complex.append(f'[vo_standard][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[a_mixed]')
        a_tag = 'a_mixed'
    else:
        a_tag = 'vo_standard'
        
    cmd.extend(['-filter_complex', ';'.join(filter_complex)])
    cmd.extend(['-map', f'[{v_tag}]', '-map', f'[{a_tag}]'])
    cmd.extend(['-t', str(total_duration)])
    cmd.extend(['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    cmd.append(output_path)
    return cmd

def upload_to_cloudinary(file_path: str, job_id: str, cloudinary_url: str) -> str:
    import cloudinary.uploader
    cloudinary.config(cloudinary_url=cloudinary_url)
    r = cloudinary.uploader.upload(file_path, resource_type="video", folder="instagram-reels/renders", public_id=f"re_{job_id}")
    return r['secure_url']

def file_to_data_uri(file_path: str) -> str:
    with open(file_path, 'rb') as f: return f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
