import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('late joiner sees the partial banner, locked items, and can fill the one open bet', async ({
  page,
}) => {
  await page.goto('/login/e2e-seeded-late-joiner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}/predict`);

  await expect(page.locator('[data-testid="late-joiner-banner"]')).toBeVisible();

  // Group Stage tab is the default — a score input is locked
  const homeGoalsInput = page.getByLabel('Home goals').first();
  await expect(homeGoalsInput).toBeDisabled();

  // A bracket tie is locked
  await page.getByRole('button', { name: 'Bracket' }).click();
  const firstPickHome = page.locator('[data-testid="pick-home"]').first();
  await expect(firstPickHome).toBeDisabled();

  // The one genuinely open special bet is editable and can be filled
  await page.getByRole('button', { name: 'Special Bets' }).click();
  const section = page.locator('[data-testid="specials-section"]');
  const redCardSelect = section.locator('#special-firstRedCardPlayer');
  await expect(redCardSelect).toBeEnabled();
  await redCardSelect.selectOption({ index: 1 });
  await page.waitForLoadState('networkidle');

  // Persists after reload
  await page.reload();
  await page.getByRole('button', { name: 'Special Bets' }).click();
  await expect(section.locator('#special-firstRedCardPlayer')).not.toHaveValue('');
});
