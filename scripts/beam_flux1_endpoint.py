"""
FLUX1 Image Generation Endpoint for Beam.cloud

Deploy with:
    pip install beam-client && beam configure default --token YOUR_TOKEN
    beam deploy app.py:generate_image

After deployment, you'll get an endpoint URL like:
    https://app.beam.cloud/endpoint/flux1-image
"""

from beta9 import endpoint, Image, Volume

# Use a pre-built image with CUDA and PyTorch
image = Image(
    python_version="python3.10",
    python_packages=[
        "torch>=2.0.0",
        "diffusers>=0.25.0",
        "transformers>=4.36.0",
        "accelerate>=0.25.0",
        "safetensors",
        "sentencepiece",
        "protobuf",
        "Pillow",
    ],
)

# Cache model weights to avoid re-downloading
model_volume = Volume(name="flux1-model-cache", mount_path="/cache")

import torch
from diffusers import FluxPipeline
from PIL import Image as PILImage
import base64
from io import BytesIO
import os

# Global Load - Happens once per container
print(f"[FLUX1] Initializing container & loading model...")
os.environ["HF_HOME"] = "/cache"
os.environ["TRANSFORMERS_CACHE"] = "/cache"

# Load FLUX.1-schnell (fast, ~5s per image)
pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-schnell",
    torch_dtype=torch.bfloat16,
    cache_dir="/cache"
)
# Move to CUDA immediately
pipe = pipe.to("cuda")
print(f"[FLUX1] Model loaded successfully")


@endpoint(
    name="flux1-image",
    image=image,
    gpu="A10G",  # Good balance of speed and cost. Options: T4, A10G, A100-40, A100-80, H100
    memory="16Gi",
    cpu=4,
    volumes=[model_volume],
    keep_warm_seconds=60,  # Keep GPU warm for 60s to reduce cold starts
    secrets=["HF_TOKEN"],  # HuggingFace token for gated model access
)
def generate_image(
    prompt: str,
    aspect_ratio: str = "9:16",
    num_inference_steps: int = 4,  # FLUX.1-schnell is optimized for 1-4 steps
    guidance_scale: float = 0.0,   # FLUX.1-schnell works best with 0 guidance
    quality: str = "standard",
) -> dict:
    """
    Generate an image using FLUX.1-schnell model.
    
    Args:
        prompt: Text description of the image to generate
        aspect_ratio: Image aspect ratio (9:16 for vertical/reels, 16:9 for landscape)
        num_inference_steps: Number of denoising steps (1-4 for schnell, 20-50 for dev)
        guidance_scale: How closely to follow the prompt (0 for schnell, 3.5+ for dev)
        quality: 'standard' or 'hd' (affects resolution)
    
    Returns:
        dict with 'image_base64' containing data URI
    """
    # Imports are global now
    
    # Determine resolution based on aspect ratio and quality
    if aspect_ratio == "9:16":
        width, height = (768, 1344) if quality == "hd" else (576, 1024)
    elif aspect_ratio == "16:9":
        width, height = (1344, 768) if quality == "hd" else (1024, 576)
    else:  # 1:1 square
        width, height = (1024, 1024) if quality == "hd" else (768, 768)
    
    print(f"[FLUX1] Generating image: '{prompt[:100]}...'")
    
    # Generate image
    with torch.inference_mode():
        result = pipe(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=torch.Generator("cuda").manual_seed(42),
        )
    
    image = result.images[0]
    
    # Convert to base64
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.read()).decode("utf-8")
    
    print(f"[FLUX1] Image generated successfully ({width}x{height})")
    
    return {
        "image_base64": f"data:image/png;base64,{image_base64}",
        "width": width,
        "height": height,
    }


# For local testing
if __name__ == "__main__":
    result = generate_image(
        prompt="A beautiful sunset over the ocean, cinematic, 8k, photorealistic",
        aspect_ratio="9:16",
    )
    print(f"Generated image with {len(result['image_base64'])} bytes")
