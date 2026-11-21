// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A whole campaign session against real models (the operator, 2026-11-21: "fully test the app
 * end-to-end including full campaign sessions with many interactions, combat, full party plus NPC
 * talk"). Runs only with LIVE_MODEL_URL (an OpenAI-compatible server, e.g. the lab's bifrost),
 * LIVE_STORY_MODEL and LIVE_SUMMARY_MODEL set; lite only. It seeds a scenario, starts a campaign
 * from its page, and plays: the GM's narration with the AI party answering, the seat swapped to
 * a party member and then to an NPC from outside the party, a fight, the AI GM narrating on demand,
 * the session ended into its summary and Session 2, and a fork. Every line written is saved as
 * the test's transcript.json for a person to read.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const LIVE = process.env.LIVE_MODEL_URL ?? '';
const STORY = process.env.LIVE_STORY_MODEL ?? '';
const SUMMARY = process.env.LIVE_SUMMARY_MODEL ?? '';
const DECIDE = process.env.LIVE_DECIDE_MODEL ?? '';
/** How long one model turn may take (a cold load on the lab's tier is about two minutes). */
const TURN = 240_000;

test.skip(LIVE === '' || STORY === '', 'Live models only: set LIVE_MODEL_URL and LIVE_STORY_MODEL');
test.describe.configure({ mode: 'serial' });

async function post<T>(page: Page, path: string, key: string, body: object): Promise<T> {
  const answer = await page.request.post(`/api/v1/${path}`, { data: { [key]: body } });
  expect(answer.ok(), `${path}: ${await answer.text()}`).toBe(true);
  return (await answer.json())[key] as T;
}

const transcript: { step: string; lines: { speaker: string; text: string }[] }[] = [];
/** Where the transcript is written as it grows, so a failure still leaves what was played. */
let transcriptPath = '';
function record(step: string, lines: { speaker: string; text: string }[]): void {
  transcript.push({ step, lines });
  if (transcriptPath !== '') writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
}

