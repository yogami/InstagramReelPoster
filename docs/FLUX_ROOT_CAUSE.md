## FLUX Image Generation - ROOT CAUSE IDENTIFIED

### The Bug

The Beam.cloud deployment script (`beam_sdxl_v3.py`) has this signature:
```python
def generate_image(context, prompt: str, aspect_ratio: str = "9:16") -> dict:
```

The **`context` parameter** is a Beam.cloud convention - it's automatically injected by Beam and should NOT be included in the HTTP request body.

### What We're Sending (WRONG)
```json
{
  "prompt": "...",
  "aspect_ratio": "9:16"
}
```

### What Beam Expects
When calling a Beam endpoint with `context` as first param, the HTTP body should ONLY contain the user-defined parameters:
```json
{
  "prompt": "...",
  "aspect_ratio": "9:16"
}
```

But Beam is interpreting our JSON incorrectly because the function signature doesn't match standard REST conventions.

### The Real Issue

Looking at the Beam.cloud documentation, when a function has `context` as the first parameter, you call it differently. The `context` is injected by Beam's infrastructure, not passed via HTTP.

However, our current request format IS correct for Beam endpoints. The issue is that the **deployed version might be using a different function signature** than what's in our codebase.

### Solution

We need to verify which exact version is deployed to `https://sdxl-turbo-v3-9c4ba01-v1.app.beam.cloud` and ensure our client matches that signature.

**Next Step**: Check Beam.cloud dashboard to see the actual deployed function signature, or redeploy with the correct signature.
