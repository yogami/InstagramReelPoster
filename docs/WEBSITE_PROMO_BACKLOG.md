# Website Promo Reel - Future Enhancements Backlog

## Overview
Advanced features to transform the basic website scraper into a "Semantic Site DNA" engine that reverse-engineers business psychology for higher-converting promos.

---

## Phase A: Semantic Structure Parser (Medium Priority)
**Goal**: Move from surface text to psychological intent detection.

### Features
- [ ] **Core Promise Extraction**: Combine Hero H1 + CTA button text to identify the business's "Core Promise"
- [ ] **Customer Wound Detection**: Scrape `/pricing` page pain points and testimonials for "Customer Wounds"
- [ ] **Social Proof DNA**: Extract testimonials, star ratings, client logos, and "X+ clients served" patterns
- [ ] **Urgency Triggers**: Detect footer urgency ("Limited spots", "Book now", countdown timers)

### Implementation
- Upgrade `WebsiteScraperClient` to scrape multiple pages (`/`, `/about`, `/pricing`, `/testimonials`)
- Add Puppeteer fallback for JavaScript-heavy sites (React SPAs)
- Create `SemanaticAnalyzer` class to score each psychological element

---

## Phase B: Virality Forecaster (High Impact)
**Goal**: Predict reel performance before rendering.

### Features
- [ ] **Virality Score Model**: Train ML model on reel analytics (`/api/reels/:id/analytics`)
- [ ] **PlaysPerThousand Prediction**: "This gym reel scores 87% viral potential → 1.2k plays expected"
- [ ] **A/B Hook Ranking**: Score multiple hook options and pick the one with highest predicted engagement
- [ ] **Category Trend Adjustment**: Factor in Berlin cafe/gym/restaurant trend data

### Implementation
- Build training dataset from existing reel analytics (plays, comments, shares)
- Create `ViralityPredictor` service with simple logistic regression (upgradable to neural net)
- Add `viralPredict` field to API response

---

## Phase C: Psychology Scoring Output (Differentiator)
**Goal**: Provide explainable AI scores for B2B clients.

### Output JSON Enhancement
```json
{
  "siteDNA": {
    "painScore": 8.7,
    "trustSignals": ["4.9 stars", "500+ clients", "Featured in TechCrunch"],
    "urgency": "Limited spots available",
    "viralPredict": "1.2k plays expected",
    "competitorComparison": "Your DNA: 9.2/10 vs competitor average: 4.2/10"
  },
  "scenes": [ ... ]
}
```

### Use Cases
- "Your cafe site DNA: 9.2/10 trust → 1.8k plays predicted vs competitor's 400"
- "Gym pain score 8.7 → 3x comments vs generic reels"
- Demo mode: Analyze competitor site and show why we beat them

---

## Phase D: Technical Moat (Competitive Advantage)

| Competitor Tech | ReelBerlin DNA | Copy Difficulty |
|-----------------|----------------|-----------------|
| Regex scraping  | LLM semantic parsing | Easy → Expert |
| Static prompts  | Psychology scoring + viral ML | Medium → Hard |
| Manual category | Auto-DNA from site hierarchy | Hard → Expert |
| No prediction   | PlaysPerThousand forecast | Expert → PhD |

### Barriers to Entry
- 6 months dev + 100 Berlin sites training data = uncopyable moat
- TypeScript + viral reel history = instant advantage

---

## Implementation Priority

1. **Quick Win** (1-2 days): Add multi-page scraping (`/about`, `/pricing`)
2. **Medium Term** (1 week): Implement painScore/trustScore extraction
3. **High Impact** (2 weeks): Build virality predictor from existing analytics
4. **Moat Builder** (ongoing): Collect training data from every Berlin site scraped

---

## Pitch Destroyer
> "ReelBerlin doesn't guess. It reads your site's DNA—pain points, trust signals, urgency.
> Predicted: 1.5k plays. Mootion: ????"

Demo: Run on competitor Mootion's site → "Their DNA scores 4.2/10. Here's why your reel beats them."
