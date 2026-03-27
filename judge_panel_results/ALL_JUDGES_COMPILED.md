# GenAI Zürich Award — Judge Panel Results

**Date:** 2026-02-09T11:17:11.133Z
**Judges:** 4

════════════════════════════════════════════════════════════════════════════════

# 🎓 Judge: Gemini 2.0 Flash Thinking
**Model:** `google/gemini-2.0-flash-thinking-exp:free`
**Response time:** 0s

---

ERROR: HTTP 401: {"error":{"message":"User not found.","code":401}}

════════════════════════════════════════════════════════════════════════════════

# 🎓 Judge: Claude 3.5 Sonnet
**Model:** `anthropic/claude-3.5-sonnet`
**Response time:** 0s

---

ERROR: HTTP 401: {"error":{"message":"User not found.","code":401}}

════════════════════════════════════════════════════════════════════════════════

# 🎓 Judge: DeepSeek R1
**Model:** `deepseek/deepseek-r1`
**Response time:** 0s

---

ERROR: HTTP 401: {"error":{"message":"User not found.","code":401}}

════════════════════════════════════════════════════════════════════════════════

# 🎓 Judge: Perplexity Sonar Pro
**Model:** `sonar-pro`
**Response time:** 19.3s

---

## 1. COMPREHENSION TEST
Agent Ops Mission Control solves the problem of deploying autonomous AI agents in regulated European environments (e.g., GDPR, EU AI Act, BfArM for health tech), where manual compliance checks delay operations from weeks to impractical scales. It solves this via a production dashboard enforcing runtime governance: ConvoGuard (ONNX-based inference firewall for real-time checks on consent, crises, etc.), cryptographic proofs (Ed25519 on Solana for behavior verification), policy-as-code segmentation, kill switches, and ATF (Agentic Trust Framework) covering identity, data, and incident response—all vendor-neutral across LLM providers.

Unclear elements: What is "Ralph Wiggum" persistence engine (original submission only, undefined and dropped in revision)? Exact nature of "ConvoGuard" training data and how benchmarks (F1 scores, n=312/847) were derived—public API mentioned but no independent audit linked. "TrustScore" computation details absent. BfArM XML export specifics unverified beyond claims.

The submission tells a **coherent story** in the revision: evolution from GDPR dashboard to full ATF implementation, with shipped updates and verifiability emphasized. Original felt fragmented (vague claims like "100% critical failures blocked" without metrics); revision tightens narrative around "production code vs. whitepapers."

## 2. SCORECARD
- **Innovation (35%)**: 7/10. Claims "Europe's first working ATF implementation" with microservices, ONNX firewall, ZK proofs, and maturity model show solid engineering novelty in agent governance, leveraging new methods like Solana anchoring and policy-as-code. But it's evolutionary (builds on CSA specs others "published with zero code") rather than groundbreaking—no new AI architectures/models invented, just integration. Metrics like 8ms latency and F1=0.97 are promising but toy-scale (n<1000).[1]
- **Impact (35%)**: 5/10. Potential societal benefit in EU AI Act compliance (Aug 2026) for high-risk agents (e.g., mental health bots), with quantifiable benchmarks and demos at CIC Berlin/HelloBetter feedback. No revenue, user counts, or real-world metrics (e.g., agents governed, cost savings)—just "serves as operator dashboard" without proof of adoption or business value.[2]
- **Scalability & Sustainability (10%)**: 7/10. Architected for 10k+ agents, open-source on GitHub/Railway/npm, 15k LoC TypeScript, 459 tests, multi-model support. Maturity model and auto-testing aid maintenance, but single-founder's vibe ("I shipped") raises sustainability risks without team evidence.[1]
- **Ethical & Responsible AI (10%)**: 8/10. Strong: Transparency page/limits disclosed, bias mitigation via ONNX/local inference (no data leaves device), adversarial testing (41 vectors), EU AI Act coverage. Public benchmarks API enables verification—ticks key boxes like audit trails and kill switches.[8]
- **Production Readiness (10%)**: 6/10. Live on Railway with APIs, microservices deployed, tested integrations (SIEM, XML)—beyond prototype. But no paying users, deployment duration (submitted Jan 10, revised Feb 9), or stakeholder traction beyond "demoed at CIC"; feels pre-revenue MVP.[2]
- **WEIGHTED TOTAL**: (7*0.35 + 5*0.35 + 7*0.1 + 8*0.1 + 6*0.1) = **6.25/10**

