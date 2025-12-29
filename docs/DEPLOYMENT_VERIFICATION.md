# Branding Overlay - Deployment Verification Checklist

## Current Status

Latest commits pushed to GitHub:
- `fbf2a42` - Remove logo from contact card overlay
- `1fe039b` - Fix logo distortion and conditional display  
- `49e059f` - Add comprehensive tests

All tests passing locally ✅

## What Should Happen in New Videos

### Logo (Top-Right Corner)
- ✅ Small logo in top-right
- ✅ 20% scale
- ✅ `fit: contain` (no stretching)
- ✅ Visible throughout video

### Contact Card (Bottom of Last Segment)
- ✅ Only appears if contact info exists (address/phone/email/hours)
- ✅ NO logo in the card (logo is separate in top-right)
- ✅ Shows: Business name + contact details
- ✅ Positioned at bottom with 15% offset
- ✅ Appears for entire duration of last segment

## Verification Steps

### 1. Check Railway Deployment
```
1. Go to Railway dashboard
2. Check latest deployment timestamp
3. Verify it's AFTER 09:00 CET (when fbf2a42 was pushed)
4. Check deployment logs for any errors
```

### 2. Generate NEW Video
```
1. Submit a NEW website promo request
2. Wait for completion
3. Download and inspect the video
```

### 3. What to Look For

**If you see:**
- Logo stretched/blurred → Railway hasn't deployed OR using cached old code
- Contact card missing → No contact info in scraped data (check manifest)
- Logo appears twice → Railway hasn't deployed fbf2a42

**Expected behavior:**
- Sharp logo in top-right (not stretched)
- Contact card at bottom of last segment (no logo in card)
- Contact card only if address/phone/email/hours exist

## Debugging

If issues persist after NEW video generation:

### Check Manifest
```typescript
// In production logs, look for:
console.log('Manifest branding:', manifest.branding);
```

Should show:
```json
{
  "logoUrl": "https://...",
  "businessName": "...",
  "address": "...",  // At least ONE of these
  "phone": "...",    // must exist for
  "email": "..."     // card to appear
}
```

### Check Timeline Payload
The payload sent to Timeline.io should have:
- Track 5: Logo with `scale: 0.2`, `fit: "contain"`
- Track 4: Contact card HTML (if contact info exists)

## If Still Broken

1. **Verify deployment**: Check Railway logs
2. **Clear cache**: Railway might be using cached Docker image
3. **Manual redeploy**: Trigger manual redeploy in Railway
4. **Check environment**: Ensure VIDEO_RENDERER is set correctly

## Timeline for Fix

- Code pushed: 09:00 CET
- Railway auto-deploy: ~2-5 minutes
- First new video: After deployment completes

**You must generate a NEW video after deployment to see the fixes.**
