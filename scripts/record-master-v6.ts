
import { chromium } from 'playwright';

async function recordMasterV6() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
            dir: './recordings',
            size: { width: 1280, height: 720 }
        }
    });

    const page = await context.newPage();
    const APP_URL = 'http://localhost:3000';

    console.log('--- STARTING SEAMLESS MASTER RECORDING (v6) ---');

    // 0.00s - 32.00s: Intro (Stay on Home Page for image overlays)
    await page.goto(APP_URL);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(32000);

    // 32.00s: "Welcome to AgentOps Mission Control..."
    await page.goto(`${APP_URL}/manage`);
    await page.waitForSelector('[data-testid="active-count"]');
    await page.waitForTimeout(10000);

    // Discovery Demo
    await page.goto(`${APP_URL}/discover`);
    await page.fill('input[placeholder*="Search"]', 'GDPR HR screener');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(15000);

    // ZK-SLA Demo
    await page.goto(`${APP_URL}/demo/zk-sla`);
    await page.waitForTimeout(2000);
    await page.click('text=Initialize ZK Simulation');
    await page.waitForTimeout(41000); // 41s for ZK sequence

    // 100s - 145s: Orchestration (Kanban)
    await page.goto(`${APP_URL}/manage`);
    await page.waitForSelector('[data-testid="kanban-board"]');
    await page.hover('[data-testid="agent-card"]');
    await page.waitForTimeout(43000); // Duration to match "Scaling security requires orchestration..."

    // 145s - 180s: Alerts & Kill Switch
    await page.click('[data-testid="alert-panel-trigger"]');
    await page.waitForTimeout(10000);

    // Clear alerts
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('✕') || b.textContent?.includes('Close'));
        if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-testid="global-kill-switch"]');
    await page.waitForTimeout(5000);
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Confirm Emergency Stop'));
        if (btn) btn.click();
    });
    await page.waitForTimeout(18000);

    // 180s - 209.5s: Final CTA
    await page.goto(APP_URL);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(29500);

    await context.close();
    await browser.close();
    console.log('--- MASTER RECORDING COMPLETED ---');
}

recordMasterV6().catch(console.error);
