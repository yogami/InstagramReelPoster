"""
FFmpeg Video Rendering Endpoint for Beam.cloud

Updates (V9):
- Improved robustness for mixed video/image sequences.
- Added support for static images in video_paths (uses -loop 1).
- Added detailed FFmpeg error logging on failure.
- Fixed duration handling for mixed assets.
"""

from beta9 import endpoint, Image, Volume
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
        "cloudinary",
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
        print(f"[FFmpeg] Job {job_id}: Target Renderer V9 (Mixed Asset Pro)")
        
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
                print(f"[FFmpeg] Music downloaded.")
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

        # Process visuals into a unified timeline
        visual_inputs = [] # List of {'type': 'video'|'image', 'path': str, 'duration': float}
        black_img = f"{job_dir}/black.png"
        from PIL import Image as PILImage
        PILImage.new('RGB', (1080, 1920), color='black').save(black_img)
        
        if animated_video_urls:
            # Multi-clip animated mode (Direct Message)
            clip_dur = voiceover_duration / len(animated_video_urls)
            for i, url in enumerate(animated_video_urls):
                try: 
                    clean_url = url.replace("turbo:", "")
                    is_turbo = "turbo:" in url
                    suffix = ".png" if is_turbo else ".mp4"
                    path = download_file(clean_url, f"{job_dir}/visual_{i}{suffix}")
                    visual_inputs.append({
                        'type': 'image' if is_turbo or suffix == ".png" else 'video',
                        'path': path,
                        'duration': clip_dur
                    })
                except Exception as e:
                    print(f"Error downloading clip {i}: {e}. Falling back to black.")
                    visual_inputs.append({'type': 'image', 'path': black_img, 'duration': clip_dur})
        elif animated_video_url:
             try: 
                 path = download_file(animated_video_url, f"{job_dir}/source_video.mp4")
                 visual_inputs.append({'type': 'video', 'path': path, 'duration': voiceover_duration})
             except: 
                 visual_inputs.append({'type': 'image', 'path': black_img, 'duration': voiceover_duration})
        elif segments:
            for i, seg in enumerate(segments):
                try: 
                    path = download_file(seg['image_url'], f"{job_dir}/image_{i}.png")
                    dur = max(seg['end'] - seg['start'], 0.1)
                    visual_inputs.append({'type': 'image', 'path': path, 'duration': dur})
                except: 
                    visual_inputs.append({'type': 'image', 'path': black_img, 'duration': 1.0})
        
        # Unified Conclusion Slide
        if branding:
            conclusion_slide_path = f"{job_dir}/conclusion_slide.png"
            create_conclusion_slide(branding, conclusion_slide_path, logo_path)
            visual_inputs.append({'type': 'image', 'path': conclusion_slide_path, 'duration': 5.0})

        # Ensure total duration matches voiceover
        total_visual_dur = sum(v['duration'] for v in visual_inputs)
        if total_visual_dur < voiceover_duration:
             visual_inputs[-1]['duration'] += (voiceover_duration - total_visual_dur + 0.5)
             total_visual_dur = sum(v['duration'] for v in visual_inputs)

        output_path = f"{job_dir}/output.mp4"
        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            voiceover_duration=voiceover_duration,
            music_path=music_path,
            subtitles_path=subtitles_path,
            visual_inputs=visual_inputs,
            logo_path=logo_path,
            logo_position=logo_position,
            total_duration=total_visual_dur,
            output_path=output_path,
        )
        
        print(f"[FFmpeg] Executing command...")
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=540)
        except subprocess.TimeoutExpired as te:
            print(f"[FFmpeg] CRITICAL: FFmpeg stalled for 9 minutes.")
            raise Exception("FFmpeg timed out rendering (9 minute cap reached)")
        
        if result.returncode != 0:
            print(f"[FFmpeg] ERROR (Code {result.returncode})")
            print(f"STDOUT: {result.stdout[-1000:]}")
            print(f"STDERR: {result.stderr[-2000:]}")
            raise Exception(f"FFmpeg failed: {result.stderr[-500:]}")
        
        # Check if output file exists and is not empty
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("FFmpeg output file is empty or missing")

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
    if not url or url.lower() == "undefined": raise ValueError(f"Invalid URL: {url}")
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
    visual_inputs: list,
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

    # Map all visual inputs
    v_start = a_idx
    for i, vis in enumerate(visual_inputs):
        if vis['type'] == 'image':
            # Images need loop+t to act like video in concat
            cmd.extend(['-loop', '1', '-t', str(vis['duration']), '-i', vis['path']])
        else:
            cmd.extend(['-i', vis['path']])
            
    # Normalize and Concat Visuals
    vis_outs = []
    for i, vis in enumerate(visual_inputs):
        in_tag = f'[{v_start+i}:v]'
        out_tag = f'[v_norm_{i}]'
        
        if vis['type'] == 'image':
            # Apply Ken Burns to images
            num_frames = int(vis['duration'] * 24)
            norm_filter = (
                f"{in_tag}scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,"
                f"zoompan=z='min(zoom+0.0015,1.5)':d={num_frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,"
                f"setpts=PTS-STARTPTS,format=yuv420p{out_tag}"
            )
        else:
            # Normalize video
            norm_filter = (
                f"{in_tag}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,"
                f"setsar=1,setpts=PTS-STARTPTS,format=yuv420p{out_tag}"
            )
        filter_complex.append(norm_filter)
        vis_outs.append(out_tag)
    
    # Concat all normalized visual streams
    filter_complex.append(f'{"".join(vis_outs)}concat=n={len(visual_inputs)}:v=1:a=0[vbase]')
    
    v_tag = 'vbase'
    if subtitles_path:
        filter_complex.append(f"[{v_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vburned]")
        v_tag = 'vburned'
    
    # AUDIO MIXING
    filter_complex.append(f'[0:a]aresample=44100,pan=stereo|c0=c0|c1=c1,volume=2.0,asplit=2[vo_sidechain][vo_main]')
    
    if music_path:
        filter_complex.append(f'[1:a]aresample=44100,pan=stereo|c0=c0|c1=c1,volume=0.6[bg_standard]')
        filter_complex.append(f'[bg_standard][vo_sidechain]sidechaincompress=threshold=0.15:ratio=3:attack=50:release=600[bg_ducked]')
        filter_complex.append(f'[vo_main][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2,volume=2.0[a_mixed]')
        a_tag = 'a_mixed'
    else:
        a_tag = 'vo_main'
        
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
