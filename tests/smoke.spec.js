// @ts-check
const { test, expect } = require('@playwright/test');

test('smoke test', async ({ page }) => {
    // 1. Go to the page
    // We'll rely on the web server started by Playwright or GitHub Actions
    await page.goto('/');

    // 2. Check title
    await expect(page).toHaveTitle(/Rubik's Cube 3D/);

    // 3. Check for no console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 4. Check if canvas exists and is visible
    const canvas = page.locator('#canvas-container canvas');
    await expect(canvas).toBeVisible();

    // 5. Basic interaction check (buttons exist)
    await expect(page.locator('#btn-scramble')).toBeVisible();
    await expect(page.locator('#btn-reset')).toBeVisible();

    // Ensure no errors were logged during load
    expect(consoleErrors).toEqual([]);
});
