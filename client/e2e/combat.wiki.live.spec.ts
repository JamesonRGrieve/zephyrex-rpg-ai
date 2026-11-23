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
  const campaign = await post(page, 'campaign', { name: 'Ambush at the Ford (e2e)', game_system_id: systemId });
  const brann = await post(page, 'person', { name: 'Brann', kind: 'pc', campaign_id: campaign.id });
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
  const holt = await post(page, 'person', { name: 'Holt', kind: 'npc', campaign_id: campaign.id });
  await api(page, 'POST', 'builder/npc-sheet', { npc: { person_id: holt.id, role: 'guard' } });

  const chat = await post(page, 'chat', {
    title: 'Ambush at the Ford',
    mode: 'group',
    character_ids: [brann.id, holt.id],
    campaign_id: campaign.id,
    seat: 'player',
    // As every campaign start sets it: the decision model runs the table.
    group_settings: { order: 'decide' },
  });
  await post(page, 'campaign_play', { chat_id: chat.id, playing_id: brann.id });
  await post(page, 'chat_message', {
    chat_id: chat.id,
    parent_id: null,
    role: 'narrator',
    channel: 'ic',
    swipes: ['At the ford, a guard in a stained tabard levels his spear at Brann.'],
  });

  const encounter = await post(page, 'encounter', { campaign_id: campaign.id, name: 'Ambush' });
  for (const person of [brann, holt]) await post(page, 'combatant', { encounter_id: encounter.id, person_id: person.id });
  await api(page, 'POST', `encounter/${encounter.id}/initiative`, { roll: { reroll: false } });
  const started = await api<{ encounter: { status: string } }>(page, 'POST', `encounter/${encounter.id}/start`, {
    control: {},
  });
  expect(started.encounter.status).toBe('running');

  await page.goto(`/play/${chat.id}`);
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
