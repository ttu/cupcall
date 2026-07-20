// apps/web/e2e/admin-raw-view.spec.ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('pool owner can view raw CardView/ResultsView JSON and switch members', async ({ page }) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}`);

  await page.locator('[data-testid="pool-raw-data-link"]').click();
  await page.waitForURL(`**/pools/${fixtureIds.seededPoolId}/raw`);

  await expect(page.locator('[data-testid="raw-card-json"]')).toContainText('predictionId');
  await expect(page.locator('[data-testid="raw-results-json"]')).toContainText('poolName');
  await expect(page.locator('[data-testid="raw-card-json-copy-button"]')).toBeVisible();

  // Switch to a different member and confirm the picker actually moved to that member,
  // not just that navigation happened.
  const memberLinks = page.locator('[data-testid="raw-member-picker"] a');
  const otherHref = await memberLinks.nth(1).getAttribute('href');
  await memberLinks.nth(1).click();
  await page.waitForURL(`**${otherHref}`);
  await expect(memberLinks.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(memberLinks.first()).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-testid="raw-results-json"]')).toContainText('poolName');
});

test('non-owner member gets 404 on the raw data page', async ({ page }) => {
  await page.goto('/login/e2e-seeded-late-joiner');
  await page.waitForURL('**/pools');

  await page.goto(`/pools/${fixtureIds.seededPoolId}/raw`);
  // Asserts on the rendered not-found page content, not response.status(): this app's
  // /pools/[id]/* routes stream under ancestor loading.tsx boundaries, and Next.js currently
  // locks the HTTP status at 200 once streaming starts even when notFound() fires correctly
  // (open Next.js App Router issue, not an app bug — see docs/PROGRESS.md "Admin raw data view").
  await expect(page.locator('[data-testid="not-found-page"]')).toBeVisible();
});
