// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Realistic sample content through the API, as the person's own browser makes it (cookies, and the
 * CSRF echo on the hosted edition): a character with a greeting, and a chat with it. The audit and
 * the accessibility pass shoot pages with these in them, not only empty states.
 */
import type { Page } from '@playwright/test';

async function csrf(page: Page): Promise<Record<string, string>> {
  const cookie = (await page.context().cookies()).find((one) => one.name === 'zx_csrf');
  return cookie === undefined ? {} : { 'X-CSRF-Token': cookie.value };
}

async function post(page: Page, resource: string, fields: Record<string, unknown>): Promise<{ id: string }> {
  const response = await page.request.post(`/api/v1/${resource}`, {
    data: { [resource]: fields },
    headers: { 'Content-Type': 'application/json', ...(await csrf(page)) },
  });
  if (response.status() !== 201) throw new Error(`seeding ${resource} answered ${response.status()}: ${await response.text()}`);
  return ((await response.json()) as Record<string, { id: string }>)[resource] as { id: string };
}

export interface Seeded {
  characterId: string;
  chatId: string;
  lorebookId: string;
}

export async function seedChat(page: Page): Promise<Seeded> {
  const character = await post(page, 'character', {
    name: 'Ada Vance',
    description: '{{char}} is the ship’s engineer: dry, kind, and never far from the reactor.',
    personality: 'dry, kind, stubborn',
    scenario: '{{user}} has just come aboard the Kestrel.',
    first_message: '*wipes her hands on a rag* "Mind the coolant," she says. "It bites."',
    alternate_greetings: ['"You’re the new deckhand? Good. Hold this."'],
    tags: ['sci-fi', 'engineer'],
  });
  const lorebook = await post(page, 'lorebook', { name: 'The Kestrel', description: 'The ship and its crew' });
  await post(page, 'lorebook_entry', {
    lorebook_id: lorebook.id,
    comment: 'Cursed spanners',
    keys: ['spanner', 'wrench'],
    content: 'Every spanner aboard the Kestrel is cursed: it slips at the worst moment.',
    sticky: 2,
  });
  await post(page, 'lorebook_entry', { lorebook_id: lorebook.id, comment: 'The ship', constant: true, content: 'The Kestrel is an old ore hauler.' });
  const chat = await post(page, 'chat', { title: 'Chat with Ada Vance', character_ids: [character.id], lorebook_ids: [lorebook.id] });
  const greeting = await post(page, 'chat_message', {
    chat_id: chat.id,
    role: 'character',
    speaker_character_id: character.id,
    swipes: ['*wipes her hands on a rag* "Mind the coolant," she says. "It bites."', '"You’re the new deckhand? Good. Hold this."'],
  });
  const line = await post(page, 'chat_message', { chat_id: chat.id, parent_id: greeting.id, role: 'user', swipes: ['I hand her the spanner.'] });
  await post(page, 'chat_message', { chat_id: chat.id, parent_id: line.id, role: 'user', channel: 'ooc', swipes: ['Can we skip ahead to docking?'] });
  return { characterId: character.id, chatId: chat.id, lorebookId: lorebook.id };
}
