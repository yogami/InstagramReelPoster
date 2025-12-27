import path from 'path';

test.describe('Demo Website - Image Upload', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the local demo site
        const filePath = `file://${path.resolve(__dirname, '../../../ReelBerlin-Demo/index.html')}`;
        await page.goto(filePath);
        // Wait for the form to be visible
        await page.waitForSelector('#reelForm');
    });

    test('should show the dashed upload zone and allow file selection', async ({ page }) => {
        // 1. Verify the main drop zone is visible
        const dropZone = page.locator('#dropZone');
        await expect(dropZone).toBeVisible();

        // 2. Verify the dashed border style
        const borderStyle = await dropZone.evaluate((el) => window.getComputedStyle(el).borderStyle);
        expect(borderStyle).toBe('dashed');

        // 3. Verify the text in the upload zone
        const dropText = dropZone.locator('.drop-text');
        await expect(dropText).toHaveText(/Klicken oder Ziehen/);

        // 4. Verify the logo drop zone is visible
        const logoDropZone = page.locator('#logoDropZone');
        await expect(logoDropZone).toBeVisible();
    });

    test('should show previews when images are uploaded', async ({ page }) => {
        const fileInput = page.locator('#fileInput');

        await fileInput.setInputFiles({
            name: 'test-image.png',
            mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
        });

        const previewItem = page.locator('.preview-item');
        await expect(previewItem).toBeVisible();

        const removeBtn = previewItem.locator('.preview-remove');
        await expect(removeBtn).toBeVisible();

        await removeBtn.click();
        await expect(previewItem).not.toBeAttached();
    });

    test('should submit the form with media and logo payload', async ({ page }) => {
        await page.fill('#websiteUrl', 'https://example.com');
        await page.check('#consent');

        // Upload a logo
        const logoInput = page.locator('#logoInput');
        await logoInput.setInputFiles({
            name: 'test-logo.png',
            mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
        });

        // Upload an image
        const fileInput = page.locator('#fileInput');
        await fileInput.setInputFiles({
            name: 'test-submit.png',
            mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
        });

        // Intercept the API call
        await page.route('**/api/website', async (route) => {
            const request = route.request();
            const postData = JSON.parse(request.postData() || '{}');

            // Verify media and logo are present in payload
            expect(postData.media).toBeDefined();
            expect(postData.media.length).toBe(1);
            expect(postData.logoUrl).toBeDefined();
            expect(postData.logoUrl).toContain('data:image/png;base64');
            expect(postData.logoPosition).toBe('end'); // Default

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ jobId: 'test-job-id', status: 'created' })
            });
        });

        await page.click('.submit-btn');
        await expect(page.locator('#result')).toBeVisible();
    });
});
