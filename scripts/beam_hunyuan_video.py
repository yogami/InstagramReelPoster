"""
HunyuanVideo Generation Endpoint for Beam.cloud

Generates videos using Tencent's HunyuanVideo open-source model.
Runs on H100 GPU (80GB VRAM required).

Deploy with:
    beam deploy beam_hunyuan_video.py:generate_video
"""

from beam import endpoint, Image, Volume
import os
import subprocess
import uuid
import base64


# Use the official HunyuanVideo Docker image with CUDA 12
# This has all dependencies pre-installed
image = Image(
    base_image="hunyuanvideo/hunyuanvideo:cuda_12",
    python_packages=[
        "cloudinary",
    ],
)

# Persistent volume for model weights (avoid re-downloading)
model_volume = Volume(name="hunyuan-video-models", mount_path="/models")
cache_volume = Volume(name="hunyuan-video-cache", mount_path="/cache")


@endpoint(
    name="hunyuan-video",
    image=image,
    gpu="H100",
    memory="64Gi",
    cpu=8,
    timeout=1800,  # 30 minutes max
    volumes=[model_volume, cache_volume],
    keep_warm_seconds=3600,  # Keep warm for 1 hour to ensure zero-latency for production sessions
    secrets=["CLOUDINARY_URL"],
)
def generate_video(
    prompt: str,
    duration_seconds: float = 5.0,
    width: int = 720,
    height: int = 1280,
    fps: int = 24,
    seed: int = None,
) -> dict:
    """
    Generate a video using HunyuanVideo.
    """
    job_id = str(uuid.uuid4())[:8]
    output_dir = f"/cache/generation_{job_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Check if models are available. If not, FAIL FAST instead of hanging for 15 minutes.
        if not os.path.exists("/models/ckpts/hunyuan-video-t2v-720p"):
            raise Exception("Model weights missing. Please run the 'prewarm' endpoint first to cache 30GB models to the persistent volume.")

        print(f"[HunyuanVideo] Job {job_id}: Starting generation...")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1500,  # 25 min timeout for generation
            cwd="/workspace/HunyuanVideo"
        )
        
        if result.returncode != 0:
            print(f"[HunyuanVideo] STDERR: {result.stderr[-2000:]}")
            raise Exception(f"HunyuanVideo generation failed: {result.stderr[-500:]}")
        
        # Find the output video file
        video_path = find_output_video(output_dir)
        if not video_path:
            raise Exception("No video file generated")
        
        print(f"[HunyuanVideo] Video generated: {video_path}")
        
        # Upload to Cloudinary
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            video_url = upload_to_cloudinary(video_path, job_id, cloudinary_url)
        else:
            video_url = file_to_data_uri(video_path)
        
        print(f"[HunyuanVideo] Job {job_id}: Complete!")
        
        return {
            "video_url": video_url,
            "job_id": job_id,
            "prompt": prompt,
            "duration_seconds": duration_seconds,
            "width": width,
            "height": height,
        }
        
    finally:
        # Cleanup
        import shutil
        shutil.rmtree(output_dir, ignore_errors=True)

@endpoint(
    name="hunyuan-video-prewarm",
    image=image,
    cpu=4,
    memory="16Gi",
    timeout=3600,
    volumes=[model_volume],
)
def prewarm():
    """Pre-download models to volume."""
    print("[HunyuanVideo] Starting prewarm download...")
    download_models()
    return {"status": "ready"}


def download_models():
    """Download HunyuanVideo model weights to persistent volume."""
    os.makedirs("/models/ckpts", exist_ok=True)
    
    # Use huggingface-cli to download models
    # Increased timeout to 1 hour as weights are ~30GB
    subprocess.run([
        "huggingface-cli", "download",
        "tencent/HunyuanVideo",
        "--local-dir", "/models/ckpts",
    ], check=True, timeout=3600)
    
    print("[HunyuanVideo] Models downloaded successfully")


def find_output_video(output_dir: str) -> str:
    """Find the generated video file in the output directory."""
    import glob
    
    # HunyuanVideo outputs MP4 files
    patterns = [
        f"{output_dir}/*.mp4",
        f"{output_dir}/**/*.mp4",
    ]
    
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        if files:
            return files[0]
    
    return None


def upload_to_cloudinary(file_path: str, job_id: str, cloudinary_url: str) -> str:
    """Upload video to Cloudinary and return URL."""
    import cloudinary.uploader
    cloudinary.config(cloudinary_url=cloudinary_url)
    
    result = cloudinary.uploader.upload(
        file_path,
        resource_type="video",
        folder="instagram-reels/hunyuan",
        public_id=f"hv_{job_id}"
    )
    return result['secure_url']


def file_to_data_uri(file_path: str) -> str:
    """Convert file to base64 data URI (fallback if no Cloudinary)."""
    with open(file_path, 'rb') as f:
        return f"data:video/mp4;base64,{base64.b64encode(f.read()).decode('utf-8')}"
