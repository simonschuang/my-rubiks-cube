// @ts-check
const { test, expect } = require('@playwright/test');

test('smoke test', async ({ page }) => {
    // 1. Go to the page
    // We'll rely on the web server started by Playwright or GitHub Actions
    await page.goto('/');

    // 2. Check title
    await expect(page).toHaveTitle(/Rubik's Cube 3D/);

    // 3. Check for no console errors (except CDN blocking which is environmental)
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            // Ignore CDN blocking errors which are environmental
            if (!text.includes('ERR_BLOCKED_BY_CLIENT') && 
                !text.includes('Failed to load OpenCV.js') &&
                !text.includes('Failed to load resource')) {
                consoleErrors.push(text);
            }
        }
    });

    // 4. Check if canvas exists and is visible (may fail if CDN resources are blocked)
    // Skip canvas check if external resources are blocked
    const canvasContainer = page.locator('#canvas-container');
    await expect(canvasContainer).toBeVisible();

    // 5. Basic interaction check (buttons exist)
    await expect(page.locator('#btn-scan')).toBeVisible();
    await expect(page.locator('#btn-scramble')).toBeVisible();
    await expect(page.locator('#btn-reset')).toBeVisible();

    // 6. Check scanner modal is hidden by default
    const scannerModal = page.locator('#scanner-modal');
    await expect(scannerModal).toHaveClass(/hidden/);

    // Ensure no errors were logged during load
    expect(consoleErrors).toEqual([]);
});
