"""
SDXL-Turbo Image Generation with Proper Model Loading

Key fix: Use a loader class to load the model ONCE at container startup,
not on every request. This is the standard pattern for large ML models.

Deploy with:
    beam deploy beam_sdxl_fixed.py:generate_image
"""

from beam import endpoint, Image, Volume, env

# Use a pre-built image with CUDA
image = Image(
    python_version="python3.10",
    python_packages=[
        "torch==2.1.0",
        "diffusers==0.24.0",  # Specific stable version
        "transformers==4.35.0",  # Specific stable version
        "accelerate==0.24.0",
        "safetensors",
        "Pillow",
    ],
)

model_volume = Volume(name="sdxl-turbo-cache", mount_path="/cache")


def load_models():
    """Called once when the container starts. Load model into GPU memory."""
    import os
    import torch
    from diffusers import AutoPipelineForText2Image
    
    os.environ["HF_HOME"] = "/cache"
    os.environ["TRANSFORMERS_CACHE"] = "/cache"
    os.environ["HF_TOKEN"] = env.get("HF_TOKEN", "")
    
    print("[SDXL-Turbo] Loading model at container startup...")
    
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=torch.float16,
        variant="fp16",
        cache_dir="/cache",
        use_safetensors=True,
    )
    pipe = pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)
    
    print("[SDXL-Turbo] Model loaded successfully!")
    return pipe


@endpoint(
    name="sdxl-turbo-v2",
    image=image,
    gpu="A10G",
    memory="16Gi",
    cpu=4,
    volumes=[model_volume],
    keep_warm_seconds=120,  # Keep warm longer
    on_start=load_models,  # Load model at startup
    secrets=["HF_TOKEN"],
)
def generate_image(context, prompt: str, aspect_ratio: str = "9:16") -> dict:
    """
    Generate an image using SDXL-Turbo.
    
    The model is pre-loaded via on_start, accessible via context.on_start_value
    """
    import torch
    import base64
    from io import BytesIO
    
    pipe = context.on_start_value  # Get pre-loaded model
    
    # Determine resolution
    if aspect_ratio == "9:16":
        width, height = 576, 1024
    elif aspect_ratio == "16:9":
        width, height = 1024, 576
    else:
        width, height = 768, 768
    
    enhanced_prompt = f"{prompt}. Cinematic, high quality, 8k, photorealistic."
    
    print(f"[SDXL-Turbo] Generating: '{enhanced_prompt[:60]}...'")
    
    result = pipe(
        prompt=enhanced_prompt,
        width=width,
        height=height,
        num_inference_steps=4,
        guidance_scale=0.0,
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
