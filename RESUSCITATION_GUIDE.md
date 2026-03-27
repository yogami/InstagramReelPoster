# 🎬 Instagram Reel Poster: Resuscitation Guide (Zero-Cost Hosting)

Current infrastructure of this project was relying heavily on **Railway (Pro)** and **Beam.cloud (GPU)**, which were expensive. Following the "Google Ultra Plan" directive, we have migrated the core intelligence and rendering to a zero-cost path.

## 🚀 The Zero-Cost Strategy

1.  **AI Intelligence (Gemini)**: Switched LLM, Transcription, and Image Generation to **Google Gemini 1.5 & Imagen 3**. 
    *   **Cost**: $0 (via Google AI Studio Free Tier / Google Ultra Plan).
    *   **Removed**: OpenAI Whisper, Beam.cloud Flux1, Beam.cloud Hunyuan/Mochi.
2.  **Video Rendering (Local FFmpeg)**: Configured to use internal FFmpeg instead of Shotstack/Shotstack APIs.
    *   **Cost**: $0 (Runs on your CPU).
3.  **Hosting (Google Cloud Run)**: Migrate from Railway to Google Cloud Run.
    *   **Cost**: $0 (within 2M requests/month free tier).
    *   **Benefit**: Scales to zero. No "idle" instance costs like Railway. FFmpeg is installed via Docker.

---

## 🛠️ Step 1: Environment Configuration

Set these variables in your Google Cloud Secret Manager or Cloud Run Environment:

| Variable | Recommended Value | Why? |
| :--- | :--- | :--- |
| `GOOGLE_AI_API_KEY` | `***` | Primary key for LLM, STT, and Imagen 3. |
| `VIDEO_RENDERER` | `ffmpeg` | Use local rendering to avoid Shotstack costs. |
| `BEAMCLOUD_ENABLED` | `false` | Disable expensive GPU offloading. |
| `BEAMCLOUD_VIDEO_ENABLED` | `false` | Use image-based reels (Imagen 3) to keep it free. |
| `REDIS_URL` | `rediss://...` | Use **Upstash Redis** (Free Tier) to avoid Railway Redis costs. |
| `CLOUDINARY_*` | `***` | Keep existing Cloudinary (Free Tier is 25GB). |

---

## 📦 Step 2: Deploy to Google Cloud Run

Run this command from the `InstagramReelPoster` directory:

```bash
# Build and Deploy in one go
gcloud run deploy instagram-reel-poster \
  --source . \
  --region europe-west3 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --set-env-vars="VIDEO_RENDERER=ffmpeg,GOOGLE_AI_API_KEY=YOUR_KEY"
```

*Note: The included Dockerfile contains all dependencies (FFmpeg, Playwright, Node.js).*

---

## 🎨 Step 3: Resuscitate ReelBerlin-Demo

The frontend (`ReelBerlin-Demo`) is now configured to automatically detect the API URL if hosted together.

1.  **Hosting**: Upload `index.html`, `style.css`, and `app.js` to **GitHub Pages** (Free).
2.  **API Connection**: The `app.js` now uses `window.location.origin` as the fallback, so if you host the frontend files in the `public/` folder of the backend, it works perfectly.

### Recommended Structure for Cloud Run:
Move `ReelBerlin-Demo/*` into `InstagramReelPoster/public/`.
Then your Cloud Run service hosts both the API and the Demo UI.

---

## ✅ Results of Migration
*   **Beam.cloud Bills**: Terminated.
*   **Railway Bills**: Terminated.
*   **Shotstack Bills**: Terminated.
*   **AI Quality**: Upgraded to Google Imagen 3 and Gemini 1.5 Flash.
*   **Scalability**: Auto-scales from 0 to 1000 users without manual intervention.
