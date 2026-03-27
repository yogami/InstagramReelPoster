#!/bin/bash
# Vercel AI Accelerator — Expert Consortium (Shell version)
# Runs 4 models concurrently via curl (skipping Claude since we ARE Claude)

OR_KEY="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"
PPLX_KEY="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"
OUTDIR="/Users/user1000/gitprojects/InstagramReelPoster/vercel_accelerator_panel"
mkdir -p "$OUTDIR"

read -r -d '' PROMPT << 'PROMPTEOF'
## VERCEL AI ACCELERATOR PROGRAM
- 6-week program (Mar 2 – Apr 16, 2026), 40 teams globally
- Demo Day in San Francisco (Apr 16) — judges from AWS, Vercel, OpenAI, Cursor, Modal
- First place winner gets investment from Vercel Ventures
- Over $6M in credits: $30k Vercel, $25k AWS, $15k Anthropic, $15k OpenAI, etc.
- They want: "AI agents that operate independently and scale automatically"
- Pre-seed ideas. Judged on: submission quality, founder background, impact + scalability potential
- Must be Vercel customer. Tech is portable. FOCUS ON BUSINESS FIT.

## PORTFOLIO (Solo founder, Berlin)

### 1. AICanary — Startup Validation Engine
AI-powered startup intelligence: Canary Score, SWOT, Brutal Reality Check, competitor mapping. Uses LLM APIs for real-time market intelligence. Target: Founders, VCs. Stage: Live demo, no revenue, Next.js.

### 2. Agent Ops Mission Control — AI Agent Governance Platform
Compliance firewall for AI agent fleets: GDPR enforcement, 8ms local inference, 97% crisis detection. Agent Trust Protocol built BEFORE CSA published ATF spec. agent-pentest CLI on npm with 41 attack vectors. Target: Regulated enterprises. Stage: 12 microservices live, CIC Berlin demo, no revenue, Next.js.

### 3. ConvoGuard AI — Firewall for the Agentic Era
Standalone AI compliance middleware. Sub-20ms local inference. Could be SaaS for any AI app. Target: Any LLM deployer. Stage: Part of Mission Control, could be standalone.

### 4. Microcatchment Pro — Stormwater Intake Field OS
Engineering-grade stormwater auditing via PINN models. Target: Civil engineers. Stage: Working iOS app, no revenue, React Native.

### 5. TwinTap — Decentralized Professional Networking
On-device professional networking with AI matching. Target: Conference attendees. Stage: v2.0, 20 demo profiles, no users, PWA.

### 6. CascadeGuard — Supply Chain Finance Risk Platform
Cash-flow stress-testing + quantum optimization. Target: CFOs, credit insurers. Stage: POC, no users, React/Vite.

## YOUR TASK
Which ONE project BEST fits the Vercel AI Accelerator? BUSINESS FIT ONLY:
1. Market Timing (why now for Feb-Apr 2026?)
2. Demo Day Impact (WOW judges at SF?)
3. Credit Utilization (needs $150k+ in AI credits?)
4. Investor Appeal (Vercel Ventures?)
5. Scalability (pre-seed to Series A?)
6. Moat (defensible with scale?)
7. 6-Week Sprint (dramatic progress in 6 weeks?)

OUTPUT:
1. RANKING: All 6 projects best to worst (one-line each)
2. WINNER: #1 pick with 3-4 paragraph reasoning
3. 6-WEEK PLAN for the winner
4. DEMO DAY PITCH: 60-second pitch for winner
PROMPTEOF

# Escape the prompt for JSON
ESCAPED_PROMPT=$(echo "$PROMPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

echo "🧠 Running 4 experts concurrently..."

# GPT-5.2 — Vercel Insider
echo "  → GPT-5.2..."
curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OR_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://berlin-ai-labs.de" \
  -d "{\"model\":\"openai/gpt-5.2-chat\",\"messages\":[{\"role\":\"system\",\"content\":\"You are a senior PM at Vercel who designed the AI Accelerator. You know what makes a winning application.\"},{\"role\":\"user\",\"content\":$ESCAPED_PROMPT}],\"max_tokens\":3000,\"temperature\":0.7}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERROR'))" \
  > "$OUTDIR/gpt52_vercel_insider.md" 2>&1 &

# Grok 4.1 — Contrarian VC
echo "  → Grok 4.1..."
curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OR_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://berlin-ai-labs.de" \
  -d "{\"model\":\"x-ai/grok-4.1-fast\",\"messages\":[{\"role\":\"system\",\"content\":\"You are a contrarian deep-tech VC from Berlin. You hate AI wrappers. You only invest in genuine technical moats and regulatory advantages.\"},{\"role\":\"user\",\"content\":$ESCAPED_PROMPT}],\"max_tokens\":3000,\"temperature\":0.7}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERROR'))" \
  > "$OUTDIR/grok41_contrarian_vc.md" 2>&1 &

# DeepSeek v3.2 — Growth Strategist
echo "  → DeepSeek v3.2..."
curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OR_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://berlin-ai-labs.de" \
  -d "{\"model\":\"deepseek/deepseek-v3.2\",\"messages\":[{\"role\":\"system\",\"content\":\"You are a PLG growth strategist who scaled 3 devtools from 0 to 10M ARR. You evaluate viral loops, self-serve onboarding, and time-to-value.\"},{\"role\":\"user\",\"content\":$ESCAPED_PROMPT}],\"max_tokens\":3000,\"temperature\":0.7}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERROR'))" \
  > "$OUTDIR/deepseek_growth.md" 2>&1 &

# Perplexity Sonar Pro — Market Analyst
echo "  → Perplexity Sonar Pro..."
curl -s -X POST https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PPLX_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"sonar-pro\",\"messages\":[{\"role\":\"system\",\"content\":\"You are an AI market analyst with real-time data. Ground analysis in verifiable facts about 2026 AI market, competitors, and funding.\"},{\"role\":\"user\",\"content\":$ESCAPED_PROMPT}],\"max_tokens\":3000,\"temperature\":0.7}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERROR'))" \
  > "$OUTDIR/perplexity_market.md" 2>&1 &

echo "⏳ Waiting for all 4 responses..."
wait
echo "✅ All done. Checking results..."

for f in "$OUTDIR"/*.md; do
  fname=$(basename "$f")
  chars=$(wc -c < "$f")
  echo "  📄 $fname: $chars bytes"
done
