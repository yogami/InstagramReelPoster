# 🚀 Deployment Guide: InstagramReelPoster

This application is optimized for **Zero-Cost / Low-Cost production** using Google Gemini and local FFmpeg rendering.

## 🧱 Prerequisites
*   **Google Cloud Project** with Billing enabled (to access Cloud Run Free Tier).
*   **Google AI API Key** (Gemini API).
*   **Cloudinary Account** (for media storage).
*   **Docker** installed locally.

## ☁️ Option 1: Google Cloud Run (Recommended)
Google Cloud Run offers a generous free tier and automatically scales to zero when not in use.

### 1. Build and Push to Artifact Registry
```bash
# Authenticate
gcloud auth login
gcloud auth configure-docker <REGION>-docker.pkg.dev

# Create Repo (if not exists)
gcloud artifacts repositories create reels-repo --repository-format=docker --location=<REGION>

# Build & Tag
docker build -t <REGION>-docker.pkg.dev/<PROJECT_ID>/reels-repo/poster-service .

# Push
docker push <REGION>-docker.pkg.dev/<PROJECT_ID>/reels-repo/poster-service
```

### 2. Deploy to Cloud Run
```bash
gcloud run deploy poster-service \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/reels-repo/poster-service \
  --platform managed \
  --region <REGION> \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars "NODE_ENV=production,GOOGLE_AI_API_KEY=your_key,CLOUDINARY_CLOUD_NAME=name,CLOUDINARY_API_KEY=key,CLOUDINARY_API_SECRET=secret"
```

## 🐳 Option 2: Docker Compose (Local/VPS)
For a quick self-hosted setup:

```bash
docker compose up -d
```

## 🧪 Operational Verification (Smoke Test)
Once deployed, verify the API is operational:

### 1. Health Check
```bash
curl https://your-service-url/health
```

### 2. Trigger Website Promo (Dry Run)
```bash
curl -X POST https://your-service-url/website \
  -H "Content-Type: application/json" \
  -d '{
    "website": "https://example.com",
    "consent": true,
    "language": "en"
  }'
```

---

## 🛠️ Maintenance & Logs
*   **Logs:** View in Google Cloud Console under Cloud Run > Logs.
*   **Cleanup:** Local `jobs.json` is stored in `/app/data` inside the container. For persistence, attach a Cloud Storage volume.
