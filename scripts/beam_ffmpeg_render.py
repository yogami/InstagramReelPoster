import os
import subprocess
import uuid
import base64
import requests
import json
import time

# Version V15 - Production Parity Fix
# Optimized for: Mixed Video/Image Timelines & Hybrid Mode

def render_video(
    voiceover_url: str = None,
    music_url: str = None,
    subtitles_url: str = None,
    animated_video_url: str = None,
    animated_video_urls: list = None,
    branding: dict = None,
    logo_url: str = None,
    logo_position: str = "top-right",
    segments: list = None
):
    job_id = str(uuid.uuid4())[:12]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    print(f"[FFmpeg] Starting Job {job_id} (V15 - Final)")

    try:
        # 1. Download Core Assets
        voiceover_path = download_file(voiceover_url, f"{job_dir}/voiceover.mp3")
        voiceover_duration = get_duration(voiceover_path)
        print(f"[FFmpeg] Voiceover: {voiceover_duration}s")

        music_path = None
        if music_url:
            try: music_path = download_file(music_url, f"{job_dir}/music.mp3")
            except: print("[FFmpeg] Music download failed, skipping music.")

        subtitles_path = None
        if subtitles_url:
            try: subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt")
            except: print("[FFmpeg] Subtitles download failed, skipping subtitles.")

        logo_path = None
        logo_url_active = (branding.get('logoUrl') if branding else None) or logo_url
        if logo_url_active:
            try: logo_path = download_file(logo_url_active, f"{job_dir}/logo.png")
            except: print("[FFmpeg] Logo download failed.")

        # 2. Process Visual Sequences
        visual_inputs = []
        black_img = f"{job_dir}/black.png"
        from PIL import Image as PILImage
        PILImage.new('RGB', (1080, 1920), color='black').save(black_img)

        # Hybrid/Turbo Mode Detection
        active_urls = animated_video_urls or ([animated_video_url] if animated_video_url else [])
        
        if active_urls:
            clip_dur = voiceover_duration / len(active_urls)
            for i, url in enumerate(active_urls):
                try:
                    clean_url = url.replace("turbo:", "")
                    is_turbo = "turbo:" in url
                    ext = ".png" if is_turbo else ".mp4"
                    path = download_file(clean_url, f"{job_dir}/vis_{i}{ext}")
                    visual_inputs.append({
                        'type': 'image' if is_turbo or ext == ".png" else 'video',
                        'path': path,
                        'duration': clip_dur
                    })
                except Exception as e:
                    print(f"Clip {i} fail: {e}")
                    visual_inputs.append({'type': 'image', 'path': black_img, 'duration': clip_dur})
        elif segments:
            for i, seg in enumerate(segments):
                try:
                    path = download_file(seg['image_url'], f"{job_dir}/seg_{i}.png")
                    visual_inputs.append({'type': 'image', 'path': path, 'duration': max(seg['end'] - seg['start'], 0.1)})
                except:
                    visual_inputs.append({'type': 'image', 'path': black_img, 'duration': 1.0})
        
        if not visual_inputs:
            visual_inputs.append({'type': 'image', 'path': black_img, 'duration': voiceover_duration})

        if branding:
            slide_path = f"{job_dir}/branding_final.png"
            create_conclusion_slide(branding, slide_path, logo_path)
            visual_inputs.append({'type': 'image', 'path': slide_path, 'duration': 4.0})

        # 3. Build FFmpeg Command
        output_path = f"{job_dir}/final_output.mp4"
        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            music_path=music_path,
            subtitles_path=subtitles_path,
            visual_inputs=visual_inputs,
            logo_path=logo_path,
            logo_position=logo_position,
            total_duration=sum(v['duration'] for v in visual_inputs),
            output_path=output_path
        )

        print(f"[FFmpeg] Executing: {' '.join(cmd)}")
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if res.returncode != 0:
            print(f"[FFmpeg] ERR: {res.stderr}")
            raise Exception(f"FFmpeg render failed: {res.stderr[-500:]}")

        # 4. Upload Result
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            import cloudinary.uploader
            cloudinary.config(cloudinary_url=cloudinary_url)
            r = cloudinary.uploader.upload(output_path, resource_type="video", folder="instagram-reels/renders", public_id=f"re_{job_id}")
            return {"video_url": r['secure_url'], "render_id": job_id}
        else:
            with open(output_path, 'rb') as f:
                return {"video_url": f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}", "render_id": job_id}

    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)

