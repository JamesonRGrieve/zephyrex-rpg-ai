// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The play model end to end against the suite's model stub (docs/DESIGN.md, The play model): a
 * campaign started from a scenario's page, the seat swapped to a party member and to an NPC from
 * outside the party, the session ended into Session 2, and a fork. campaign.live.spec.ts plays
 * the same against real models.
 */
import { expect, type Page, test } from '@playwright/test';
import { MODEL_URL } from '../playwright.config';
import { isHosted, signIn } from './support/people';
// The page's own fetch: on a hosted build the session cookie and CSRF token go with it.
import { post } from './support/seed';

test.beforeEach(async ({ page }, testInfo) => {
  if (isHosted(testInfo)) await signIn(page);
});


async function seat(page: Page, name: string | null): Promise<void> {
  await page.getByRole('button', { name: /^Your seat:/ }).click();
  if (name === null) await page.getByRole('button', { name: 'The GM' }).click();
  else {
    await page.getByLabel('Find a character').fill(name);
    await page
      .getByRole('list', { name: 'Seats' })
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
  }
  await expect(page.getByRole('button', { name: `Your seat: ${name ?? 'the GM'}` })).toBeVisible();
}

test('a campaign: started from its scenario, seats swapped, a session ended, a fork', async ({ page }) => {
  await page.goto('/play');
  await post(page, 'model_endpoint', {
    name: 'Stub',
    base_url: MODEL_URL,
    model: 'tiny',
    roles: ['story', 'gm', 'summary'],
    is_default: true,
  });
  for (const name of ['Gus Veridan', 'A.Z.']) await post(page, 'character', { name, tags: ['PC'], folder: 'The Cell' });
  await post(page, 'character', { name: 'Massen', tags: ['NPC'], folder: 'Solenne' });
  const frame = await post(page, 'campaign_frame', {
    name: 'Solenne',
    premise: 'Acolytes on a quiet moon.',
  });
  await post(page, 'scenario', { name: 'Warp exit', campaign_id: frame.id, situation: 'The ship leaves the warp.' });

  await page.goto(`/campaigns/${frame.id}`);
  await page.getByRole('link', { name: 'Start a campaign' }).click();
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/);
  await expect(page.getByText('Session 1')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Narrator' }).first()).toContainText('The ship leaves the warp.');

  // As the GM: the line is narration, and the party answers.
  await page.getByLabel('Your next line').fill('A vox hail crackles from traffic control.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('article', { name: /Gus Veridan|A\.Z\./ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop the reply' })).toHaveCount(0);

  // Any seat at any time: a party member, then an NPC from outside the party.
  await seat(page, 'Gus Veridan');
  // In Gus's seat, the line is Gus's, and the round ends with the AI GM's narration.
  const narrations = await page.getByRole('article', { name: 'Narrator' }).count();
  await page.getByLabel('Your next line').fill('I check the auspex for other ships.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('article', { name: 'Gus Veridan' }).filter({ hasText: 'I check the auspex' })).toBeVisible();
  await expect.poll(() => page.getByRole('article', { name: 'Narrator' }).count()).toBeGreaterThan(narrations);
  await expect(page.getByRole('button', { name: 'Stop the reply' })).toHaveCount(0);
  await seat(page, 'Massen');
  await expect(page.getByRole('list', { name: 'In this chat' })).toContainText('Massen');
  await page.getByLabel('Your next line').fill('Welcome to Solenne, acolytes.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('article', { name: 'Massen' }).filter({ hasText: 'Welcome to Solenne' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop the reply' })).toHaveCount(0);
  // An NPC joins the party only while played: leaving his seat, Massen leaves the party.
  await seat(page, null);
  await expect(page.getByRole('list', { name: 'In this chat' })).not.toContainText('Massen');

  // End the session: Session 2 starts at its marker.
  await page.getByRole('button', { name: 'More for this chat' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await expect(page.getByText('Session 2').first()).toBeVisible();

  // Fork a new campaign from Massen's line: his line is copied though he has left the party,
  // and the fork's party is the campaign's.
  const chatUrl = page.url();
  const welcome = page.getByRole('article', { name: 'Massen' }).filter({ hasText: 'Welcome to Solenne' });
  await welcome.getByRole('button', { name: /More for/ }).click();
  await page.getByRole('menuitem', { name: 'Fork a new campaign from here' }).click();
  await expect(page).not.toHaveURL(chatUrl);
  await expect(page.getByRole('article', { name: 'Narrator' }).first()).toContainText('The ship leaves the warp.');
  await expect(page.getByRole('article', { name: 'Massen' }).filter({ hasText: 'Welcome to Solenne' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'In this chat' })).not.toContainText('Massen');
});
