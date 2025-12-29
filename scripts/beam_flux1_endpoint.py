"""
FLUX1 Image Generation Endpoint for Beam.cloud - Optimized for A10G (24GB)

Deploy with:
    beam deploy scripts/beam_flux1_endpoint.py:generate_image
"""

from beta9 import endpoint, Image, Volume

# Use a pre-built image with CUDA and PyTorch
image = Image(
    python_version="python3.10",
    python_packages=[
        "torch>=2.0.1",
        "diffusers>=0.30.0",
        "transformers>=4.44.0",
        "accelerate>=0.33.0",
        "safetensors",
        "sentencepiece",
        "protobuf",
        "Pillow",
    ],
)

# Cache model weights to avoid re-downloading
model_volume = Volume(name="flux1-model-cache", mount_path="/cache")

# Global pipe object for stateful persistence between requests in the same container
_pipe = None

def get_pipe():
    """Lazy-load the model once and keep it in memory. Optimized for 24GB VRAM."""
    global _pipe
    if _pipe is None:
        import torch
        from diffusers import FluxPipeline
        import os
        
        print("[FLUX1] Initializing container & loading model (Optimized for 24GB)...")
        os.environ["HF_HOME"] = "/cache"
        os.environ["TRANSFORMERS_CACHE"] = "/cache"

        # Load FLUX.1-schnell
        # We use bfloat16 which is native for A10G/Ampere
        _pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=torch.bfloat16,
            cache_dir="/cache"
        )
        
        # CRITICAL: Enable model CPU offload to stay within 24GB limits
        # This moves components between CPU and GPU as needed.
        # It is the only way to reliably run Flux on A10G (24GB).
        _pipe.enable_model_cpu_offload()
        
        print("[FLUX1] Model loaded with CPU offload enabled")
    return _pipe


@endpoint(
    name="flux1-image",
    image=image,
    gpu="A10G",  # 24GB VRAM
    memory="32Gi", # Increased system memory for offloading
    cpu=4,
    volumes=[model_volume],
    keep_warm_seconds=300, # Keep warm longer to avoid expensive reload
    secrets=["HF_TOKEN"],
)
def generate_image(
    prompt: str,
    aspect_ratio: str = "9:16",
    num_inference_steps: int = 4, # Schnell needs 4 steps
    guidance_scale: float = 0.0,
    quality: str = "standard",
) -> dict:
    import torch
    import base64
    from io import BytesIO
    from PIL import Image as PILImage
    
    # Get the stateful pipe
    pipe = get_pipe()
    
    # Determine resolution
    if aspect_ratio == "9:16":
        width, height = (768, 1344) if quality == "hd" else (576, 1024)
    elif aspect_ratio == "16:9":
        width, height = (1344, 768) if quality == "hd" else (1024, 576)
    else:
        width, height = (1024, 1024) if quality == "hd" else (768, 768)
    
    print(f"[FLUX1] Generating image: '{prompt[:100]}...'")
    
    # Generate image
    with torch.inference_mode():
        # Clean torch cache before generation to maximize available VRAM
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            
        result = pipe(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=torch.Generator("cuda").manual_seed(42) if torch.cuda.is_available() else None,
        )
    
    image = result.images[0]
    
    # Convert to base64
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.read()).decode("utf-8")
    
    print(f"[FLUX1] Image generated successfully ({width}x{height})")
    
    # Explicitly clear cache after generation
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    return {
        "image_base64": f"data:image/png;base64,{image_base64}",
        "width": width,
        "height": height,
    }