/** The story's lines as shown: each article's speaker and text. */
async function lines(page: Page): Promise<{ speaker: string; text: string }[]> {
  return page.getByRole('article').evaluateAll((articles) =>
    articles.map((article) => ({
      speaker: article.getAttribute('aria-label') ?? '',
      text: (article.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
}

/**
 * The round is over: nothing is being written (the Composer offers Stop while it is) and the story
 * has held still for a few seconds, since a round's turns follow one another with gaps between.
 */
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

/** Sends a line and waits until the AI has written at least `replies` more, all of them finished. */
async function say(page: Page, step: string, text: string, replies = 1): Promise<void> {
  const before = await page.getByRole('article').count();
  await page.getByLabel('Your next line').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  // The party members who speak up vary with their talkativeness: at least `replies`, then quiet.
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 1 + replies);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: TURN });
  await settled(page);
  record(step, (await lines(page)).slice(before));
}

/** Takes a seat: a character by name, or the GM (null). */
async function seat(page: Page, name: string | null): Promise<void> {
  await page.getByRole('button', { name: /^Your seat:/ }).click();
  if (name === null) {
    await page.getByRole('button', { name: 'The GM' }).click();
  } else {
    await page.getByLabel('Find a character').fill(name);
    await page
      .getByRole('list', { name: 'Seats' })
      .getByRole('button', { name: new RegExp(name.replace('.', '\\.')) })
      .first()
      .click();
  }
  await expect(page.getByRole('button', { name: `Your seat: ${name ?? 'the GM'}` })).toBeVisible();
}

test('a full campaign session: GM, party, an NPC, a fight, the session ended, a fork', async ({ page }, testInfo) => {
  test.setTimeout(14 * 60_000);
  transcriptPath = testInfo.outputPath('transcript.json');
  mkdirSync(dirname(transcriptPath), { recursive: true });
  await page.goto('/');
  await post(page, 'model_endpoint', 'model_endpoint', {
    name: 'Story',
    base_url: LIVE,
    model: STORY,
    api: 'chat',
    roles: ['story', 'gm'],
    is_default: true,
  });
  if (SUMMARY !== '') {
    await post(page, 'model_endpoint', 'model_endpoint', {
      name: 'Summaries',
      base_url: LIVE,
      model: SUMMARY,
      api: 'chat',
      roles: ['summary', 'translate'],
    });
  }
  if (DECIDE !== '') {
    await post(page, 'model_endpoint', 'model_endpoint', {
      name: 'Decide',
      base_url: LIVE,
      model: DECIDE,
      api: 'chat',
      roles: ['decide'],
    });
  }
  const pc = (name: string, description: string) =>
    post(page, 'character', 'character', { name, description, tags: ['PC'], folder: 'The Cell' });
  await pc('Gus Veridan', '{{char}} is an ex-Imperial Navy rating, blunt and steady with a shotgun.');
  await pc('A.Z.', '{{char}} is a sanctioned psyker who hears what others think and hates it.');
  await pc('Magnus Karlsson', '{{char}} is a tech-adept of the Adeptus Mechanicus, precise and curious.');
  await post(page, 'character', 'character', {
    name: 'Massen',
    description: '{{char}} is the friendly cargo supervisor of the Transit Hub, a little too friendly lately.',
    tags: ['NPC'],
    folder: 'Solenne',
  });
  const frame = await post<{ id: string }>(page, 'campaign_frame', 'campaign_frame', {
    name: 'Solenne',
    premise:
      'Acolytes of the Inquisition, posing as minor Administratum officials, arrive at Solenne Minoris to find a missing auditor.',
    genre: 'Grimdark investigation (Warhammer 40,000)',
    truths: ['The acolytes travel under cover aboard The Errant Vector.'],
  });
  await post(page, 'scenario', 'scenario', {
    name: 'Solenne: Warp Exit',
    campaign_id: frame.id,
    situation:
      'The Errant Vector shudders out of the warp into the Solenne system. Solenne Minoris, an ore moon, hangs ahead. Docking is an hour away.',
  });

  // Start a campaign from the scenario's page: the party is the PCs, the person starts as the GM.
  await page.goto(`/campaigns/${frame.id}`);
  await page.getByRole('link', { name: 'Start a campaign' }).click();
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Your seat: the GM' })).toBeVisible();
  await expect(page.getByText('Session 1')).toBeVisible();

  // As the GM: the party answers what the GM narrates.
  await say(
    page,
    'GM opens the scene',
    'Alarms chime softly: a vox hail from Transit Hub traffic control asks the Errant Vector to state its business.',
    1,
  );

  // As a party member: the rest of the party and the AI GM answer.
  await seat(page, 'Gus Veridan');
  await say(
    page,
    'Gus speaks',
    'I lean over the vox and tell traffic control we are Administratum census officers, here on routine business.',
    1,
  );

  // As an NPC from outside the party: any character at all.
  await seat(page, 'Massen');
  await say(
    page,
    'Massen greets them',
    'Massen waves the acolytes off the boarding ramp: "Welcome to Solenne Minoris! First round at The Sump is on me."',
    1,
  );

  // A fight, run by the person as the GM; then the AI GM narrates the outcome on demand.
  await seat(page, null);
  await say(
    page,
    'GM starts a fight',
    'Three cultists burst out of a cargo container, autoguns raised. Combat begins: everyone act!',
    1,
  );
  const before = await page.getByRole('article').count();
  await page.getByRole('button', { name: 'Narrate what happens next' }).click();
  await expect.poll(() => page.getByRole('article').count(), { timeout: TURN }).toBeGreaterThanOrEqual(before + 1);
  await settled(page);
  record('AI GM narrates', (await lines(page)).slice(before));

  // End the session: its summary is written and Session 2 begins.
  await page.getByRole('button', { name: 'More for this chat' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await expect(page.getByText('Session 2').first()).toBeVisible({ timeout: TURN });
  const chatId = page.url().split('/').pop() ?? '';
  const sessions = await (await page.request.get(`/api/v1/chat_session?chat_id=${chatId}`)).json();
  const first = (sessions.chat_sessions as { number: number; summary: string }[]).find((one) => one.number === 1);
  expect(first?.summary.length ?? 0, 'Session 1 has a summary').toBeGreaterThan(20);
  record('Session 1 summary', [{ speaker: 'summary', text: first?.summary ?? '' }]);

  // Session 2 goes on from the save point.
  await seat(page, 'A.Z.');
  await say(page, 'A.Z. in session 2', 'I reach out with my mind toward Massen, feeling for whatever is wrong with him.', 1);

  // Canon warnings (docs/DESIGN.md): a tech-priest who doesn't know the Omnissiah breaks
  // in-universe canon. The composer shows the notice before the line is sent.
  if (DECIDE !== '') {
    await seat(page, 'Magnus Karlsson');
    await page.getByLabel('Your next line').fill('Who is this Omnissiah everyone keeps praying to? Never heard of him.');
    // Recorded, not asserted: whether a small decision model flags the line is its judgement,
    // and the path is proven by the unit and contract tests (decide, canon).
    const notice = page.getByRole('status').filter({ hasText: /canon/i });
    const shown = await notice
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    record('Canon notice for Magnus', [
      { speaker: 'notice', text: shown ? ((await notice.textContent()) ?? '') : '(no notice shown)' },
    ]);
    await page.getByLabel('Your next line').fill('');
  }

  // Fork a new campaign from the first line of the fight.
  const fight = page.getByRole('article').filter({ hasText: 'Three cultists burst' }).first();
  await fight.getByRole('button', { name: /More for/ }).click();
  await page.getByRole('menuitem', { name: 'Fork a new campaign from here' }).click();
  await expect(page).not.toHaveURL(new RegExp(chatId), { timeout: 30_000 });
  await expect(page.getByRole('article').filter({ hasText: 'Three cultists burst' })).toBeVisible();

  writeFileSync(testInfo.outputPath('transcript.json'), JSON.stringify(transcript, null, 2));
  // Nothing the AI wrote is empty.
  for (const step of transcript) for (const line of step.lines) expect(line.text.length, step.step).toBeGreaterThan(0);
});
