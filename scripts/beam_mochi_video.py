"""
Mochi Video Generation Endpoint for Beam.cloud

Mochi 1 is an open-source text-to-video model from Genmo.
Generates ~3-6 second video clips.

Deploy with:
    beam deploy beam_mochi_video.py:generate_video
"""

from beam import endpoint, Image, Volume

image = Image(
    python_version="python3.10",
    python_packages=[
        "torch",
        "diffusers",
        "transformers",
        "accelerate",
        "safetensors",
        "imageio",
        "imageio-ffmpeg",
        "huggingface_hub",
    ],
)

model_volume = Volume(name="mochi-model-cache", mount_path="/cache")


def load_model():
    """Load Mochi model at container startup."""
    import os
    import torch
    
    os.environ["HF_HOME"] = "/cache"
    os.environ["TRANSFORMERS_CACHE"] = "/cache"
    
    print("[Mochi] Loading model...")
    
    try:
        from diffusers import MochiPipeline
        
        pipe = MochiPipeline.from_pretrained(
            "genmo/mochi-1-preview",
            torch_dtype=torch.bfloat16,
            cache_dir="/cache",
        )
        pipe = pipe.to("cuda")
        pipe.enable_model_cpu_offload()  # Save VRAM
        
        print("[Mochi] Model loaded!")
        return pipe
    except Exception as e:
        print(f"[Mochi] Failed to load Mochi, trying CogVideoX fallback: {e}")
        from diffusers import CogVideoXPipeline
        
        pipe = CogVideoXPipeline.from_pretrained(
            "THUDM/CogVideoX-2B",
            torch_dtype=torch.bfloat16,
            cache_dir="/cache",
        )
        pipe = pipe.to("cuda")
        pipe.enable_model_cpu_offload()
        
        print("[CogVideoX] Fallback model loaded!")
        return pipe


@endpoint(
    name="mochi-video",
    image=image,
    gpu="A10G",  # A10G has 24GB VRAM - should work with CPU offload
    memory="32Gi",
    cpu=8,
    volumes=[model_volume],
    keep_warm_seconds=120,
    on_start=load_model,
    secrets=["HF_TOKEN"],
)
def generate_video(
    context,
    prompt: str,
    duration_seconds: int = 5,
    aspect_ratio: str = "9:16",
) -> dict:
    """Generate video using Mochi or CogVideoX."""
    import torch
    import base64
    import tempfile
    import imageio
    
    pipe = context.on_start_value
    
    # Determine dimensions
    if aspect_ratio == "9:16":
        width, height = 480, 848
    elif aspect_ratio == "16:9":
        width, height = 848, 480
    else:
        width, height = 512, 512
    
    # Generate frames
    num_frames = min(duration_seconds * 8, 48)  # ~8 fps, max 48 frames
    
    enhanced_prompt = f"{prompt}. High quality, smooth motion, cinematic."
    
    print(f"[VideoGen] Generating {num_frames} frames: '{enhanced_prompt[:60]}...'")
    
    result = pipe(
        prompt=enhanced_prompt,
        num_frames=num_frames,
        height=height,
        width=width,
        num_inference_steps=30,
        guidance_scale=6.0,
        generator=torch.Generator("cuda").manual_seed(42),
    )
    
    frames = result.frames[0]
    
    # Save to temporary file
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        video_path = f.name
    
    imageio.mimsave(video_path, frames, fps=8, codec="libx264")
    
    # Read and encode
    with open(video_path, "rb") as f:
        video_base64 = base64.b64encode(f.read()).decode("utf-8")
    
    print(f"[VideoGen] Video generated ({len(frames)} frames)")
    
    return {
        "video_base64": f"data:video/mp4;base64,{video_base64}",
        "duration_seconds": len(frames) / 8,
        "frame_count": len(frames),
    }
