import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('results page shows a fully resolved bracket, specials, and points race', async ({ page }) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}/results`);

  // Knockout tab: Final shows France vs Argentina (Argentina champion).
  // The results page renders both a mobile accordion and a desktop bracket
  // simultaneously (toggled via responsive CSS), so the same testid appears
  // twice in the DOM — scope to the one actually visible at this viewport.
  await page.locator('[data-testid="results-tab-knockout"]').click();
  const finalCard = page.locator('[data-testid="final-result-card"]:visible');
  await expect(finalCard).toBeVisible();
  await expect(finalCard.locator('[data-testid="home-team-name"]')).toHaveText(/France/i);
  await expect(finalCard.locator('[data-testid="away-team-name"]')).toHaveText(/Argentina/i);

  // Specials tab: resolved and unresolved bets both render
  await page.locator('[data-testid="results-tab-specials"]').click();
  await expect(page.locator('[data-testid="special-bet-result-topScorerPlayer"]')).toBeVisible();
  await expect(page.locator('[data-testid="special-bet-result-firstRedCardPlayer"]')).toBeVisible();

  // Points race tab renders a populated summary (the owner's own score breakdown)
  await page.locator('[data-testid="results-tab-race"]').click();
  await page.locator('[data-testid="points-race-subtab-race"]').click();
  await expect(page.locator('[data-testid="score-breakdown-card"]')).toBeVisible();
});
