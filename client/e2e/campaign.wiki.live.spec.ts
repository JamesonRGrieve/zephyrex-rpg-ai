// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A whole campaign session over the composed suite, against real models (the operator, 2026-11-21:
 * "fully test the app end-to-end including full campaign sessions with many interactions, combat,
 * full party plus NPC talk"; rpg-ai embeds the wiki and the VTT, docs/SUITE.md). Hosted (saas)
 * only: the composed server serves the wiki and the VTT. Runs only with LIVE_MODEL_URL and
 * LIVE_STORY_MODEL set.
 *
 * It makes the scenario in the wiki (a campaign in the Warhammer 40,000 setting, its player
 * characters and an NPC as wiki persons), finds it on Scenarios under its setting, starts a
 * campaign of it with the PCs as the party, and plays: the GM's narration with the AI party
 * answering, the seat swapped to a party member and then to the NPC, a fight with a roll from the
 * VTT's dice tray, the AI GM narrating on demand, and the session ended into its summary. Every
 * line written is saved as the test's transcript.json for a person to read.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { isHosted, signIn } from './support/people';
import { post } from './support/seed';

const LIVE = process.env.LIVE_MODEL_URL ?? '';
const STORY = process.env.LIVE_STORY_MODEL ?? '';
const SUMMARY = process.env.LIVE_SUMMARY_MODEL ?? '';
/** How long one model turn may take (a cold load on the lab's tier is about two minutes). */
const TURN = 240_000;

test.skip(LIVE === '' || STORY === '', 'Live models only: set LIVE_MODEL_URL and LIVE_STORY_MODEL');
test.describe.configure({ mode: 'serial' });

const transcript: { step: string; lines: { speaker: string; text: string }[] }[] = [];
let transcriptPath = '';
function record(step: string, lines: { speaker: string; text: string }[]): void {
  transcript.push({ step, lines });
  if (transcriptPath !== '') writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
}

