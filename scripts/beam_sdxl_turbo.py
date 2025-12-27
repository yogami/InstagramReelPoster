"""
SDXL-Turbo Image Generation Endpoint for Beam.cloud

SDXL-Turbo is a distilled version of SDXL that generates high-quality images in just 1-4 steps.
Much simpler to deploy than FLUX1 and produces excellent results.

Deploy with:
    beam deploy beam_sdxl_turbo.py:generate_image
"""

from beam import endpoint, Image, Volume

image = Image(
    python_version="python3.10",
    python_packages=[
        "torch>=2.0.0",
        "diffusers>=0.25.0",
        "transformers>=4.36.0",
        "accelerate>=0.25.0",
        "safetensors",
        "Pillow",
        "invisible_watermark",  # Required by SDXL
    ],
)

model_volume = Volume(name="sdxl-turbo-cache", mount_path="/cache")


@endpoint(
    name="sdxl-turbo-image",
    image=image,
    gpu="A10G",
    memory="16Gi",
    cpu=4,
    volumes=[model_volume],
    keep_warm_seconds=60,
    secrets=["HF_TOKEN"],
)
def generate_image(
    prompt: str,
    aspect_ratio: str = "9:16",
    num_inference_steps: int = 4,
    guidance_scale: float = 0.0,
    quality: str = "standard",
) -> dict:
    """
    Generate an image using SDXL-Turbo (stabilityai/sdxl-turbo).
    Very fast (~2s per image) with excellent quality.
    """
    import torch
    from diffusers import AutoPipelineForText2Image
    from PIL import Image as PILImage
    import base64
    from io import BytesIO
    import os
    
    os.environ["HF_HOME"] = "/cache"
    os.environ["TRANSFORMERS_CACHE"] = "/cache"
    
    # Determine resolution
    if aspect_ratio == "9:16":
        width, height = (576, 1024) if quality == "standard" else (768, 1344)
    elif aspect_ratio == "16:9":
        width, height = (1024, 576) if quality == "standard" else (1344, 768)
    else:
        width, height = (768, 768) if quality == "standard" else (1024, 1024)
    
    print(f"[SDXL-Turbo] Loading model...")
    
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=torch.float16,
        variant="fp16",
        cache_dir="/cache"
    )
    pipe = pipe.to("cuda")
    
    # Enhance prompt for cinematic quality
    enhanced_prompt = f"{prompt}. Style: Cinematic, high quality, 8k, photorealistic, dramatic lighting."
    
    print(f"[SDXL-Turbo] Generating: '{enhanced_prompt[:80]}...'")
    
    result = pipe(
        prompt=enhanced_prompt,
        width=width,
        height=height,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
        generator=torch.Generator("cuda").manual_seed(42),
    )
    
    image = result.images[0]
    
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.read()).decode("utf-8")
    
    print(f"[SDXL-Turbo] Done ({width}x{height})")
    
    return {
        "image_base64": f"data:image/png;base64,{image_base64}",
        "width": width,
        "height": height,
    }
