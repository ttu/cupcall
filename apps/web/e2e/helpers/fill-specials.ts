import type { Page } from '@playwright/test';

/**
 * Fills all 11 special bets on the currently-visible Special Bets tab.
 * Selects the first available option for team/player selects, fills sensible
 * values for numbers, and clicks "Yes" for the bool bet.
 */
export async function fillAllSpecials(page: Page): Promise<void> {
  const section = page.locator('[aria-label="Special bets"]');

  // Player selects — selectOption({ index: 1 }) picks the first real option after the placeholder
  const playerKeys = ['topScorerPlayer', 'finalDecisiveGoalPlayer', 'firstRedCardPlayer'];
  for (const key of playerKeys) {
    await section.locator(`#special-${key}`).selectOption({ index: 1 });
    await page.waitForLoadState('networkidle');
  }

  // Team selects
  const teamKeys = [
    'mostYellowCardsTeam',
    'groupTopScoringTeam',
    'groupTopConcedingTeam',
    'tournamentTopScoringTeam',
    'tournamentTopConcedingTeam',
  ];
  for (const key of teamKeys) {
    await section.locator(`#special-${key}`).selectOption({ index: 1 });
    await page.waitForLoadState('networkidle');
  }

  // Number inputs — fill then Tab to trigger blur → save
  await section.locator('#special-highestMatchGoals').fill('5');
  await section.locator('#special-highestMatchGoals').press('Tab');
  await page.waitForLoadState('networkidle');

  await section.locator('#special-penaltyShootoutCount').fill('2');
  await section.locator('#special-penaltyShootoutCount').press('Tab');
  await page.waitForLoadState('networkidle');

  // Bool bet — Yes/No buttons have no id; find their container via the associated label
  const boolContainer = section.locator('div:has(label[for="special-finalDecidedByPenalties"])');
  await boolContainer.getByRole('button', { name: 'Yes' }).click();
  await page.waitForLoadState('networkidle');
}
