import { test, expect } from '@playwright/test';

test('/demo redirects to the completed stage checkpoint with no auth required', async ({
  page,
}) => {
  await page.goto('/demo');

  await expect(page).toHaveURL(/\/view\/demo-completed$/);
  await expect(page.locator('[data-testid="demo-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-banner-link-groups"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-banner-link-knockout"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-banner-link-completed"]')).toBeVisible();
});

for (const { token, activeKey, inactiveKeys } of [
  { token: 'demo-groups', activeKey: 'groups', inactiveKeys: ['knockout', 'completed'] },
  { token: 'demo-knockout', activeKey: 'knockout', inactiveKeys: ['groups', 'completed'] },
  { token: 'demo-completed', activeKey: 'completed', inactiveKeys: ['groups', 'knockout'] },
]) {
  test(`${token} checkpoint renders a read-only leaderboard with no edit controls`, async ({
    page,
  }) => {
    await page.goto(`/view/${token}`);
    await expect(page).toHaveURL(new RegExp(`/view/${token}$`));

    const rows = page.locator('[data-testid^="leaderboard-row-"], [data-testid^="podium-entry-"]');
    await expect(rows.first()).toBeVisible();

    // Owner-only / member-only controls must never render on the public view route.
    await expect(page.locator('[data-testid="leave-pool-btn"]')).toHaveCount(0);
  });

  test(`${token}: demo banner highlights the current stage and links to the other two`, async ({
    page,
  }) => {
    await page.goto(`/view/${token}`);

    await expect(page.locator('[data-testid="demo-banner"]')).toBeVisible();

    // Active stage link is bold.
    await expect(page.locator(`[data-testid="demo-banner-link-${activeKey}"]`)).toHaveClass(
      /font-bold/,
    );

    // Inactive links are not bold.
    for (const key of inactiveKeys) {
      await expect(page.locator(`[data-testid="demo-banner-link-${key}"]`)).not.toHaveClass(
        /font-bold/,
      );
    }
  });
}
