import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('leaderboard ranks members by total points, descending', async ({ page }) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}`);

  const podiumPoints: number[] = [];
  for (const rank of [1, 2, 3]) {
    const entry = page.locator(`[data-testid="podium-entry-${rank}"]`);
    await expect(entry).toBeVisible();
    const text = await entry.locator('[data-testid="podium-points"]').textContent();
    podiumPoints.push(Number(text));
  }

  const rows = page.locator('[data-testid^="leaderboard-row-"]');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  const rowPoints: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    const text = await rows.nth(i).locator('[data-testid="leaderboard-points"]').textContent();
    rowPoints.push(Number(text));
  }

  const allPoints = [...podiumPoints, ...rowPoints];
  const sorted = [...allPoints].sort((a, b) => b - a);
  expect(allPoints).toEqual(sorted);
});
