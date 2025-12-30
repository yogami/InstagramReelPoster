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
    """Lazy-load the model once and keep it in memory. Ultra-Optimized for 24GB."""
    global _pipe
    if _pipe is None:
        import torch
        from diffusers import FluxPipeline
        import os
        
        print("[FLUX1] Initializing container (Ultra-Memory mode)...")
        os.environ["HF_HOME"] = "/cache"
        os.environ["TRANSFORMERS_CACHE"] = "/cache"
        os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

        # Load FLUX.1-schnell
        _pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=torch.bfloat16,
            cache_dir="/cache"
        )
        
        # NUCLEAR OPTION: Sequential offload (layer-by-layer)
        # This is slower but guarantees it will fit on 24GB even with fragmentation
        _pipe.enable_sequential_cpu_offload()
        
        # High-res optimizations
        _pipe.enable_vae_tiling()
        _pipe.enable_vae_slicing()
        
        print("[FLUX1] Model loaded with SEQUENTIAL offload and VAE tiling active")
    return _pipe


@endpoint(
    name="flux1-image",
    image=image,
    gpu="A10G",
    memory="32Gi",
    cpu=4,
    volumes=[model_volume],
    keep_warm_seconds=60, # Release faster to keep GPU clean
    secrets=["HF_TOKEN"],
)
def generate_image(
    prompt: str,
    aspect_ratio: str = "9:16",
    num_inference_steps: int = 4,
    guidance_scale: float = 0.0,
    quality: str = "standard",
) -> dict:
    import torch
    import base64
    import gc
    from io import BytesIO
    from PIL import Image as PILImage
    
    pipe = get_pipe()
    
    # Adjusted resolution to be more stable on A10G
    if aspect_ratio == "9:16":
        width, height = (768, 1152) if quality == "hd" else (512, 896)
    elif aspect_ratio == "16:9":
        width, height = (1152, 768) if quality == "hd" else (896, 512)
    else:
        width, height = (1024, 1024) if quality == "hd" else (768, 768)
    
    print(f"[FLUX1] Generating image: {width}x{height} (Sequential mode)")
    
    with torch.inference_mode():
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()
            
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
    
    # Aggressive cleanup
    del result
    del image
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    return {
        "image_base64": f"data:image/png;base64,{image_base64}",
        "width": width,
        "height": height,
    }


