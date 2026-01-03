# Instagram Reel Poster

A production-ready backend service for generating Instagram reels for **Challenging View** — a channel at the intersection of spirituality, philosophy, science, and psychology.

## Features

- 🎙️ **Voice-to-Reel Pipeline**: Transcribe voice notes into polished video reels
- 🧠 **AI-Powered Content**: GPT-4.1 generates commentary in the "Challenging View" voice
- 🎵 **Smart Music Selection**: Catalog-first approach with AI fallback
- 🖼️ **Dynamic Visuals**: DALL-E 3 generates images for each story beat
- 📝 **Automatic Subtitles**: Whisper-generated SRT subtitles
- 🎬 **Video Rendering**: Shortstack integration for final video production
- ⚡ **Async Processing**: Non-blocking job queue with status polling

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Presentation Layer                          │
│  POST /process-reel  │  GET /jobs/:id  │  POST /telegram-webhook │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                           │
│     ReelOrchestrator  │  JobManager  │  MusicSelector           │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     Domain Layer                                │
│  ReelJob │ Segment │ Track │ ReelManifest │ DurationCalculator  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                          │
│  Transcription │ LLM │ TTS │ Music │ Images │ Subtitles │ Render │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- API keys for: OpenAI, Fish Audio, Shortstack, (optional) Kie.ai

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/InstagramReelPoster.git
cd InstagramReelPoster

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Run in development mode
npm run dev
```

### Configuration

Create a `.env` file based on `.env.example`:

```bash
# Required
OPENAI_API_KEY=sk-...
FISH_AUDIO_API_KEY=...
FISH_AUDIO_VOICE_ID=your-yami-voice-id
SHORTSTACK_API_KEY=...
SHORTSTACK_BASE_URL=https://api.shortstack.com

# Optional
KIE_API_KEY=...  # For AI music fallback
```

## API Reference

### POST /process-reel

Start a new reel generation job.

**Request:**
```bash
curl -X POST http://localhost:3000/process-reel \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAudioUrl": "https://example.com/voice-note.ogg",
    "targetDurationRange": { "min": 30, "max": 60 },
    "moodOverrides": ["contemplative", "slightly edgy"]
  }'
```

**Response (202 Accepted):**
```json
{
  "jobId": "job_abc12345",
  "status": "pending",
  "message": "Reel processing started"
}
```

### GET /jobs/:jobId

Check job status and results.

**Response (Processing):**
```json
{
  "jobId": "job_abc12345",
  "status": "generating_images",
  "step": "Creating visuals..."
}
```

**Response (Completed):**
```json
{
  "jobId": "job_abc12345",
  "status": "completed",
  "finalVideoUrl": "https://shortstack.com/videos/xyz.mp4",
  "reelDurationSeconds": 45,
  "voiceoverUrl": "https://fish.audio/...",
  "musicUrl": "https://catalog.com/track.mp3",
  "subtitlesUrl": "data:text/srt;base64,...",
  "manifest": { ... },
  "metadata": {
    "musicSource": "internal",
    "segmentCount": 5
  }
}
```

### GET /jobs

List all jobs.

### GET /health

Health check endpoint.

## Development

```bash
# Run tests
npm test

# Run unit tests only
npm run test:unit

# Run with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format

# Build
npm run build
```

## Deployment

### Docker

```bash
# Build image
docker build -t instagram-reel-poster .

# Run container
docker run -p 3000:3000 --env-file .env instagram-reel-poster
```

### Docker Compose

```bash
docker-compose up -d
```

### Railway / Fly.io

1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Deploy

## Music Selection Logic

The service uses a three-tier fallback for music:

1. **External Catalog** (if configured): Query royalty-free music API
2. **Internal Catalog**: Match from `data/internal_music_catalog.json`
3. **AI Generation**: Generate via Kie.ai/Suno as last resort

Tracks are scored by tag match and duration proximity.

## The "Challenging View" Voice

The LLM is prompted to write in a specific voice:

> *Spiritually grounded, but questioning and sharp. Uses psychological and scientific framing. Comfortable challenging comforting illusions and pointing out self-deception. Uses metaphors, occasional sarcasm, and strong, direct statements. No fluffy "Bay Area PC wellness" clichés.*

## Project Structure

```
src/
├── domain/              # Core business logic
├── application/         # Use cases & workflow orchestration
├── lib/                 # Decoupled Internal Microservices
│   ├── promo-engine/    # Persona training & AI script generation
│   └── website-promo/   # URL-to-Reel pipeline
├── infrastructure/      # Concrete adapters (LLM, TTS, Renderers)
├── presentation/        # HTTP layer (Express routes)
└── config/              # Environment & feature flags
```

## License

ISC
