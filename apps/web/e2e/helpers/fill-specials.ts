import type { Page } from '@playwright/test';

/**
 * Fills all 11 special bets on the currently-visible Special Bets tab.
 * Selects the first available option for team/player selects, fills sensible
 * values for numbers, and clicks "Yes" for the bool bet.
 */
export async function fillAllSpecials(page: Page): Promise<void> {
  const section = page.locator('[data-testid="specials-section"]');

  // Player selects — selectOption({ index: 1 }) picks the first real option after the placeholder.
  // Skip selects that are locked (disabled) — those have known answers already.
  const playerKeys = ['topScorerPlayer', 'finalDecisiveGoalPlayer', 'firstRedCardPlayer'];
  for (const key of playerKeys) {
    const sel = section.locator(`#special-${key}`);
    if (await sel.isDisabled()) continue;
    await sel.selectOption({ index: 1 });
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
    const sel = section.locator(`#special-${key}`);
    if (await sel.isDisabled()) continue;
    await sel.selectOption({ index: 1 });
    await page.waitForLoadState('networkidle');
  }

  // Number inputs — fill then Tab to trigger blur → save
  const goalsInput = section.locator('#special-highestMatchGoals');
  if (!(await goalsInput.isDisabled())) {
    await goalsInput.fill('5');
    await goalsInput.press('Tab');
    await page.waitForLoadState('networkidle');
  }

  const penaltiesInput = section.locator('#special-penaltyShootoutCount');
  if (!(await penaltiesInput.isDisabled())) {
    await penaltiesInput.fill('2');
    await penaltiesInput.press('Tab');
    await page.waitForLoadState('networkidle');
  }

  // Bool bet — click "Yes" in the finalDecidedByPenalties bet container
  const boolContainer = section.locator('[data-testid="special-bet-finalDecidedByPenalties"]');
  const yesBtn = boolContainer.getByRole('button', { name: 'Yes' });
  if (!(await yesBtn.isDisabled())) {
    await yesBtn.click();
    await page.waitForLoadState('networkidle');
  }
}
