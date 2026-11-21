// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Who can be in a chat (the composed suite, docs/DESIGN.md): the wiki's persons. The play screens
 * key a chat's cast by id, so a wiki person shows as a cast member in the shape they already read.
 * A person of kind `pc` carries the party tag. rpg-ai's own character cards still list beside them
 * until the stores are removed (docs/DESIGN.md, The composed suite, order of work); a person wins
 * when both carry the same id.
 *
 * The prompt never reads this shape: a reply's character comes from the wiki's world entities
 * (features/prompt/personVoice.ts).
 */
import { type Person, people } from '@zephyrex-rpg/wiki/features/data/records';
import { useMemo } from 'react';
import type { SWRResponse } from 'swr';
import { type Character, characters } from './records';

/** The tag that marks a player character: the default party. */
export const PARTY_TAG = 'PC';

/** A wiki person as a cast member: name, summary and the party tag; the card fields stay empty. */
export function personAsCast(person: Pick<Person, 'id' | 'name' | 'description' | 'kind' | 'created_at' | 'updated_at'>): Character {
  return {
    id: person.id,
    created_at: person.created_at,
    updated_at: person.updated_at,
    name: person.name,
    description: person.description ?? '',
    personality: '',
    scenario: '',
    first_message: '',
    alternate_greetings: [],
    example_messages: '',
    system_prompt: '',
    post_history_instructions: '',
    creator_notes: '',
    creator: '',
    character_version: '',
    tags: person.kind === 'pc' ? [PARTY_TAG] : [],
    avatar: null,
    favourite: false,
    folder: '',
    extensions: {},
    lorebook_id: null,
  };
}

/** The persons, then the cards no person shadows. */
export function mergeCast(persons: readonly Character[], cards: readonly Character[]): Character[] {
  const ids = new Set(persons.map((person) => person.id));
  return [...persons, ...cards.filter((card) => !ids.has(card.id))];
}

/**
 * The cast to pick from and to show: the wiki's persons (of one campaign when `campaignId` is
 * given) and the remaining cards. Loading until both lists have answered.
 */
export function useCast(campaignId?: string | null): Pick<SWRResponse<Character[], Error>, 'data' | 'error' | 'isLoading'> {
  const personList = people.useList(campaignId === undefined || campaignId === null ? undefined : { campaign_id: campaignId });
  const cardList = characters.useList();
  const data = useMemo(
    () =>
      personList.data === undefined && cardList.data === undefined
        ? undefined
        : mergeCast((personList.data ?? []).filter((person) => !person.is_template).map(personAsCast), cardList.data ?? []),
    [personList.data, cardList.data],
  );
  return { data, error: personList.error ?? cardList.error, isLoading: personList.isLoading || cardList.isLoading };
}
