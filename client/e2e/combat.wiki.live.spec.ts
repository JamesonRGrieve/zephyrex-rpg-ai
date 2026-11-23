// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A fight in the VTT's initiative order (the operator, 2026-11-23: "fully test… combat"; combat decisions by
 * the decision model): an srd-5e campaign with a fighter of the person's and a Guard the VTT builds from
 * its stat block, an encounter started, and the person's line; the Guard's turn is then taken by
 * combat_turn (the decision model among the VTT's options; the stub answers with the first, an attack),
 * resolved by the VTT, and shown as a roll line. Runs with the stub's decisions on (STUB_DECIDE=1).
 */
import { expect, test } from '@playwright/test';
import { isHosted, signIn } from './support/people';
import { api, post } from './support/seed';

const LIVE = process.env.LIVE_MODEL_URL ?? '';
const STORY = process.env.LIVE_STORY_MODEL ?? '';
const TURN = 240_000;

test.skip(LIVE === '' || process.env.STUB_DECIDE !== '1', 'The stub model with its decisions on (STUB_DECIDE=1)');

test('a fight: the AI-run Guard takes its turn in the VTT order, its attack resolved by the VTT', async ({
  page,
}, testInfo) => {
  test.skip(!isHosted(testInfo), 'The composed suite: hosted only');
  test.setTimeout(10 * 60_000);
  await signIn(page);
  await post(page, 'model_endpoint', {
    name: 'Story',
    base_url: LIVE,
    model: STORY,
    api: 'chat',
    roles: ['story', 'gm'],
    is_default: true,
  });
  await post(page, 'model_endpoint', { name: 'Decide', base_url: LIVE, model: STORY, api: 'chat', roles: ['decide'] });

  const systems = await api<{ game_systems: { id: string; slug: string }[] }>(page, 'GET', 'game_system?slug=srd-5e');
  const system = systems.game_systems.find((one) => one.slug === 'srd-5e');
  expect(system, 'the srd-5e game system is seeded').toBeDefined();
  const systemId = system?.id ?? '';
  // A scenario, started as people start one: its people and sheets are copied into the playthrough.
  const scenario = await post(page, 'campaign', {
    name: 'Ambush at the Ford (e2e)',
    is_scenario: true,
    game_system_id: systemId,
    description: 'At the ford, a guard in a stained tabard levels his spear at Brann.',
  });
  const brann = await post(page, 'person', { name: 'Brann', kind: 'pc', campaign_id: scenario.id });
  for (const [slug, value] of [
    ['strength', 16],
    ['dexterity', 14],
    ['hit-points', 12],
    ['proficiency-bonus', 2],
    ['longsword', null],
  ] as const) {
    const found = await api<{ traits: { id: string }[] }>(page, 'GET', `trait?slug=${slug}&game_system_id=${systemId}`);
    const trait = found.traits[0]?.id ?? '';
    expect(trait, `the ${slug} trait`).not.toBe('');
    await post(page, 'person_trait', { person_id: brann.id, trait_id: trait, ...(value === null ? {} : { value }) });
  }
  const holt = await post(page, 'person', { name: 'Holt', kind: 'npc', campaign_id: scenario.id });
  await api(page, 'POST', 'builder/npc-sheet', { npc: { person_id: holt.id, role: 'guard' } });

  await page.goto('/campaigns');
  await page.getByRole('button', { name: /^Start a campaign of Ambush at the Ford \(e2e\)/ }).click();
  await page.getByRole('button', { name: 'Start the campaign' }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/, { timeout: 60_000 });
  const chatId = page.url().split('/').pop() ?? '';
  // Brann's seat.
  await page.getByRole('button', { name: /^Your seat:/ }).click();
  await page.getByLabel('Find a character').fill('Brann');
  await page.getByRole('list', { name: 'Seats' }).getByRole('button', { name: /Brann/ }).first().click();
  await expect(page.getByRole('button', { name: 'Your seat: Brann' })).toBeVisible({ timeout: 30_000 });

  // The fight, in the playthrough: its own Brann and Holt.
  const playthrough = (await api<{ chat: { campaign_id: string } }>(page, 'GET', `chat/${chatId}`)).chat.campaign_id;
  const people = await api<{ persons: { id: string; name: string }[] }>(
    page,
    'GET',
    `person?campaign_id=${playthrough}&limit=50`,
  );
  const fighters = ['Brann', 'Holt'].map((name) => people.persons.find((one) => one.name === name)?.id ?? '');
  expect(fighters).not.toContain('');
  const encounter = await post(page, 'encounter', { campaign_id: playthrough, name: 'Ambush' });
  for (const person of fighters) await post(page, 'combatant', { encounter_id: encounter.id, person_id: person });
  await api(page, 'POST', `encounter/${encounter.id}/initiative`, { roll: { reroll: false } });
  const started = await api<{ encounter: { status: string } }>(page, 'POST', `encounter/${encounter.id}/start`, {
    control: {},
  });
  expect(started.encounter.status).toBe('running');

  await page.reload();
  // The campaign's state is read before the line goes (the seat shows once it is).
  await expect(page.getByRole('button', { name: 'Your seat: Brann' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Say', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Do', exact: true }).click();
  await page.getByLabel('What is done').last().fill('I raise my longsword and step toward the guard.');
  await page.getByRole('button', { name: /^Send/ }).click();
  // A question from the GM (which one is meant), if one comes, is answered with its first choice.
  const asked = page.getByRole('dialog');
  if (await asked.isVisible({ timeout: 15_000 }).catch(() => false)) await asked.getByRole('button').first().click();

  // The Guard's turn: the VTT's own result, as a roll line.
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: /Holt attacks Brann \(rolled \d+\): (hit|miss)/ })
      .first(),
  ).toBeVisible({
    timeout: TURN,
  });
  const order = await api<{ encounter: { round: number; status: string } }>(page, 'GET', `encounter/${encounter.id}/order`);
  expect(order.encounter.status).toBe('running');
});
