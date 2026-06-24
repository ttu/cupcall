import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Picks the home (left) team for every tie in R32 → R16 → QF → SF, then fills
 * Final (2–1) and 3rd Place (1–0) score cells.
 * Must be called while the Bracket tab is active.
 */
export async function fillAllBracketPicks(page: Page): Promise<void> {
  const bracketSection = page.locator('[data-testid="bracket-section"]');
  const roundLabels = ['R32', 'R16', 'QF', 'SF'];

  for (const label of roundLabels) {
    const roundCard = bracketSection.locator(`[data-testid="bracket-round-${label}"]`);
    const tieRows = roundCard.locator('[data-testid="bracket-tie-row"]');
    const tieCount = await tieRows.count();

    for (let i = 0; i < tieCount; i++) {
      const homeBtn = tieRows.nth(i).locator('[data-testid="pick-home"]');
      // Wait for this specific button to be enabled (home team resolved from prior round)
      await expect(homeBtn).toBeEnabled({ timeout: 15_000 });
      await homeBtn.click();
      // Wait for the pick to be confirmed before clicking the next tie, to avoid
      // concurrent server-action races that leave later rounds with missing teams.
      await expect(homeBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    }

    // Wait for RSC revalidation so the next round's teams are derived from fresh DB state
    await page.waitForLoadState('networkidle');
  }

  // Fill Final score
  const finalCell = page.locator('[data-testid="score-final"]');
  await finalCell.locator('[aria-label="Home goals"]').fill('2');
  await finalCell.locator('[aria-label="Away goals"]').fill('1');
  await finalCell.locator('[aria-label="Away goals"]').press('Tab');

  // Fill 3rd Place score
  const bronzeCell = page.locator('[data-testid="score-bronze"]');
  await bronzeCell.locator('[aria-label="Home goals"]').fill('1');
  await bronzeCell.locator('[aria-label="Away goals"]').fill('0');
  await bronzeCell.locator('[aria-label="Away goals"]').press('Tab');

  await page.waitForLoadState('networkidle');
}
