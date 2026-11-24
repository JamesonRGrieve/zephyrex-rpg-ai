// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A live session from a player's seat (the operator, 2026-11-23: "fully test… full campaign sessions with
 * man interaction, combat, full party plus NPC talk"), on any instance (pw.prod.config.ts's LIVE_ORIGIN), as
 * the test user, against the instance's own models: Brenna's seat, the party and the AI GM answering her,
 * an NPC spoken to, a fight the story starts (combat_check, the VTT's encounter and the AI's turns), and the
 * session ended. The cast is put on the scene's map first, as a GM sets a table up. Every line is saved as
 * transcript.json. Run with PROD_SESSION set to the test user's session.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { api, post, setMultiActor } from './support/seed';

const SESSION = process.env.PROD_SESSION ?? '';
const HOST = new URL(process.env.LIVE_ORIGIN ?? 'https://rpg.zephyrex.ca').hostname;
/** One model turn: a cold load of the narrator can take minutes. */
const TURN = 420_000;

test.skip(SESSION === '', "PROD_SESSION: the test user's session");

const transcript: { step: string; at: string; lines: { speaker: string; text: string }[] }[] = [];
let transcriptPath = '';
function record(step: string, lines: { speaker: string; text: string }[]): void {
  transcript.push({ step, at: new Date().toISOString(), lines });
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

/** Nothing is being written and the story has held still for a while. */
async function settled(page: Page): Promise<void> {
  const deadline = Date.now() + TURN;
  let last = -1;
  let still = 0;
  while (Date.now() < deadline) {
    const writing = await page.getByRole('button', { name: 'Stop the reply' }).count();
    const busy = await page.locator('[aria-busy="true"]').count();
    const count = await page.getByRole('article').count();
    still = writing === 0 && busy === 0 && count === last ? still + 1 : 0;
    if (still >= 6) return;
    last = count;
    await page.waitForTimeout(2000);
  }
  throw new Error('The round never settled');
}

/** The seat's line, and at least one answer to it (a player's line always gets one). */
async function act(page: Page, step: string, kind: 'Say' | 'Do', text: string): Promise<void> {
  const before = await page.getByRole('article').count();
  await page.getByRole('button', { name: kind, exact: true }).click();
  await page
    .getByLabel(kind === 'Say' ? 'What is said' : 'What is done')
    .last()
    .fill(text);
  await page.getByRole('button', { name: /^Send/ }).click();
  // A question from the GM (which one is meant) can come at any point while the turn is worked out (it waits on
  // the decision model): whenever one is open, it's answered with its first choice, as a person would answer.
  await expect
    .poll(
      async () => {
        const asked = page.getByRole('dialog');
        if (await asked.isVisible().catch(() => false)) await asked.getByRole('button').first().click();
        return page.getByRole('article').count();
      },
      { timeout: TURN, intervals: [2000] },
    )
    .toBeGreaterThanOrEqual(before + 2);
  await settled(page);
  record(step, (await lines(page)).slice(before));
}

async function campaignOf(page: Page): Promise<string> {
  const chat = page.url().split('/').pop() ?? '';
  return (await api<{ chat: { campaign_id: string } }>(page, 'GET', `chat/${chat}`)).chat.campaign_id;
}

test('live from a seat: party and NPC talk, the AI GM, a fight in the VTT order, the session ended', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(55 * 60_000);
  transcriptPath = testInfo.outputPath('transcript.json');
  mkdirSync(dirname(transcriptPath), { recursive: true });
  await context.addCookies([
    { name: 'zx_session', value: SESSION, domain: HOST, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    {
      name: 'zx_csrf',
      value: randomBytes(24).toString('base64url'),
      domain: HOST,
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/play');
  await expect(page.getByRole('heading', { level: 1, name: 'Your campaigns' })).toBeVisible({ timeout: 60_000 });

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const title = `The Drowned Mill, from a seat (live test ${stamp})`;
  const scenario = await post(page, 'campaign', {
    name: title,
    is_scenario: true,
    description:
      'Rain has flooded the valley. The miller of Fendry has not been seen in three days, and lights move in the drowned mill at night. Old Hesk the ferryman waits at the bank.',
  });
  const person = (name: string, kind: string, description: string) =>
    post(page, 'person', { name, kind, description, campaign_id: scenario.id });
  await person('Brenna Ashdown', 'pc', 'A broad-shouldered fighter with a battered shield and a soft heart for strays.');
  await person('Tam Quickfoot', 'pc', 'A halfling rogue who talks fast and pockets faster.');
  await person('Old Hesk', 'npc', 'The ferryman of Fendry: gnarled, superstitious, and owed money by the missing miller.');

  await page.goto('/campaigns');
  await page
    .getByRole('button', { name: `Start a campaign of ${title}` })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/, { timeout: 180_000 });
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 120_000 });
  await settled(page);
  record('Opening', await lines(page));
  record('Chat', [{ speaker: 'url', text: page.url() }]);

  // The table set up: everyone on the scene's map.
  const campaign = await campaignOf(page);
  const scene = (
    await api<{ scene: { id: string } | null }>(page, 'POST', 'scene/current', { current: { campaign_id: campaign } })
  ).scene;
  expect(scene, 'the campaign has a current scene').not.toBeNull();
  const people = await api<{ persons: { id: string; name: string }[] }>(
    page,
    'GET',
    `person?campaign_id=${campaign}&limit=100`,
  );
  // Start already put the party on the map (place_party): only those not yet on it get a token, one each.
  const placed = await api<{ scene_tokens: { entity_id: string | null }[] }>(page, 'GET', `scene/${scene?.id ?? ''}/tokens`);
  for (const one of people.persons)
    if (!placed.scene_tokens.some((token) => token.entity_id === one.id))
      await post(page, 'scene_token', { scene_id: scene?.id ?? '', person_id: one.id, name: one.name });

  await page.reload();
  await page.getByRole('button', { name: /^Your seat:/ }).click();
  await page.getByLabel('Find a character').fill('Brenna');
  await page
    .getByRole('list', { name: 'Seats' })
    .getByRole('button', { name: /Brenna/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Your seat: Brenna Ashdown' })).toBeVisible({ timeout: 60_000 });
  // Each live pass runs once per mode (LIVE_MULTI_ACTOR on or off).
  const multiActor = await setMultiActor(page, page.url().split('/').pop() ?? '');
  testInfo.annotations.push({ type: 'multi_actor', description: String(multiActor) });

  await act(
    page,
    'Brenna speaks to Tam',
    'Say',
    "Tam, keep your hands out of other folks' pockets tonight. We need the ferryman on our side.",
  );
  await act(
    page,
    'Brenna speaks to Hesk',
    'Say',
    'Old Hesk, you have watched that mill for three nights. What have you seen out there? Tell me true.',
  );
  await act(
    page,
    'Brenna boards',
    'Do',
    'I pay Hesk two silver and step onto the ferry, shield on my arm, eyes on the drowned mill.',
  );
  await act(
    page,
    'A fight',
    'Do',
    'A bloated drowned thing heaves itself out of the millrace at me. I draw my sword and strike at it before it can grab the ferry.',
  );
  const fight = await api<{ encounter: { id: string; status: string } | null }>(page, 'POST', 'encounter/current', {
    current: { campaign_id: campaign },
  }).catch(() => ({ encounter: null }));
  record('Encounter', [{ speaker: 'vtt', text: JSON.stringify(fight.encounter) }]);
  expect.soft(fight.encounter?.status, 'the story started a fight in the VTT').toBe('running');
  await act(page, 'Brenna fights on', 'Do', 'I bash it with my shield and drive my sword into its swollen side.');

  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.getByRole('button', { name: 'This chat' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Session 2').first()).toBeVisible({ timeout: TURN });
  record('Session ended', [{ speaker: 'ui', text: 'Session 2 shown' }]);
});