def build_ffmpeg_command(voiceover_path, music_path, subtitles_path, visual_inputs, logo_path, logo_position, total_duration, output_path):
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'info']
    filter_complex = []
    
    # Inputs
    cmd.extend(['-i', voiceover_path]) # Index 0
    v_start = 1
    if music_path:
        cmd.extend(['-stream_loop', '-1', '-i', music_path]) # Index 1
        v_start = 2
    
    vis_norm_tags = []
    for i, vis in enumerate(visual_inputs):
        in_tag = f'[{v_start+i}:v]'
        out_tag = f'v_norm_{i}'
        vis_norm_tags.append(f'[{out_tag}]')
        
        cmd.extend(['-loop', '1', '-t', str(vis['duration']), '-i', vis['path']]) if vis['type'] == 'image' else cmd.extend(['-i', vis['path']])
        
        if vis['type'] == 'image':
            num_frames = int(vis['duration'] * 24)
            norm = (f"{in_tag}scale=1280:2276:force_original_aspect_ratio=increase,crop=1280:2276,"
                    f"zoompan=z='min(zoom+0.0015,1.5)':d={num_frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,"
                    f"setpts=PTS-STARTPTS,format=yuv420p[{out_tag}]")
        else:
            norm = (f"{in_tag}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,"
                    f"setsar=1,setpts=PTS-STARTPTS,format=yuv420p[{out_tag}]")
        filter_complex.append(norm)

    # Concat
    concat_str = "".join(vis_norm_tags)
    filter_complex.append(f"{concat_str}concat=n={len(visual_inputs)}:v=1:a=0[v_base]")
    v_tag = "v_base"

    # Subtitles
    if subtitles_path:
        filter_complex.append(f"[{v_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF'[v_burned]")
        v_tag = "v_burned"

    # Audio Mix
    if music_path:
        filter_complex.append(f"[0:a]aresample=44100,volume=2.0,asplit=2[vo_side][vo_main]")
        filter_complex.append(f"[1:a]aresample=44100,volume=0.4[bg]")
        filter_complex.append(f"[bg][vo_side]sidechaincompress=threshold=0.15:ratio=3:attack=50:release=600[bg_duck]")
        filter_complex.append(f"[vo_main][bg_duck]amix=inputs=2:duration=first[a_mix]")
        a_tag = "a_mix"
    else:
        filter_complex.append(f"[0:a]aresample=44100,volume=2.0[a_norm]")
        a_tag = "a_norm"

    cmd.extend(['-filter_complex', ';'.join(filter_complex)])
    cmd.extend(['-map', f'[{v_tag}]', '-map', f'[{a_tag}]'])
    cmd.extend(['-t', str(total_duration), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-ac', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output_path])
    return cmd

def get_duration(file_path):
    cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file_path]
    return float(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip())

def download_file(url, dest):
    if not url or url == "undefined": raise ValueError(f"Invalid URL: {url}")
    if url.startswith('data:'):
        _, data = url.split(',', 1)
        with open(dest, 'wb') as f: f.write(base64.b64decode(data))
        return dest
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    with open(dest, 'wb') as f: f.write(r.content)
    return dest

def create_conclusion_slide(branding, output_path, logo_path):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#0f172a')
    draw = ImageDraw.Draw(img)
    try: font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 60)
    except: font = ImageFont.load_default()
    if logo_path and os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((400, 400))
        img.paste(logo, (int((W-logo.size[0])/2), 400), logo)
    draw.text((W/2, 960), branding.get('businessName', 'Follow Us').upper(), font=font, fill='white', anchor="mm")
    img.save(output_path)
