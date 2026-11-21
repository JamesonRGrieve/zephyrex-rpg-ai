// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A character from a wiki person (the composed suite, docs/DESIGN.md): a reply speaks as the person.
 * Their summary (the plain text of their entry) is the card's description; their voice (wiki S4c)
 * gives the rest: personality, with how they speak after it; the first message; and each example as
 * SillyTavern's example block (`<START>` before it); and whether they remember across chats (AP8,
 * mapping item 5: `voice.across_chats`, kept where the memory flag is read). Pure, and held to contract/person-voice-cases.json,
 * which the SaaS server's PersonVoice.py runs too.
 */
import { MEMORY } from '~/contract';
import type { PromptCharacter } from './assemble';

export interface WikiPerson {
  id: string;
  name: string;
  summary?: string;
  voice?: {
    personality?: string;
    speech?: string;
    first_message?: string;
    examples?: readonly string[];
    across_chats?: boolean;
  } | null;
}

export interface PersonCharacter extends PromptCharacter {
  first_message: string;
}

export function personCharacter(person: WikiPerson): PersonCharacter {
  const voice = person.voice ?? {};
  const personality = (voice.personality ?? '').trim();
  const speech = (voice.speech ?? '').trim();
  return {
    id: person.id,
    name: person.name,
    description: (person.summary ?? '').trim(),
    personality: [personality, speech === '' ? '' : `Speech: ${speech}`].filter((part) => part !== '').join('\n'),
    scenario: '',
    example_messages: (voice.examples ?? [])
      .map((example) => example.trim())
      .filter((example) => example !== '')
      .map((example) => `<START>\n${example}`)
      .join('\n'),
    system_prompt: '',
    post_history_instructions: '',
    first_message: (voice.first_message ?? '').trim(),
    extensions: voice.across_chats === true ? { [MEMORY.extension]: { across_chats: true } } : {},
  };
}
