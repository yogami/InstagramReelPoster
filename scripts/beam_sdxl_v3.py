"""
SDXL-Turbo Image Generation - Fixed Dependencies

Using latest compatible versions to avoid dependency conflicts.

Deploy with:
    beam deploy beam_sdxl_v3.py:generate_image
"""

from beam import endpoint, Image, Volume

# Use latest compatible versions
image = Image(
    python_version="python3.10",
    python_packages=[
        "torch",
        "diffusers",
        "transformers",
        "accelerate",
        "safetensors",
        "Pillow",
        "huggingface_hub",
    ],
)

model_volume = Volume(name="sdxl-turbo-v3", mount_path="/cache")


def load_models():
    """Load model at container startup."""
    import os
    import torch
    from diffusers import AutoPipelineForText2Image
    
    os.environ["HF_HOME"] = "/cache"
    os.environ["TRANSFORMERS_CACHE"] = "/cache"
    
    # Get HF token from environment
    hf_token = os.environ.get("HF_TOKEN", "")
    
    print("[SDXL-Turbo] Loading model...")
    
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=torch.float16,
        variant="fp16",
        cache_dir="/cache",
        use_safetensors=True,
        token=hf_token if hf_token else None,
    )
    pipe = pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)
    
    print("[SDXL-Turbo] Model loaded!")
    return pipe


@endpoint(
    name="sdxl-turbo-v3",
    image=image,
    gpu="A10G",
    memory="24Gi",  # More memory for stability
    cpu=4,
    volumes=[model_volume],
    keep_warm_seconds=120,
    on_start=load_models,
    secrets=["HF_TOKEN"],
)
def generate_image(context, prompt: str, aspect_ratio: str = "9:16") -> dict:
    """Generate image with pre-loaded model."""
    import torch
    import base64
    from io import BytesIO
    
    pipe = context.on_start_value
    
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
    
    return {
        "image_base64": f"data:image/png;base64,{image_base64}",
        "width": width,
        "height": height,
    }