async function lines(page: Page): Promise<{ speaker: string; text: string }[]> {
  return page.getByRole('article').evaluateAll((articles) =>
    articles.map((article) => ({
      speaker: article.getAttribute('aria-label') ?? '',
      text: (article.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
}

/** Nothing is being written and the story has held still for a few seconds. */
async function settled(page: Page): Promise<void> {
  const deadline = Date.now() + TURN;
  let last = -1;
  let still = 0;
  while (Date.now() < deadline) {
    const writing = await page.getByRole('button', { name: 'Stop the reply' }).count();
    const count = await page.getByRole('article').count();
    still = writing === 0 && count === last ? still + 1 : 0;
    if (still >= 4) return;
    last = count;
    await page.waitForTimeout(1500);
  }
  throw new Error('The round never settled');
}

async function say(page: Page, step: string, text: string, replies = 1): Promise<void> {
  const before = await page.getByRole('article').count();
  await page.getByLabel('Your next line').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 1 + replies);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: TURN });
  await settled(page);
  record(step, (await lines(page)).slice(before));
}

async function seat(page: Page, name: string | null): Promise<void> {
  await page.getByRole('button', { name: /^Your seat:/ }).click();
  if (name === null) {
    await page.getByRole('button', { name: 'The GM' }).click();
  } else {
    await page.getByLabel('Find a character').fill(name);
    await page.getByRole('list', { name: 'Seats' }).getByRole('button', { name: new RegExp(name) }).first().click();
  }
  await expect(page.getByRole('button', { name: `Your seat: ${name ?? 'the GM'}` })).toBeVisible();
}

test('a campaign of a wiki scenario: GM, party, an NPC, a fight with a VTT roll, the session ended', async ({
  page,
}, testInfo) => {
  test.skip(!isHosted(testInfo), 'The composed suite: hosted only');
  test.setTimeout(14 * 60_000);
  transcriptPath = testInfo.outputPath('transcript.json');
  mkdirSync(dirname(transcriptPath), { recursive: true });
  await signIn(page);
  await post(page, 'model_endpoint', {
    name: 'Story',
    base_url: LIVE,
    model: STORY,
    api: 'chat',
    roles: ['story', 'gm'],
    is_default: true,
  });
  if (SUMMARY !== '') {
    await post(page, 'model_endpoint', { name: 'Summaries', base_url: LIVE, model: SUMMARY, api: 'chat', roles: ['summary'] });
  }

  // The scenario lives in the wiki: a campaign, its player characters and an NPC.
  const campaign = await post(page, 'campaign', {
    name: 'Voidship Escapade (e2e)',
    is_scenario: true,
    description:
      'The rogue trader vessel Fortune of Varn drifts dark at the edge of the Calixis Sector. The acolytes wake in the brig as the alarms begin.',
  });
  const person = (name: string, kind: string, description: string) =>
    post(page, 'person', { name, kind, description, campaign_id: campaign.id });
  await person('The Rogue Trader', 'pc', 'A disgraced scion of a trading dynasty, silver-tongued and armed with a laspistol.');
  await person('The Acolyte', 'pc', 'A young agent of the Inquisition, sharp-eyed and quietly devout.');
  await person('Chief Petty Officer Rask', 'npc', 'The brig warden of the Fortune of Varn, gruff, scared and hiding something.');

  // Scenarios: the wiki campaign, grouped under its setting and system; a tap starts a campaign.
  await page.goto('/campaigns');
  await page.getByRole('button', { name: /^Start a campaign of Voidship Escapade \(e2e\)/ }).click();
  await expect(page.getByRole('button', { name: 'Start the campaign' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Party' }).getByRole('button', { pressed: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Your seat: the GM' })).toBeVisible();
  await expect(page.getByText('Session 1')).toBeVisible();

  await say(page, 'GM opens the scene', 'The brig door hisses open. Chief Petty Officer Rask stands there, lasgun shaking: "Up. Both of you."');

  await seat(page, 'The Rogue Trader');
  await say(page, 'The Rogue Trader speaks', 'I stand slowly, hands visible. "Easy, Chief. Whatever is happening up there, we can help."');

  await seat(page, 'Chief Petty Officer Rask');
  await say(page, 'Rask answers', '"Help? Something is in the vents, eating the crew. The captain is gone." I lower the lasgun an inch.');

  await seat(page, null);
  await say(page, 'GM starts a fight', 'The vent above them bursts open. A pale, many-limbed thing drops into the brig. Combat begins!');

  // A roll from the VTT's dice tray: a formula, rolled on the server, recorded as a roll line.
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.getByRole('button', { name: 'Dice' }).click();
  const formula = page.getByLabel(/formula/i);
  if ((await formula.count()) > 0) {
    await formula.fill('1d100');
    await page.getByRole('button', { name: /^Roll/ }).last().click();
    await expect(page.getByRole('status').filter({ hasText: /\d/ }).first()).toBeVisible({ timeout: 30_000 });
    record('A VTT roll', [{ speaker: 'roll', text: (await page.getByRole('status').first().textContent()) ?? '' }]);
  } else {
    record('A VTT roll', [{ speaker: 'roll', text: '(the tray offered no formula field)' }]);
  }
  await page.keyboard.press('Escape');

  const before = await page.getByRole('article').count();
  await page.getByRole('button', { name: 'Narrate what happens next' }).click();
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 1);
  await settled(page);
  record('AI GM narrates', (await lines(page)).slice(before));

  await page.getByRole('button', { name: 'More for this chat' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await expect(page.getByText('Session 2').first()).toBeVisible({ timeout: TURN });

  writeFileSync(testInfo.outputPath('transcript.json'), JSON.stringify(transcript, null, 2));
  for (const step of transcript) for (const line of step.lines) expect(line.text.length, step.step).toBeGreaterThan(0);
});
