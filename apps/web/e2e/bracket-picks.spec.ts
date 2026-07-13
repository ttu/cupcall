import { test, expect } from '@playwright/test';
import { fillAllGroups } from './helpers/fill-groups';
import { fillAllBracketPicks } from './helpers/fill-bracket';

/**
 * Verifies bracket pick correctness after the group stage is complete:
 * - All R32 slots show real team names (no "?" placeholders)
 * - Both home (left) AND away (right) buttons are pickable
 * - Changing an R32 pick auto-cascades to clear dependent R16+ picks
 * - Final and 3rd-Place show different teams (SF winners vs SF losers)
 */
test('bracket: correct teams, both sides pickable, cascade, final ≠ bronze', async ({ page }) => {
  // ── Sign in and create pool ────────────────────────────────────────────────
  await page.goto('/');
  await page.getByLabel('Your name').fill('BracketTester');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForURL('**/pools');

  await page.getByLabel('Tournament').selectOption('e2e-open');
  await page.getByLabel('Pool name').fill('Bracket Test Pool');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/pools\/[^/]+$/);

  await page.getByTestId('pool-predict-link').click();
  await page.waitForURL('**/predict');

  // ── Fill all group scores so every R32 slot has real teams ────────────────
  await fillAllGroups(page);
  await page.getByRole('button', { name: 'Bracket' }).click();

  const bracketSection = page.locator('[data-testid="bracket-section"]');
  const r32Card = bracketSection.locator('[data-testid="bracket-round-R32"]');
  await r32Card.locator('button:not([disabled])').first().waitFor({ timeout: 15_000 });

  // ── All 16 R32 ties show real team names — no "?" placeholders ────────────
  const r32Ties = r32Card.locator('[data-testid="bracket-tie-row"]');
  expect(await r32Ties.count()).toBe(16);

  for (let i = 0; i < 16; i++) {
    const homeText =
      (await r32Ties.nth(i).locator('[data-testid="pick-home"]').textContent()) ?? '';
    const awayText =
      (await r32Ties.nth(i).locator('[data-testid="pick-away"]').textContent()) ?? '';
    expect(homeText.trim()).not.toBe('?');
    expect(awayText.trim()).not.toBe('?');
  }

  // ── Away (right-side) buttons are clickable ───────────────────────────────
  // Pick the away team for the first R32 tie and verify it turns green.
  const firstR32Away = r32Ties.first().locator('[data-testid="pick-away"]');
  await firstR32Away.click();
  await page.waitForLoadState('networkidle');
  await expect(firstR32Away).toHaveAttribute('aria-pressed', 'true');

  // Pick the away team for the second tie as well.
  const secondR32Away = r32Ties.nth(1).locator('[data-testid="pick-away"]');
  await secondR32Away.click();
  await page.waitForLoadState('networkidle');
  await expect(secondR32Away).toHaveAttribute('aria-pressed', 'true');

  // ── Fill full bracket (home-first strategy) so R16+ picks exist ───────────
  await fillAllBracketPicks(page);

  // ── Cascade: switching an R32 pick clears the dependent R16 pick ──────────
  // r32m73 is at slot index 2 in the R32 list; it feeds r16m90 (index 1 in R16) as home.
  // After fillAllBracketPicks the home team was picked, so r16m90 home is green.
  const r16Card = bracketSection.locator('[data-testid="bracket-round-R16"]');
  const r16Ties = r16Card.locator('[data-testid="bracket-tie-row"]');
  // r16m90 = index 1 in the R16 list (r16m89 is index 0)
  const r16m90HomeBtn = r16Ties.nth(1).locator('[data-testid="pick-home"]');
  await expect(r16m90HomeBtn).toHaveAttribute('aria-pressed', 'true');

  // Now switch r32m73 (index 2) to the away team — this changes who advances to R16m90
  const r32m73Home = r32Ties.nth(2).locator('[data-testid="pick-home"]');
  const r32m73Away = r32Ties.nth(2).locator('[data-testid="pick-away"]');
  // Capture team names to confirm they differ (away ≠ home)
  const awayTeamName = (await r32m73Away.textContent()) ?? '';
  const homeTeamName = (await r32m73Home.textContent()) ?? '';
  expect(awayTeamName.trim()).not.toBe(homeTeamName.trim());

  await r32m73Away.click();
  await page.waitForLoadState('networkidle');

  // The R16m90 pick was for the OLD r32m73 winner (home team). Now that r32m73
  // advances the away team instead, the R16m90 pick is invalid and must be cleared.
  await expect(r16m90HomeBtn).not.toHaveAttribute('aria-pressed', 'true');

  // ── Refill bracket for Final/Bronze check ─────────────────────────────────
  await fillAllBracketPicks(page);

  // ── Final and 3rd-Place show DIFFERENT teams ──────────────────────────────
  const finalSection = bracketSection.locator('[data-testid="final-section"]');
  const bronzeSection = bracketSection.locator('[data-testid="bronze-section"]');

  const finalHome = await finalSection.locator('[data-testid="home-team-name"]').textContent();
  const bronzeHome = await bronzeSection.locator('[data-testid="home-team-name"]').textContent();

  // The teams in the Final cannot be the same as the teams in the 3rd-Place match
  expect(finalHome?.trim()).toBeTruthy();
  expect(bronzeHome?.trim()).toBeTruthy();
  expect(finalHome?.trim()).not.toBe(bronzeHome?.trim());
});
