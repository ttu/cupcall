import { test, expect } from '@playwright/test';
import { fillAllGroups } from './helpers/fill-groups';
import { fillAllBracketPicks } from './helpers/fill-bracket';
import { fillAllSpecials } from './helpers/fill-specials';

test('guest can log in, create a pool, fill all predictions, and reopen them', async ({ page }) => {
  // ── 1. Sign in as guest ────────────────────────────────────────────────────
  await page.goto('/');
  await page.getByLabel('Your name').fill('E2E Tester');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForURL('**/pools');

  // ── 2. Create a pool ───────────────────────────────────────────────────────
  await page.getByLabel('Pool name').fill('WC26 Test Pool');
  await page.getByRole('button', { name: 'Create' }).click();
  // CreatePoolForm calls router.push('/pools/<id>') on success
  await page.waitForURL(/\/pools\/[^/]+$/);

  // ── 3. Open predictions ────────────────────────────────────────────────────
  await page.getByTestId('pool-predict-link').click();
  await page.waitForURL('**/predict');

  // ── 4. Fill group stage scores ─────────────────────────────────────────────
  // Default tab is "Group Stage"; all group [aria-label="Score"] cells are visible
  await fillAllGroups(page);

  // ── 5. Fill bracket picks ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Bracket' }).click();
  await fillAllBracketPicks(page);

  // ── 6. Fill special bets ───────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Special Bets' }).click();
  await fillAllSpecials(page);

  // ── 7. Verify 100% completion ──────────────────────────────────────────────
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

  // ── 8. Navigate away and back — predictions must persist ───────────────────
  const predictUrl = page.url();
  await page.goto('/pools');
  await page.goto(predictUrl);

  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});
