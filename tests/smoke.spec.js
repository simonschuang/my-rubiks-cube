// @ts-check
const { test, expect } = require('@playwright/test');

test('smoke test', async ({ page }) => {
    // 1. Go to the page
    // We'll rely on the web server started by Playwright or GitHub Actions
    await page.goto('/');

    // 2. Check title
    await expect(page).toHaveTitle(/Rubik's Cube 3D/);

    // 3. Check for expected elements
    await expect(page.locator('h1')).toHaveText('Rubik\'s 3D');

    // 4. Basic interaction check (buttons exist)
    await expect(page.locator('#btn-scan')).toBeVisible();

    // 5. Check that UI container exists
    await expect(page.locator('#ui-container')).toBeVisible();
    await expect(page.locator('#canvas-container')).toBeVisible();
    
    // 6. Check that modals exist but are hidden
    await expect(page.locator('#scanner-modal')).toHaveClass(/hidden/);
    await expect(page.locator('#correction-modal')).toHaveClass(/hidden/);
    await expect(page.locator('#export-modal')).toHaveClass(/hidden/);
});
