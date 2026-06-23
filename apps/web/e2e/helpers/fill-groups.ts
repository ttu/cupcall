import type { Page } from '@playwright/test';

/**
 * Fills every group-stage score cell on the currently-visible Groups tab.
 * Sets each match to 1–0 (home win). Waits for all saves to complete before returning.
 */
export async function fillAllGroups(page: Page): Promise<void> {
  const scoreCells = page.locator('[data-testid^="score-"]');
  const count = await scoreCells.count();

  for (let i = 0; i < count; i++) {
    const cell = scoreCells.nth(i);
    const homeInput = cell.locator('[aria-label="Home goals"]');
    // Skip cells that are locked (disabled) — those are auto-filled from actual results
    if (await homeInput.isDisabled()) continue;
    await homeInput.fill('1');
    await cell.locator('[aria-label="Away goals"]').fill('0');
    // Tab blurs the away input → handleBlur reads both refs → saveGroupScore fires
    await cell.locator('[aria-label="Away goals"]').press('Tab');
  }

  // Wait for all in-flight saveGroupScore server actions to complete
  await page.waitForLoadState('networkidle');
}
