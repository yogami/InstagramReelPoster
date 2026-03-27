
const { chromium } = require('playwright');
const path = require('path');

async function record() {
    console.log('Starting recording script...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
            dir: './tmp/recordings',
            size: { width: 1280, height: 720 }
        }
    });

    const page = await context.newPage();

    try {
        console.log('Navigating to login...');
        await page.goto('https://agent-suite-website-production-68b1.up.railway.app/login');
        await page.fill('[data-testid="email"]', 'demo@agentops-suite.com');
        await page.fill('[data-testid="password"]', 'AgentOps2026!');
        await page.click('[data-testid="login-button"]');

        await page.waitForURL('**/manager');
        console.log('Logged in. Waiting for dashboard...');
        await page.waitForTimeout(3000);

        // Show Kanban
        console.log('Showing Kanban...');
        await page.mouse.move(600, 400);
        await page.waitForTimeout(2000);

        // Show Inbox
        console.log('Switching to Inbox...');
        await page.click('[data-testid="view-inbox"]');
        await page.waitForTimeout(3000);

        // Scroll
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(2000);

        // Show New Agent Modal
        console.log('Showing Modal...');
        await page.click('[data-testid="new-agent-button"]');
        await page.waitForTimeout(2000);
        await page.click('button:has-text("Cancel")');

        console.log('Finishing recording...');
        const videoPath = await page.video().path();
        console.log(`Video saved to: ${videoPath}`);

        await context.close();
        await browser.close();

        // Move to a permanent location
        const fs = require('fs');
        const finalPath = path.join(process.cwd(), 'tmp/agent_manager_demo.webm');
        if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');
        fs.renameSync(videoPath, finalPath);
        console.log(`FINAL_VIDEO_PATH=${finalPath}`);

    } catch (error) {
        console.error('Recording failed:', error);
        await context.close();
        await browser.close();
        process.exit(1);
    }
}

record();
