// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A live session on prod (the operator, 2026-11-23: "Test current prod now"), as the test user
 * rpg-test@example.com, against prod's own models: an open-content fantasy one-shot of the test user's
 * own with the party, an NPC, a fight with a VTT roll, the AI GM and the session ended. Every line is
 * saved as transcript.json. Run with PROD_SESSION set to the test user's session.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { post } from './support/seed';

const SESSION = process.env.PROD_SESSION ?? '';
/** One model turn: a cold load of the 72 GB narrator can take minutes. */
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

async function act(page: Page, step: string, text: string): Promise<void> {
  const before = await page.getByRole('article').count();
  await page.getByRole('button', { name: 'Do', exact: true }).click();
  await page.getByLabel('What is done').last().fill(text);
  await page.getByRole('button', { name: /^Send/ }).click();
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 2);
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
  await expect(page.getByRole('button', { name: `Your seat: ${name ?? 'the GM'}` })).toBeVisible({ timeout: 60_000 });
}

function campaignChat(page: Page): string {
  return page.url().split('/').pop() ?? '';
}

/** Who has a token on the campaign's current scene, and who shares the party's wiki place, by name. */
async function presence(page: Page, chatId: string): Promise<{ onScene: string[]; withParty: string[] }> {
  return page.evaluate(async (chat) => {
    const token = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('zx_csrf='))
      ?.slice('zx_csrf='.length);
    const call = async (method: string, path: string, body?: unknown) =>
      (
        await fetch(`/api/v1/${path}`, {
          method,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...(token === undefined ? {} : { 'X-CSRF-Token': token }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      ).json();
    const campaign = (await call('GET', `chat/${chat}`)).chat.campaign_id as string;
    const people = ((await call('GET', `person?campaign_id=${campaign}&limit=100`)).persons ?? []) as {
      id: string;
      name: string;
      kind: string;
      location_id: string | null;
    }[];
    const scene = (await call('POST', 'scene/current', { current: { campaign_id: campaign } })).scene as {
      id: string;
    } | null;
    const tokens = scene
      ? (((await call('GET', `scene/${scene.id}/tokens`)).scene_tokens ?? []) as {
          entity_id: string | null;
        }[])
      : [];
    const named = (id: string | null) => people.find((one) => one.id === id)?.name ?? '';
    const partyPlace = people.find((one) => one.kind === 'pc')?.location_id ?? null;
    return {
      onScene: tokens.map((one) => named(one.entity_id)).filter((name) => name !== ''),
      withParty: partyPlace === null ? [] : people.filter((one) => one.location_id === partyPlace).map((one) => one.name),
    };
  }, chatId);
}

test('live on prod: a one-shot with the party, an NPC, a fight with a VTT roll, the AI GM, the session ended', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(55 * 60_000);
  transcriptPath = testInfo.outputPath('transcript.json');
  mkdirSync(dirname(transcriptPath), { recursive: true });
  await context.addCookies([
    {
      name: 'zx_session',
      value: SESSION,
      domain: 'rpg.zephyrex.ca',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
    // The double-submit token sign-in would set: random, readable by the page, echoed on each write.
    {
      name: 'zx_csrf',
      value: randomBytes(24).toString('base64url'),
      domain: 'rpg.zephyrex.ca',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/play');
  await expect(page.getByRole('heading', { level: 1, name: 'Your campaigns' })).toBeVisible({ timeout: 60_000 });

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const title = `The Drowned Mill (live test ${stamp})`;
  const campaign = await post(page, 'campaign', {
    name: title,
    is_scenario: true,
    description:
      'Rain has flooded the valley. The miller of Fendry has not been seen in three days, and lights move in the drowned mill at night.',
  });
  const person = (name: string, kind: string, description: string) =>
    post(page, 'person', { name, kind, description, campaign_id: campaign.id });
  await person('Brenna Ashdown', 'pc', 'A broad-shouldered fighter with a battered shield and a soft heart for strays.');
  await person('Tam Quickfoot', 'pc', 'A halfling rogue who talks fast and pockets faster.');
  await person('Old Hesk', 'npc', 'The ferryman of Fendry: gnarled, superstitious, and owed money by the missing miller.');

  await page.goto('/campaigns');
  await page
    .getByRole('button', { name: `Start a campaign of ${title}` })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Start the campaign' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/, { timeout: 180_000 });
  await expect(page.getByRole('button', { name: 'Say', exact: true })).toBeVisible({ timeout: 60_000 });
  // The opening is in place before anything is counted as an answer.
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 120_000 });
  await settled(page);
  record('Opening', await lines(page));
  record('Chat', [{ speaker: 'url', text: page.url() }]);

  await act(
    page,
    'GM sets the scene',
    'Old Hesk poles his ferry to the bank where the party waits in the rain. "Mill is that way. I will not go nearer."',
  );

  await seat(page, 'Brenna Ashdown');
  await act(page, 'Brenna speaks to Hesk', 'I step onto the ferry. "What have you seen out there, Hesk? Tell me true."');

  await seat(page, 'Old Hesk');
  await act(
    page,
    'Hesk answers',
    '"Lights. Green ones. And something big in the millrace that is not a fish." I spit over the side.',
  );

  await seat(page, null);
  // The GM moves people as the story says, and who is present follows (the operator, 2026-11-23): Hesk
  // leaves; afterwards he is neither on the current scene with the party nor where the party is.
  // Before he leaves: where Hesk stands, so the check after can't pass on an empty map.
  const before = await presence(page, campaignChat(page));
  record('Presence before Hesk leaves', [{ speaker: 'presence', text: JSON.stringify(before) }]);
  expect
    .soft([...before.onScene, ...before.withParty], 'Hesk is on the map or with the party before he leaves')
    .toContain('Old Hesk');
  await act(
    page,
    'GM sends Hesk away',
    'Old Hesk pockets his coin and poles the ferry back across the river into the rain, leaving the party alone on the mill steps.',
  );
  const where = await presence(page, campaignChat(page));
  record('Presence after Hesk leaves', [{ speaker: 'presence', text: JSON.stringify(where) }]);
  expect.soft(where.onScene, 'Hesk has no token on the current scene').not.toContain('Old Hesk');
  expect.soft(where.withParty, 'Hesk is not where the party is').not.toContain('Old Hesk');

  await act(
    page,
    'GM starts a fight',
    'As the ferry bumps the mill steps, a bloated drowned thing heaves itself out of the water at Tam. Roll initiative!',
  );

  await page.getByRole('button', { name: 'Context', exact: true }).click();
  const dice = page.getByRole('button', { name: 'Dice' });
  if ((await dice.count()) > 0) {
    await dice.click();
    const formula = page.getByLabel(/formula/i);
    if ((await formula.count()) > 0) {
      await formula.fill('1d20+2');
      await page.getByRole('button', { name: /^Roll/ }).last().click();
      await expect(page.getByRole('status').filter({ hasText: /\d/ }).first()).toBeVisible({ timeout: 60_000 });
      record('A VTT roll', [{ speaker: 'roll', text: (await page.getByRole('status').first().textContent()) ?? '' }]);
    } else record('A VTT roll', [{ speaker: 'roll', text: '(no formula field in the tray)' }]);
  } else record('A VTT roll', [{ speaker: 'roll', text: '(no Dice section in the Context panel)' }]);
  await page.keyboard.press('Escape');

  await seat(page, 'Tam Quickfoot');
  await act(page, 'Tam fights', 'I duck under its swing and stab at its swollen side with my shortsword.');

  await seat(page, null);
  const before = await page.getByRole('article').count();
  await page.getByRole('button', { name: 'Pass your turn' }).click();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 1);
  await settled(page);
  record('AI GM narrates', (await lines(page)).slice(before));

  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.getByRole('button', { name: 'This chat' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Session 2').first()).toBeVisible({ timeout: TURN });
  record('Session ended', [{ speaker: 'ui', text: 'Session 2 shown' }]);
});
