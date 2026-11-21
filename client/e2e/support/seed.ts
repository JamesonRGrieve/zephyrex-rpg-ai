// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Realistic sample content through the API, as the person's own browser makes it (cookies, and the
 * CSRF echo on the hosted edition): a character with a greeting, and a chat with it. The audit and
 * the accessibility pass shoot pages with these in them, not only empty states.
 */
import type { Page } from '@playwright/test';

/**
 * Posts from inside the page, with the browser's own fetch: its cookies are the person's session.
 * Playwright's page.request doesn't send a Secure cookie over http, so on a hosted build at
 * 127.0.0.1 (where the browser itself accepts one) it answered 401 while the page was signed in.
 */
export async function post(
  page: Page,
  resource: string,
  fields: Record<string, unknown>,
): Promise<{ id: string }> {
  if (!page.url().startsWith('http')) await page.goto('/play');
  const answer = await page.evaluate(
    async ({ resource, fields }) => {
      const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('zx_csrf='))
        ?.slice('zx_csrf='.length);
      const response = await fetch(`/api/v1/${resource}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(token === undefined ? {} : { 'X-CSRF-Token': token }) },
        body: JSON.stringify({ [resource]: fields }),
      });
      return { status: response.status, text: await response.text() };
    },
    { resource, fields },
  );
  if (answer.status !== 201) throw new Error(`seeding ${resource} answered ${answer.status}: ${answer.text}`);
  return (JSON.parse(answer.text) as Record<string, { id: string }>)[resource] as { id: string };
}

export interface Seeded {
  characterId: string;
  chatId: string;
  lorebookId: string;
  campaignId: string;
  /** A campaign's story chat (a play state and Session 1). */
  campaignChatId: string;
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
  await post(page, 'lorebook_entry', {
    lorebook_id: lorebook.id,
    comment: 'The ship',
    constant: true,
    content: 'The Kestrel is an old ore hauler.',
  });
  const chat = await post(page, 'chat', {
    title: 'Chat with Ada Vance',
    character_ids: [character.id],
    lorebook_ids: [lorebook.id],
  });
  const greeting = await post(page, 'chat_message', {
    chat_id: chat.id,
    role: 'character',
    speaker_character_id: character.id,
    swipes: [
      '*wipes her hands on a rag* "Mind the coolant," she says. "It bites."',
      '"You’re the new deckhand? Good. Hold this."',
    ],
  });
  const line = await post(page, 'chat_message', {
    chat_id: chat.id,
    parent_id: greeting.id,
    role: 'user',
    swipes: ['I hand her the spanner.'],
  });
  await post(page, 'chat_message', {
    chat_id: chat.id,
    parent_id: line.id,
    role: 'user',
    channel: 'ooc',
    swipes: ['Can we skip ahead to docking?'],
  });
  const campaign = await post(page, 'campaign_frame', {
    name: 'The Kestrel Run',
    premise: 'An old ore hauler, a cursed cargo, and a crew with debts.',
    genre: 'space opera',
    themes: ['debt', 'found family'],
    truths: ['The cargo is older than the ship.'],
  });
  await post(page, 'scenario', {
    campaign_id: campaign.id,
    name: 'Docking at Vell',
    premise: 'The station wants the cargo inspected.',
    hook: 'A customs officer knocks on the airlock.',
  });
  // A campaign of that scenario (docs/DESIGN.md, The play model): its story, its play state (the
  // person in Ada's seat) and Session 1, so the session view is audited too.
  const story = await post(page, 'chat', {
    title: 'The Kestrel Run',
    character_ids: [character.id],
    campaign_id: campaign.id,
    seat: 'player',
    lorebook_ids: [lorebook.id],
  });
  const opening = await post(page, 'chat_message', {
    chat_id: story.id,
    role: 'narrator',
    swipes: ['The Kestrel shudders into dock at Vell. A customs officer knocks on the airlock.'],
  });
  await post(page, 'campaign_play', { chat_id: story.id, playing_id: character.id });
  await post(page, 'chat_session', { chat_id: story.id, number: 1, start_message_id: opening.id });
  return {
    characterId: character.id,
    chatId: chat.id,
    lorebookId: lorebook.id,
    campaignId: campaign.id,
    campaignChatId: story.id,
  };
}
