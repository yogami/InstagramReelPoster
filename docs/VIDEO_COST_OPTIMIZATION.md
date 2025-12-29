# Video Generation Cost Optimization Strategy

## Current Situation
- **Kling-2.6 (KIE.ai)**: $0.30-0.50 per video, reliable but expensive
- **Hunyuan (Beam H100)**: Cheaper but unreliable (cold starts, GPU scarcity)
- **Mochi (Beam A10G)**: Available but lower quality

## Proposed Multi-Tier Strategy

### Tier 1: **Hunyuan on Reserved H100** (Primary - Lowest Cost)
**Cost**: ~$2.50/hour H100 reserved = $0.05 per 5s video (50 videos/hour)
**Setup**:
1. Switch from spot to **reserved H100 instance** on Beam
2. Keep warm 24/7 during business hours (8am-8pm)
3. Use persistent volume for 30GB model weights

**Implementation**:
```python
@endpoint(
    name="hunyuan-video",
    gpu="H100:80GB",  # Reserved, not spot
    keep_warm_seconds=43200,  # 12 hours (business day)
    max_pending_tasks=100,
    autoscaler=QueueDepthAutoscaler(max_tasks_per_replica=10, max_replicas=3),
)
```

**Pros**:
- 95% cost reduction vs Kling
- Zero cold starts during business hours
- High quality output

**Cons**:
- $30/day reserved cost (but generates 600+ videos)
- Need to prewarm models once

---

### Tier 2: **Mochi on A10G** (Fallback - Medium Cost)
**Cost**: ~$0.50/hour A10G = $0.02 per 5s video
**Use When**: Hunyuan unavailable or after business hours

**Current Status**: Already deployed at `BEAMCLOUD_VIDEO_ENDPOINT_URL`

---

### Tier 3: **Kling-2.6** (Reliable Backup - High Cost)
**Cost**: $0.30-0.50 per video
**Use When**: Both Beam options fail

---

## Cost Comparison (1000 videos/month)

| Strategy | Monthly Cost | Savings |
|:---------|:-------------|:--------|
| **Kling Only** | $300-500 | Baseline |
| **Hunyuan Reserved (12h/day)** | $30 (reserved) + $50 (Kling fallback) = **$80** | **84% savings** |
| **Hunyuan Spot (current)** | Unreliable, frequent Kling fallback = ~$250 | 17% savings |

---

## Implementation Steps

### 1. Prewarm Hunyuan Models
```bash
# Call the prewarm endpoint once to download 30GB models
curl -X POST 'https://hunyuan-video-375f325-v1.app.beam.cloud/prewarm' \
  -H 'Authorization: Bearer YOUR_BEAM_TOKEN'
```

### 2. Update Beam Configuration
Change `beam_hunyuan_video.py`:
- Remove `gpu="H100"` spot request
- Add reserved instance configuration
- Increase `keep_warm_seconds` to 43200 (12 hours)

### 3. Update Fallback Chain
In `src/presentation/app.ts`, ensure proper fallback:
```typescript
Hunyuan (reserved, business hours) 
  → Mochi (A10G, cheap fallback)
  → Kling (reliable, expensive last resort)
```

### 4. Add Business Hours Logic
```typescript
const isBusinessHours = () => {
  const hour = new Date().getHours();
  return hour >= 8 && hour <= 20; // 8am-8pm
};

const videoClient = isBusinessHours() 
  ? hunyuanClient 
  : mochiClient; // Use cheaper Mochi after hours
```

---

## Alternative: **Replicate.com Hunyuan**
If Beam H100 is too expensive, consider Replicate's managed Hunyuan:
- **Cost**: ~$0.10 per video
- **Pros**: No infrastructure management, reliable
- **Cons**: 3x more expensive than Beam reserved

---

## Recommendation

**Start with Hunyuan Reserved H100 (12h/day)**:
1. Prewarm models today
2. Test reliability for 1 week
3. If >95% success rate, switch from Kling to Hunyuan as primary
4. Expected savings: **$220/month** on 1000 videos

**ROI**: Reserved H100 pays for itself after just 60 videos vs Kling.
