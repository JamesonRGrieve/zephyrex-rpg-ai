// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { cardWithBook } from './characterCard';
import { cardFromJson } from './stCard';
import { lorebookFromJson } from './stLorebook';

const FIELDS = {
  name: 'Ada',
  description: 'An engineer.',
  personality: '',
  scenario: '',
  first_message: 'Hello.',
  alternate_greetings: [],
  example_messages: '',
  system_prompt: '',
  post_history_instructions: '',
  creator_notes: '',
  creator: '',
  character_version: '',
  tags: ['crew'],
  extensions: {},
};

describe('cardWithBook', () => {
  it('is the V2 card alone when the character has no lorebook, and reads no entries', async () => {
    const entriesOf = vi.fn(async () => []);
    const card = await cardWithBook(FIELDS, undefined, entriesOf);
    expect(cardFromJson(card)).toMatchObject({ name: 'Ada', tags: ['crew'] });
    expect(Reflect.get(Object(card.data), 'character_book')).toBeUndefined();
    expect(entriesOf).not.toHaveBeenCalled();
  });

  it('carries the character’s lorebook inside, as SillyTavern reads it back', async () => {
    const card = await cardWithBook(FIELDS, { name: 'Kestrel', description: 'The ship.' }, async () => []);
    expect(lorebookFromJson(card, 'Ada').name).toBe('Kestrel');
  });
});