## 3. RED FLAGS
- **Buzzwords without substance**: "Agile Analytics at Scale," "Immutable Trust," "ZK proofs," "blast radius containment," "4-level maturity model"—flashed without explaining *how* (e.g., ZK for what exactly? Solana anchoring demoed?). "Agentic Trust Framework" positioned as unique, but CSA published specs; "first working" claim smells unverified hype.[1]
- **Claims that can't be independently verified**: "100% crisis recall (F1:0.97, n=312)," "96% consent precision," "12 microservices/15k LoC/459 tests"—links provided (API/GitHub), but no third-party audit, user testimonials, or revenue proof. "Review times cut from weeks to ms" anecdotal, no before/after data. Dropped original "100% critical failures blocked" wisely, but revision piles on unproven ATF completeness.[2]
- **Confusing terminology or acronyms**: ATF, DID, Ed25519, ONNX, BfArM unexplained for non-experts; "Ralph Wiggum" (original) is cartoon nonsense—dismissal bait. Assumes judge knows CSA/EU AI Act minutiae.
- **Narrative inconsistencies**: Original: Generic "enterprise Agile Analytics," vague persistence engine. Revised: Pivots hard to "Europe's first ATF," GDPR-heavy, adds maturity model—feels like post-submission scramble, eroding trust (why revise "Why Applying" so drastically?).
- **Video script issues**: Rushed pacing (8 segments in 180s = ~22s each, no breathing room); feature-dump flow (dashboard → benchmarks → audits → framework → etc.) lacks transitions. Emotional void—starts alarmist ("EU AI Act!"), ends salesy CTA without proof of traction. Non-technical judge lost by Segment 3 (F1 scores, ONNX).[1]

These scream "solo dev hype machine" to a judge—we've rejected dozens for less verifiable swagger.

## 4. TOP 3 IMPROVEMENTS
1. **Add hard traction metrics to "Why Applying"**: Replace vague "demoed at CIC/HelloBetter feedback" with specifics. *Rewrite*: "Live-governing 50+ agents for 2 Berlin healthtech pilots (HelloBetter alpha, 3 weeks, 99.8% uptime, 40% faster compliance workflows per user logs). Public dashboard: [link to anonymized metrics]. Targeting €50k ARR by Q3 via BfArM integrations."
2. **Simplify & define acronyms, cut buzz**: In "Why Applying" and video, explain top terms once. *Rewrite opening*: "Mission Control is a live dashboard enforcing EU AI Act + GDPR (8 articles) for AI agents in high-risk apps like mental health chatbots. No acronyms—think runtime firewall (ConvoGuard: blocks violations in 8ms) + crypto-proof audits (Ed25519 signatures on Solana blockchain)."
3. **Prove benchmarks with gold-standard dataset**: Link a downloadable eval dataset/script matching claims. *Add to Validation text*: "Reproduce benchmarks: curl /api/gdpr/benchmarks + gold dataset (312 crises/847 consents) at github.com/yogami/gdpr-evals. Third-party verified by [CIC judge name] on [date]."

## 5. VIDEO SCRIPT VERDICT
- **Is the 8-segment narrative arc clear to a NON-TECHNICAL judge?** No—overloaded with tech jargon (ONNX, F1, Ed25519, BfArM) after Segment 2; busy judges zone out by Segment 5.
- **Does the video tell a story or just list features?** Lists features (dashboard → compliance → benchmarks → etc.) with weak arc: Problem tease → tech stack parade → CTA. No hero's journey (e.g., "We faced X failure, built Y, saved Z").
- **What is the emotional arc? Is there one?** Flatline: Starts urgent (AI Act fear), peaks at tech flex (Segment 5-7), crashes to brag (LoC count). No inspiration/relief—feels like infomercial, not innovator pitch.
- **Specific line-by-line feedback**:
  | Segment | Feedback |
  |---------|----------|
  | 1 | Strong hook—keep, but add "Enterprises risk €20M fines without it" for stakes.[1] |
  | 2 | Good evolution story; define "fleet compliance matrix" visually (show screenshot). |
  | 3 | Killer metrics, but "F1:0.97" alienates—say "catches 100% of crises, 96% of consents accurately." Cut "ONNX" or explain "local AI chip." |
  | 4 | Niche (BfArM=German med reg); move later or generalize "regulatory XML exports." |
  | 5 | Pivot feels abrupt—transition: "GDPR is table stakes; we went further..." Drop "five trust elements" list. |
  | 6 | "TrustScore" cool, but vague—show live example: "Agent X: 92/100 from 50 audits." |
  | 7 | Maturity model neat, but "41 adversarial vectors" = nerd bait; say "tests 41 rogue attacks automatically." |
  | 8 | Weak close—swap LoC/tests for impact: "Governing 50 agents live. Join Europe's AI governance leader." Add call-to-action screen. |

════════════════════════════════════════════════════════════════════════════════
