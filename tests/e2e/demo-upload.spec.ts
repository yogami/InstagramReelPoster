import { test, expect } from '@playwright/test';

test.describe('Demo Website - Image Upload', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the production demo site
        await page.goto('https://reelberlin-demo-production.up.railway.app/');
        // Wait for the form to be visible
        await page.waitForSelector('#reelForm');
    });

    test('should show the dashed upload zone and allow file selection', async ({ page }) => {
        // 1. Verify the drop zone is visible
        const dropZone = page.locator('#dropZone');
        await expect(dropZone).toBeVisible();

        // 2. Verify the dashed border style (using computed style)
        const borderStyle = await dropZone.evaluate((el) => window.getComputedStyle(el).borderStyle);
        expect(borderStyle).toBe('dashed');

        // 3. Verify the text in the upload zone
        const dropText = dropZone.locator('.drop-text');
        await expect(dropText).toHaveText(/Bilder hierher ziehen oder klicken/);

        // 4. Verify the hidden file input exists
        const fileInput = page.locator('#fileInput');
        await expect(fileInput).toBeHidden();

        // 5. Test file selection (simulating user selecting files)
        // We'll use the hidden file input to set the files
        // First, create a dummy image buffer if needed, or point to a local fixture
        // For E2E, we can use a small base64 pixel or a local file if available.
        // Let's assume we can trigger the file input.

        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            dropZone.click(),
        ]);

        expect(fileChooser).toBeDefined();
    });

    test('should show previews when images are uploaded', async ({ page }) => {
        const fileInput = page.locator('#fileInput');

        // Use a 1x1 transparent PNG data URL if possible, or a local file
        // Playwright's setInputFiles supports paths. Let's create a temporary file or use an existing fixture if any.
        // Actually, we can just point to any image on the system for a local test run.
        // But for portability, let's try to find a fixture.

        // For now, let's just use the setInputFiles method which is the standard way.
        // We will mock the file for the test.
        await fileInput.setInputFiles({
            name: 'test-image.png',
            mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
        });

        // Verify preview container has an item
        const previewItem = page.locator('.preview-item');
        await expect(previewItem).toBeVisible();

        // Verify remove button exists
        const removeBtn = previewItem.locator('.preview-remove');
        await expect(removeBtn).toBeVisible();

        // Click remove and verify it's gone
        await removeBtn.click();
        await expect(previewItem).not.toBeAttached();
    });

    test('should submit the form with media payload', async ({ page }) => {
        // Fill out required fields
        await page.fill('#websiteUrl', 'https://example.com');
        await page.check('#consent');

        // Upload an image
        const fileInput = page.locator('#fileInput');
        await fileInput.setInputFiles({
            name: 'test-submit.png',
            mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
        });

        // Intercept the API call
        await page.route('**/api/reels/website', async (route) => {
            const request = route.request();
            const postData = JSON.parse(request.postData() || '{}');

            // Verify media is present in payload
            expect(postData.media).toBeDefined();
            expect(postData.media.length).toBe(1);
            expect(postData.media[0]).toContain('data:image/png;base64');

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: 'test-job-id', status: 'created' })
            });
        });

        // Submit form
        await page.click('.submit-btn');

        // Verify result section shows up
        await expect(page.locator('#result')).toBeVisible();
    });
});
