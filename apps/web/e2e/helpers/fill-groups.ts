import { expect, type Page } from '@playwright/test';

/**
 * Fills every group-stage score via the dev "Fill random scores" button.
 *
 * The button calls devFillRandomGroupScores — a server action that bulk-saves
 * all 72 group predictions in one go without any lock checks — and then calls
 * router.refresh() to re-render the page from the database.  This is far more
 * reliable in headless Chromium CI than the per-cell blur approach, which
 * requires React's synthetic onBlur handler to fire for every number input.
 *
 * The button is rendered when isDev=true (process.env.NODE_ENV === 'development'),
 * which is always the case when pnpm e2e starts the server via `pnpm dev`.
 */
export async function fillAllGroups(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fill random scores' }).click();

  // router.refresh() (called by DevControls after the action) re-fetches the RSC
  // tree; networkidle confirms both the server-action POST and the refresh GET are done.
  await page.waitForLoadState('networkidle');

  // Confirm the page re-rendered with all group predictions saved.
  await expect(page.getByText('Needs a score')).toHaveCount(0, { timeout: 20_000 });
}
