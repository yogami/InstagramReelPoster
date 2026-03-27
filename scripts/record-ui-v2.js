
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function record() {
    console.log('Starting V2 recording script (Meticulous UI Walkthrough)...');
    const browser = await chromium.launch({ headless: true });
    // Use a mobile-ish aspect ratio or portrait? No, reel is 9:16.
    // But the desktop UI is wide. I should record in a window that fits the content but maybe scale it or crop it.
    // Let's stick to 1080x1920 (9:16) viewport to ensure it looks native on a Reel.
    // The Manager UI is responsive so it should stack nicely.
    const context = await browser.newContext({
        viewport: { width: 1080, height: 1920 },
        deviceScaleFactor: 2, // High DPI
        recordVideo: {
            dir: './tmp/recordings_v2',
            size: { width: 1080, height: 1920 }
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

        // 1. Overview of Dashboard (Kanban)
        console.log('1. Showing Kanban Overview...');
        // Slowly scroll down to show cards
        await page.mouse.move(540, 500); // Center
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(2000);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(2000);

        // 2. Highlight Trust Score (Hover over a badge)
        console.log('2. Highlighting Trust Score...');
        // Find a trust badge. 
        // We know the cards have `[title="Trust: 95%"]` or similar.
        // Let's look for text "% trust".
        const trustBadge = page.locator('text=% trust').first();
        if (await trustBadge.isVisible()) {
            await trustBadge.hover();
            // Wiggle mouse to draw attention
            const box = await trustBadge.boundingBox();
            if (box) {
                await page.mouse.move(box.x + 10, box.y + 10);
                await page.waitForTimeout(500);
                await page.mouse.move(box.x + 30, box.y + 10);
                await page.waitForTimeout(500);
            }
        }
        await page.waitForTimeout(2000);

        // 3. Highlight Deadline (Hover over timer)
        console.log('3. Highlighting Deadline...');
        const timerBadge = page.locator('text=left').first(); // "2d left", "50m left"
        if (await timerBadge.isVisible()) {
            await timerBadge.hover();
            await page.waitForTimeout(1500);
        }
        await page.waitForTimeout(1000);

        // 4. Switch to Inbox View (Compliance/Audit focus)
        console.log('4. Switching to Inbox View...');
        await page.click('[data-testid="view-inbox"]');
        await page.waitForTimeout(2000);

        // 5. Highlight "Needs Review" or "Approve/Reject" buttons
        console.log('5. Highlighting Actions...');
        const approveBtn = page.locator('button:has-text("Approve")').first();
        if (await approveBtn.isVisible()) {
            await approveBtn.hover();
            await page.waitForTimeout(1000);
        }

        // 6. Scroll Inbox
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(2000);

        console.log('Finishing recording...');
        const videoPath = await page.video().path();

        await context.close();
        await browser.close();

        const finalPath = path.join(process.cwd(), 'tmp/agent_manager_demo_v2.webm');
        if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');
        fs.renameSync(videoPath, finalPath);
        console.log(`FINAL_VIDEO_PATH=${finalPath}`);

    } catch (error) {
        console.error('Recording failed:', error);
        await context.close().catch(() => { });
        await browser.close().catch(() => { });
        process.exit(1);
    }
}

record();
