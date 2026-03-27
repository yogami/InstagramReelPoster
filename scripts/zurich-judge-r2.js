/**
 * Judge Panel Round 2 — Re-evaluate the hardened v11 submission + video script
 */
const path = require('path');
const fs = require('fs');
const OUTPUT_DIR = path.resolve(__dirname, '../judge_panel_results');
const OR_KEY = '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';
const PPLX_KEY = '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';

const PROMPT = `You are an independent adjudicator for the GenAI Zürich Award 2026, "Rising Innovators" track. You are evaluating a REVISED submission from Berlin AI Labs for "Agent Ops Mission Control."

This is the SECOND review. The applicant incorporated feedback from a first round of judging and made significant changes. Evaluate the improvements.

AWARD CRITERIA: Innovation (35%), Impact (35%), Scalability (10%), Ethics (10%), Production Readiness (10%). Each scored 1-10.

REVISED SUBMISSION TEXT:

"The EU AI Act takes effect August 2026. AI systems in healthcare, finance, and insurance are classified as high-risk — facing fines up to €35 million for non-compliance. Enterprises deploying autonomous AI agents need runtime governance: not monitoring dashboards, not post-hoc logs, but real-time enforcement that prevents violations before they happen.

Agent Ops Mission Control is a compliance firewall for AI agent fleets. It enforces 8 GDPR articles with working code — consent detection, crisis intervention, data residency, automated decision transparency — checking every AI conversation in 8 milliseconds using a local AI firewall. No data leaves the device.

Beyond GDPR, Mission Control provides a full governance stack for autonomous agents: verified identity with cryptographic compliance profiles, behavioral audits with 41 adversarial attack vectors (open-source CLI on npm), compliance scoring via a reputation registry, containment via circuit breakers and kill switches, and a 4-level maturity model with automated promotion gates.

This is production infrastructure: 12 deployed microservices live on Railway, benchmarks publicly verifiable at /api/gdpr/benchmarks, 97% crisis detection accuracy (F1: 0.97, n=312), 96% consent precision (F1: 0.94, n=847), a transparency page disclosing every known limitation, and integration exports for REST/Webhooks/BfArM XML/SIEM/PDF.

Validation: Demoed at CIC Berlin innovation hub, feedback from HelloBetter founder (digital therapeutics), open-source on GitHub, agent-pentest CLI published on npm.

Rising Innovators is the right track because every enterprise deploying AI agents in Europe will need runtime governance by August 2026. The market has published specifications — I have shipped production code. Zürich recognition connects this infrastructure to the enterprises and partners who need it most."

REVISED VIDEO SCRIPT (7 segments, 165s / 2.8 min):

Segment 1 (20s): "The EU AI Act takes effect August 2026. AI systems in mental health are classified high-risk. Enterprises deploying autonomous agents in Europe face up to 35 million euros in fines for non-compliance. Most of them have no runtime governance at all."

Segment 2 (25s): "We built Mission Control — a compliance firewall for AI agent fleets. It enforces 8 GDPR articles in real time: consent detection, crisis intervention, data residency, transparency. Every agent in the fleet is monitored, scored, and held accountable."

Segment 3 (27s): "Under the hood is a local AI firewall that checks every conversation in 8 milliseconds — without sending any data to the cloud. It catches crisis signals with 97% accuracy and consent violations with 96% precision. And we publish every benchmark and every known limitation on a public transparency page."

Segment 4 (20s): "For regulated industries like digital health, our audit tool validates any AI conversation against European standards. Paste a transcript, get a compliance report, and download regulator-ready documentation — in seconds, not weeks."

Segment 5 (24s): "But compliance alone isn't enough. We built a trust layer for autonomous agents — verified identity, behavioral audits, compliance scoring, and a reputation registry. Organizations can discover, verify, and govern their entire AI workforce from one place."

Segment 6 (24s): "When agents fail, we contain the damage. Circuit breakers halt rogue behavior instantly. Kill switches enforce human override. And our open-source security testing tool runs 41 adversarial attacks against any AI endpoint — finding vulnerabilities before they reach production."

Segment 7 (22s): "Everything is live, open source, and deployed. We demoed at CIC Berlin and are seeking our first enterprise pilots. This is not a research paper. This is production infrastructure for governing AI agents in Europe. We are Berlin AI Labs."

EVALUATE:
1. COMPREHENSION: Is the problem and solution now crystal clear? Any remaining confusion?
2. SCORECARD: Score each criterion 1-10 + weighted total
3. IMPROVEMENTS vs ROUND 1: What got better? What still needs work?
4. FINAL VERDICT: Would you advance this to the semi-finals?`;

const JUDGES = [
    { name: 'Gemini 3 Flash R2', model: 'google/gemini-3-flash-preview', api: 'or' },
    { name: 'Perplexity Sonar Pro R2', model: 'sonar-pro', api: 'pplx' }
];

async function query(judge) {
    console.log(`🎓 ${judge.name}...`);
    const start = Date.now();
    try {
        const apiUrl = judge.api === 'pplx' ? 'https://api.perplexity.ai/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        const key = judge.api === 'pplx' ? PPLX_KEY : OR_KEY;
        const headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
        if (judge.api === 'or') { headers['HTTP-Referer'] = 'https://berlin-ai-labs.de'; headers['X-Title'] = 'Judge R2'; }

        const res = await fetch(apiUrl, {
            method: 'POST', headers, body: JSON.stringify({
                model: judge.model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 4000, temperature: 0.7
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).substring(0, 200)}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || 'No response';
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✅ ${elapsed}s (${content.length} chars)`);
        const safeName = judge.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        fs.writeFileSync(path.join(OUTPUT_DIR, `r2_${safeName}.md`), `# ${judge.name}\n\n---\n\n${content}`);
        return { name: judge.name, content, elapsed };
    } catch (err) {
        console.error(`  ❌ ${err.message.substring(0, 150)}`);
        return { name: judge.name, content: `ERROR: ${err.message}`, elapsed: 0 };
    }
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('🏛️  JUDGE PANEL ROUND 2 — HARDENED SUBMISSION\n');
    const results = [];
    for (const j of JUDGES) results.push(await query(j));
    const out = results.map(r => `# 🎓 ${r.name}\n\n${r.content}\n\n${'═'.repeat(80)}\n`).join('\n');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'ROUND2_PANEL.md'), `# Round 2 Judge Panel — ${new Date().toISOString()}\n\n${out}`);
    console.log('\n✅ ROUND2_PANEL.md written');
}
main().catch(console.error);
