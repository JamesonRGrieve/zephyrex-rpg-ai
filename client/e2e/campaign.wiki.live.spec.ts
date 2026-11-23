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
import { api, post } from './support/seed';

const LIVE = process.env.LIVE_MODEL_URL ?? '';
const STORY = process.env.LIVE_STORY_MODEL ?? '';
const SUMMARY = process.env.LIVE_SUMMARY_MODEL ?? '';
// The decision model that runs the table (who acts next, rolls, labels), as prod has one.
const DECIDE = process.env.LIVE_DECIDE_MODEL ?? '';
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
  // A campaign's turn is queued (docs/DESIGN.md, Structured lines): one Do item carries the line.
  await page.getByRole('button', { name: 'Do', exact: true }).click();
  await page.getByLabel('What is done').last().fill(text);
  await page.getByRole('button', { name: /^Send/ }).click();
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
    await page
      .getByRole('list', { name: 'Seats' })
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
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
  if (DECIDE !== '') {
    await post(page, 'model_endpoint', { name: 'Decide', base_url: LIVE, model: DECIDE, api: 'chat', roles: ['decide'] });
  }
  if (SUMMARY !== '') {
    await post(page, 'model_endpoint', {
      name: 'Summaries',
      base_url: LIVE,
      model: SUMMARY,
      api: 'chat',
      roles: ['summary'],
    });
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
  await person(
    'The Rogue Trader',
    'pc',
    'A disgraced scion of a trading dynasty, silver-tongued and armed with a laspistol.',
  );
  await person('The Acolyte', 'pc', 'A young agent of the Inquisition, sharp-eyed and quietly devout.');
  await person(
    'Chief Petty Officer Rask',
    'npc',
    'The brig warden of the Fortune of Varn, gruff, scared and hiding something.',
  );

  // Scenarios: the wiki campaign, grouped under its setting and system; a tap starts a campaign.
  await page.goto('/campaigns');
  await page.getByRole('button', { name: /^Start a campaign of Voidship Escapade \(e2e\)/ }).click();
  await expect(page.getByRole('button', { name: 'Start the campaign' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Party' }).getByRole('button', { pressed: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Your seat: the GM' })).toBeVisible();
  // The session's name left the header with the app bar (6bc56a4); the composer says the chat is open.
  await expect(page.getByRole('button', { name: 'Say', exact: true })).toBeVisible();

  await say(
    page,
    'GM opens the scene',
    'The brig door hisses open. Chief Petty Officer Rask stands there, lasgun shaking: "Up. Both of you."',
  );

  await seat(page, 'The Rogue Trader');
  await say(
    page,
    'The Rogue Trader speaks',
    'I stand slowly, hands visible. "Easy, Chief. Whatever is happening up there, we can help."',
  );

  await seat(page, 'Chief Petty Officer Rask');
  await say(
    page,
    'Rask answers',
    '"Help? Something is in the vents, eating the crew. The captain is gone." I lower the lasgun an inch.',
  );

  await seat(page, null);
  await say(
    page,
    'GM starts a fight',
    'The vent above them bursts open. A pale, many-limbed thing drops into the brig. Combat begins!',
  );

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
  await page.getByRole('button', { name: 'Pass your turn' }).click();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 1);
  await settled(page);
  record('AI GM narrates', (await lines(page)).slice(before));

  // The GM moves people on the map, and who is present follows (the operator, 2026-11-23: "confirm that the
  // DM correctly moves people on the map, triggering their presence updates"). Rask is given a token on the
  // current scene, so he is here; moved to another scene from the map, he is elsewhere.
  const chatId = page.url().split('/').pop() ?? '';
  const playthrough = await api<{ chat: { campaign_id: string } }>(page, 'GET', `chat/${chatId}`);
  const campaignId = playthrough.chat.campaign_id;
  const current = await api<{ scene: { id: string } | null }>(page, 'POST', 'scene/current', {
    current: { campaign_id: campaignId },
  });
  const sceneId = current.scene?.id ?? '';
  expect(sceneId, 'the campaign has a current scene').not.toBe('');
  const people = await api<{ persons: { id: string; name: string }[] }>(
    page,
    'GET',
    `person?campaign_id=${campaignId}&limit=100`,
  );
  const rask = people.persons.find((one) => one.name === 'Chief Petty Officer Rask');
  expect(rask, "Rask is the playthrough's person").toBeDefined();
  await post(page, 'scene_token', { scene_id: sceneId, person_id: rask?.id ?? '', name: 'Chief Petty Officer Rask' });
  const shaft = await post(page, 'scene', { name: 'The Vent Shaft', campaign_id: campaignId });
  await page.reload();
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Here' })).toContainText('Chief Petty Officer Rask', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page
    .getByRole('tab', { name: 'Map' })
    .or(page.getByRole('button', { name: 'Map' }))
    .first()
    .click();
  const move = page.getByRole('form', { name: 'Move to another scene' });
  await move.getByLabel('Move').selectOption({ label: 'Chief Petty Officer Rask' });
  await move.getByLabel('To').selectOption({ label: 'The Vent Shaft' });
  await move.getByRole('button', { name: 'Move' }).click();
  await page
    .getByRole('tab', { name: 'Chat' })
    .or(page.getByRole('button', { name: 'Chat' }))
    .first()
    .click();
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Here' })).not.toContainText('Chief Petty Officer Rask', { timeout: 30_000 });
  // His token is on the scene he was moved to.
  const there = await api<{ scene_tokens: { person_id: string | null }[] }>(
    page,
    'GET',
    `scene_token?scene_id=${shaft.id}&limit=50`,
  );
  expect(there.scene_tokens.map((one) => one.person_id)).toContain(rask?.id ?? '');
  record('The GM moves Rask to another scene', [
    { speaker: 'map', text: 'Here, then on The Vent Shaft and no longer here' },
  ]);
  await page.keyboard.press('Escape');

  // The X-card is on the message, with an optional reason (the operator, 2026-11-23); it can be put back.
  const latest = page
    .getByRole('article')
    .filter({ has: page.getByRole('button', { name: /^More for / }) })
    .last();
  const who = ((await latest.getAttribute('aria-label')) ?? '').split(',')[0] ?? '';
  await latest.getByRole('button', { name: /^More for / }).click();
  await page.getByRole('menuitem', { name: 'X-card' }).click();
  await page.getByLabel(/What should the story stay away from/).fill('the crew being eaten');
  await page.getByRole('button', { name: 'X-card', exact: true }).click();
  const carded = page.getByRole('article', { name: `${who}, X-carded` }).last();
  await expect(carded).toBeVisible();
  await carded.getByRole('button', { name: 'Put it back' }).click();
  await expect(page.getByRole('article', { name: `${who}, X-carded` })).toHaveCount(0);
  record('X-card and back', [{ speaker: who, text: 'X-carded with a reason, then put back' }]);

  // The chat's actions live in the Context panel's This chat section (cdd198f).
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.getByRole('button', { name: 'This chat' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Session 2').first()).toBeVisible({ timeout: TURN });

  writeFileSync(testInfo.outputPath('transcript.json'), JSON.stringify(transcript, null, 2));
  for (const step of transcript) for (const line of step.lines) expect(line.text.length, step.step).toBeGreaterThan(0);
});
