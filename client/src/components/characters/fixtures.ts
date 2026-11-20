// SPDX-License-Identifier: AGPL-3.0-or-later
/** Sample characters for stories and tests. */
import type { CharacterDraft } from './CharacterForm';

export const ADA_DRAFT: CharacterDraft = {
  name: 'Ada Vance',
  avatar: null,
  description: '{{char}} is the ship’s engineer: dry, kind, and never far from the reactor.',
  personality: 'dry, kind, stubborn',
  scenario: '{{user}} has just come aboard the Kestrel.',
  first_message: '“Mind the coolant,” Ada says without looking up.',
  alternate_greetings: ['“You’re the new deckhand? Good. Hold this.”'],
  example_messages: '<START>\n{{char}}: Everything broke. Twice.',
  system_prompt: '',
  post_history_instructions: '',
  creator_notes: 'Works best with a slow-burn story.',
  creator: 'Sam',
  character_version: '1.0',
  tags: ['sci-fi', 'engineer'],
};
