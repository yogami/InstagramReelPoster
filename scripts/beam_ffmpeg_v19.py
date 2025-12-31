"""
FFmpeg Video Rendering Endpoint for Beam.cloud - V16 Fresh Deploy

Deploy with:
    beam deploy scripts/beam_ffmpeg_v16.py:render_video --name ffmpeg-v16-fresh

This is a completely fresh deployment to bypass Beam.cloud container caching.
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
        "mkdir -p /usr/share/fonts/truetype/custom",
        "wget -O /usr/share/fonts/truetype/custom/Arial.ttf https://github.com/matomo-org/travis-scripts/raw/master/fonts/Arial.ttf || true",
        "fc-cache -f -v"
    ],
)

storage_volume = Volume(name="ffmpeg-v19-cache", mount_path="/cache")


@endpoint(
    name="ffmpeg-v19",
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
    """Main entry point for video rendering."""
    job_id = str(uuid.uuid4())[:8]
    job_dir = f"/cache/render_{job_id}"
    os.makedirs(job_dir, exist_ok=True)
    
    VERSION = "V19-FRESH-SYNC-2024-12-30"
    print(f"[FFmpeg] ===== Job {job_id}: {VERSION} =====")
    print(f"[FFmpeg] voiceover_url: {voiceover_url[:80] if voiceover_url else 'None'}...")
    print(f"[FFmpeg] segments: {len(segments) if segments else 0}")
    print(f"[FFmpeg] animated_video_urls: {len(animated_video_urls) if animated_video_urls else 0}")
    
    try:
        # 1. Download voiceover
        voiceover_path = download_file(voiceover_url, f"{job_dir}/voiceover.mp3")
        voiceover_duration = get_duration(voiceover_path)
        print(f"[FFmpeg] Voiceover duration: {voiceover_duration}s")
        
        # 2. Download music (optional)
        music_path = None
        if music_url:
            try:
                music_path = download_file(music_url, f"{job_dir}/music.mp3")
                print(f"[FFmpeg] Music downloaded successfully")
            except Exception as e:
                print(f"[FFmpeg] Music download failed (non-fatal): {e}")
        
        # 3. Download subtitles (optional)
        subtitles_path = None
        if subtitles_url:
            try:
                subtitles_path = download_file(subtitles_url, f"{job_dir}/subtitles.srt")
                print(f"[FFmpeg] Subtitles downloaded successfully")
            except Exception as e:
                print(f"[FFmpeg] Subtitles download failed (non-fatal): {e}")
        
        # 4. Logo handling
        logo_path = None
        primary_logo_url = (branding.get('logoUrl') if branding else None) or logo_url
        if primary_logo_url:
            try:
                logo_path = download_file(primary_logo_url, f"{job_dir}/logo.png")
                print(f"[FFmpeg] Logo downloaded successfully")
            except Exception as e:
                print(f"[FFmpeg] Logo download failed (non-fatal): {e}")

        # 5. Create black fallback image
        black_img = f"{job_dir}/black.png"
        from PIL import Image as PILImage
        PILImage.new('RGB', (1080, 1920), color='black').save(black_img)
        
        # 6. Process visual inputs into unified timeline
        visual_inputs = []  # List of {'type': 'video'|'image', 'path': str, 'duration': float}
        
        if animated_video_urls and len(animated_video_urls) > 0:
            print(f"[FFmpeg] Processing {len(animated_video_urls)} animated clips")
            clip_dur = voiceover_duration / len(animated_video_urls)
            for i, url in enumerate(animated_video_urls):
                try:
                    clean_url = url.replace("turbo:", "") if url else ""
                    is_turbo = url and "turbo:" in url
                    suffix = ".png" if is_turbo else ".mp4"
                    path = download_file(clean_url, f"{job_dir}/visual_{i}{suffix}")
                    visual_inputs.append({
                        'type': 'image' if is_turbo or suffix == ".png" else 'video',
                        'path': path,
                        'duration': clip_dur
                    })
                    print(f"[FFmpeg] Visual {i}: {visual_inputs[-1]['type']}, {clip_dur}s")
                except Exception as e:
                    print(f"[FFmpeg] Visual {i} download failed: {e}, using black")
                    visual_inputs.append({'type': 'image', 'path': black_img, 'duration': clip_dur})
                    
        elif animated_video_url:
            print(f"[FFmpeg] Processing single animated video")
            try:
                path = download_file(animated_video_url, f"{job_dir}/source_video.mp4")
                visual_inputs.append({'type': 'video', 'path': path, 'duration': voiceover_duration})
            except Exception as e:
                print(f"[FFmpeg] Video download failed: {e}, using black")
                visual_inputs.append({'type': 'image', 'path': black_img, 'duration': voiceover_duration})
                
        elif segments and len(segments) > 0:
            print(f"[FFmpeg] Processing {len(segments)} image segments")
            for i, seg in enumerate(segments):
                try:
                    path = download_file(seg.get('image_url'), f"{job_dir}/image_{i}.png")
                    dur = max(seg.get('end', 1) - seg.get('start', 0), 0.1)
                    visual_inputs.append({'type': 'image', 'path': path, 'duration': dur})
                    print(f"[FFmpeg] Segment {i}: image, {dur}s")
                except Exception as e:
                    print(f"[FFmpeg] Segment {i} download failed: {e}, using black")
                    visual_inputs.append({'type': 'image', 'path': black_img, 'duration': 1.0})
        
        # Fallback if no visuals
        if not visual_inputs:
            print(f"[FFmpeg] No visuals provided, using black screen")
            visual_inputs.append({'type': 'image', 'path': black_img, 'duration': voiceover_duration})
        
        # 7. Add conclusion slide if branding
        if branding:
            conclusion_slide_path = f"{job_dir}/conclusion_slide.png"
            create_conclusion_slide(branding, conclusion_slide_path, logo_path)
            visual_inputs.append({'type': 'image', 'path': conclusion_slide_path, 'duration': 4.0})
            print(f"[FFmpeg] Added conclusion slide (4s)")

        # 8. Ensure total duration matches voiceover
        total_visual_dur = sum(v['duration'] for v in visual_inputs)
        if total_visual_dur < voiceover_duration:
            adjustment = voiceover_duration - total_visual_dur + 0.5
            visual_inputs[-1]['duration'] += adjustment
            total_visual_dur = sum(v['duration'] for v in visual_inputs)
            print(f"[FFmpeg] Adjusted last visual by {adjustment}s to match voiceover")

        print(f"[FFmpeg] Total visual inputs: {len(visual_inputs)}, total duration: {total_visual_dur}s")

        # 9. Build and execute FFmpeg command
        output_path = f"{job_dir}/output.mp4"
        cmd = build_ffmpeg_command(
            voiceover_path=voiceover_path,
            music_path=music_path,
            subtitles_path=subtitles_path,
            visual_inputs=visual_inputs,
            logo_path=logo_path,
            total_duration=total_visual_dur,
            output_path=output_path,
        )
        
        print(f"[FFmpeg] Command ({len(cmd)} args): {' '.join(cmd[:20])}...")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=540)
        
        if result.returncode != 0:
            print(f"[FFmpeg] FAILED (code {result.returncode})")
            print(f"[FFmpeg] STDERR: {result.stderr[-1000:]}")
            raise Exception(f"FFmpeg failed: {result.stderr[-500:]}")
        
        # 10. Validate output file with ffprobe
        if not os.path.exists(output_path):
            raise Exception("Output file does not exist")
        
        output_size = os.path.getsize(output_path)
        if output_size < 1000:
            raise Exception(f"Output file too small: {output_size} bytes")
        
        # Probe the output to verify it's a valid video
        probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 
                     'format=format_name,duration:stream=codec_name,width,height',
                     '-of', 'json', output_path]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        print(f"[FFmpeg] Probe output: {probe_result.stdout[:500]}")
        
        if 'mp4' not in probe_result.stdout.lower() and 'h264' not in probe_result.stdout.lower():
            print(f"[FFmpeg] WARNING: Output may not be valid MP4/H264")
        
        print(f"[FFmpeg] Success! Output size: {output_size} bytes")

        # 11. Upload to Cloudinary or return base64
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            print(f"[FFmpeg] Uploading to Cloudinary...")
            import cloudinary.uploader
            cloudinary.config(cloudinary_url=cloudinary_url)
            r = cloudinary.uploader.upload(
                output_path, 
                resource_type="video", 
                folder="instagram-reels/renders", 
                public_id=f"re_{job_id}"
            )
            video_url = r['secure_url']
            print(f"[FFmpeg] Upload complete: {video_url}")
        else:
            print(f"[FFmpeg] No Cloudinary, returning base64")
            with open(output_path, 'rb') as f:
                video_url = f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        
        return {"video_url": video_url, "render_id": job_id, "version": VERSION}
        
    except Exception as e:
        print(f"[FFmpeg] FATAL ERROR: {e}")
        raise
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)


def build_ffmpeg_command(
    voiceover_path: str,
    music_path: str,
    subtitles_path: str,
    visual_inputs: list,
    logo_path: str,
    total_duration: float,
    output_path: str,
) -> list:
    """Build the FFmpeg command with proper stream mapping."""
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'info']
    filter_parts = []
    
    # === INPUT MAPPING ===
    # Input 0: Voiceover (audio)
    cmd.extend(['-i', voiceover_path])
    
    # Input 1: Music (optional, audio)
    next_input_idx = 1
    if music_path:
        cmd.extend(['-stream_loop', '-1', '-i', music_path])
        next_input_idx = 2
    
    # Inputs 2+: Visual inputs (video/image)
    visual_start_idx = next_input_idx
    for i, vis in enumerate(visual_inputs):
        if vis['type'] == 'image':
            cmd.extend(['-loop', '1', '-t', str(vis['duration']), '-i', vis['path']])
        else:
            cmd.extend(['-i', vis['path']])
    
    # === FILTER COMPLEX ===
    
    # Normalize each visual input
    norm_tags = []
    for i, vis in enumerate(visual_inputs):
        input_idx = visual_start_idx + i
        in_tag = f'[{input_idx}:v]'
        out_tag = f'v{i}'
        norm_tags.append(f'[{out_tag}]')
        
        if vis['type'] == 'image':
            # Image: scale, crop, zoompan for Ken Burns effect
            num_frames = max(int(vis['duration'] * 24), 1)
            filt = (
                f"{in_tag}scale=1280:2276:force_original_aspect_ratio=increase,"
                f"crop=1280:2276,"
                f"zoompan=z='min(zoom+0.0015,1.5)':d={num_frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,"
                f"setpts=PTS-STARTPTS,format=yuv420p[{out_tag}]"
            )
        else:
            # Video: scale to fit, pad to fill, normalize
            filt = (
                f"{in_tag}scale=1080:1920:force_original_aspect_ratio=decrease,"
                f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2,"
                f"setsar=1,setpts=PTS-STARTPTS,format=yuv420p[{out_tag}]"
            )
        filter_parts.append(filt)
    
    # Concat all visuals
    concat_inputs = ''.join(norm_tags)
    filter_parts.append(f"{concat_inputs}concat=n={len(visual_inputs)}:v=1:a=0[vconcat]")
    video_tag = "vconcat"
    
    # Apply subtitles if available
    if subtitles_path:
        filter_parts.append(
            f"[{video_tag}]subtitles={subtitles_path}:force_style='FontName=Arial,FontSize=24,"
            f"PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'[vsub]"
        )
        video_tag = "vsub"
    
    # Audio mixing
    if music_path:
        # Voiceover + music with sidechain compression
        filter_parts.append(f'[0:a]aresample=44100,volume=2.0,asplit=2[vo_sc][vo_main]')
        filter_parts.append(f'[1:a]aresample=44100,volume=0.5[bg]')
        filter_parts.append(f'[bg][vo_sc]sidechaincompress=threshold=0.15:ratio=3:attack=50:release=600[bg_duck]')
        filter_parts.append(f'[vo_main][bg_duck]amix=inputs=2:duration=first[aout]')
        audio_tag = "aout"
    else:
        # Voiceover only
        filter_parts.append(f'[0:a]aresample=44100,volume=2.0[aout]')
        audio_tag = "aout"
    
    # === ASSEMBLE COMMAND ===
    filter_str = ';'.join(filter_parts)
    print(f"[FFmpeg] Filter complex: {filter_str[:500]}...")
    print(f"[FFmpeg] Video tag: [{video_tag}], Audio tag: [{audio_tag}]")
    
    cmd.extend(['-filter_complex', filter_str])
    cmd.extend(['-map', f'[{video_tag}]'])
    cmd.extend(['-map', f'[{audio_tag}]'])
    cmd.extend(['-t', str(total_duration)])
    cmd.extend([
        '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
        '-preset', 'veryfast', '-b:v', '2M',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-f', 'mp4'
    ])
    cmd.append(output_path)
    
    return cmd


def get_duration(file_path: str) -> float:
    """Get duration of audio/video file using ffprobe."""
    cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
           '-of', 'default=noprint_wrappers=1:nokey=1', file_path]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def download_file(url: str, dest: str) -> str:
    """Download a file from URL or decode base64 data URI."""
    if not url or url.lower() == "undefined":
        raise ValueError(f"Invalid URL: {url}")
    
    if url.startswith('data:'):
        _, data = url.split(',', 1)
        with open(dest, 'wb') as f:
            f.write(base64.b64decode(data))
        return dest
    
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    with open(dest, 'wb') as f:
        f.write(r.content)
    return dest


def create_conclusion_slide(branding: dict, output_path: str, logo_path: str):
    """Create a branded conclusion slide image."""
    from PIL import Image, ImageDraw, ImageFont
    
    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), color='#0f172a')
    draw = ImageDraw.Draw(img)
    
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 80)
        info_font = ImageFont.truetype("/usr/share/fonts/truetype/custom/Arial.ttf", 40)
    except:
        title_font = info_font = ImageFont.load_default()
    
    y = 400
    
    # Logo
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo.thumbnail((400, 400), Image.Resampling.LANCZOS)
            img.paste(logo, (int((W - logo.size[0]) / 2), y), logo)
            y += logo.size[1] + 80
        except Exception as e:
            print(f"[FFmpeg] Logo paste failed: {e}")
    
    # Business name
    name = branding.get('businessName', 'Thank You!')
    draw.text((W / 2, y), name.upper(), font=title_font, fill='#f8fafc', anchor="mm")
    y += 120
    
    # Contact info
    if branding.get('address'):
        draw.text((W / 2, y), branding['address'], font=info_font, fill='#94a3b8', anchor="mm")
        y += 60
    
    if branding.get('phone'):
        draw.text((W / 2, y), branding['phone'], font=info_font, fill='#94a3b8', anchor="mm")
        y += 60
    
    img.save(output_path)
