import type { Page } from '@playwright/test';

/**
 * Picks the home (left) team for every tie in R32 → R16 → QF → SF, then fills
 * Final (2–1) and 3rd Place (1–0) score cells.
 * Must be called while the Bracket tab is active.
 */
export async function fillAllBracketPicks(page: Page): Promise<void> {
  const bracketSection = page.locator('[aria-label="Knockout bracket predictions"]');
  const roundLabels = ['R32', 'R16', 'QF', 'SF'];

  for (const label of roundLabels) {
    // :scope > div limits to direct children, avoiding false matches on ancestor divs
    const roundCard = bracketSection.locator(':scope > div').filter({ hasText: label }).first();

    // Wait until at least one button in this round is enabled (teams populated from prior round)
    await roundCard.locator('button:not([disabled])').first().waitFor({ timeout: 15_000 });

    // Each tie row contains a <span> with text "vs" between the two team buttons
    const tieRows = roundCard.locator('div:has(span:text("vs"))');
    const tieCount = await tieRows.count();

    for (let i = 0; i < tieCount; i++) {
      // Click the home (first) team button in each tie row
      await tieRows.nth(i).locator('button').first().click();
    }

    // Wait for saveKnockoutPick server actions to complete so the next round's teams are derived
    await page.waitForLoadState('networkidle');
  }

  // Fill Final score — only two [aria-label="Score"] cells exist on the Bracket tab
  const finalCell = page.locator('[aria-label="Score"]').nth(0);
  await finalCell.locator('[aria-label="Home goals"]').fill('2');
  await finalCell.locator('[aria-label="Away goals"]').fill('1');
  await finalCell.locator('[aria-label="Away goals"]').press('Tab');

  // Fill 3rd Place score
  const bronzeCell = page.locator('[aria-label="Score"]').nth(1);
  await bronzeCell.locator('[aria-label="Home goals"]').fill('1');
  await bronzeCell.locator('[aria-label="Away goals"]').fill('0');
  await bronzeCell.locator('[aria-label="Away goals"]').press('Tab');

  await page.waitForLoadState('networkidle');
}
