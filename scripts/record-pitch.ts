
import { chromium } from '@playwright/test';

/**
 * AGENTOPS MISSION CONTROL - V3 PRECISE RECORDING
 * Timings matched to precise_pitch_v2.mp3
 */
async function recordPrecisePitch() {
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

    console.log('--- STARTING FRAME-ACCURATE RECORDING ---');

    // 0.00s - 13.54s: intro_problem (Start on Home Page)
    await page.goto(APP_URL);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(7000);
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
    await page.waitForTimeout(6540); // Total 13.54s

    // 13.54s - 22.22s: solution_intro (Dashboard Overview)
    await page.goto(`${APP_URL}/manage`);
    await page.waitForSelector('[data-testid="active-count"]');
    await page.waitForTimeout(8680); // Duration 8.68s

    // 22.22s - 30.90s: discovery_search (Search for HR Screener)
    await page.goto(`${APP_URL}/discover`);
    await page.fill('input[placeholder*="Search"]', 'GDPR HR screener');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8680); // Duration 8.68s

    // 30.90s - 44.79s: zk_scorecard (ZK Simulation)
    await page.goto(`${APP_URL}/demo/zk-sla`);
    await page.waitForTimeout(2000); // Intro to page
    await page.click('text=Initialize ZK Simulation');
    await page.waitForTimeout(11890); // Total 13.89s

    // 44.79s - 61.11s: orchestration_kanban (Kanban UI)
    await page.goto(`${APP_URL}/manage`);
    await page.waitForSelector('[data-testid="kanban-board"]');
    await page.waitForTimeout(16320); // Duration 16.32s

    // 61.11s - 66.32s: governance_alerts (Alerts Panel)
    await page.click('[data-testid="alert-panel-trigger"]');
    await page.waitForTimeout(5210); // Duration 5.21s

    // 66.32s - 75.69s: kill_switch (Global Kill Switch)
    // Clear panel first
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('✕') || b.textContent?.includes('Close'));
        if (btn) btn.click();
    });
    await page.click('[data-testid="global-kill-switch"]');
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Confirm Emergency Stop'));
        if (btn) btn.click();
    });
    await page.waitForTimeout(6380); // Total 9.38s

    // 75.69s+: closing_cta (Final Scroll & Info)
    await page.goto(APP_URL);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(17360); // Duration 17.36s

    await browser.close();
    console.log('--- RECORDING COMPLETED ---');
}

recordPrecisePitch().catch(console.error);
