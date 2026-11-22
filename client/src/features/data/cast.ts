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
import useSWR, { type SWRResponse } from 'swr';
import { useClient } from 'zephyrex';
import { z } from 'zod';
import { type Character, characters } from './records';

/** The tag that marks a player character: the default party. */
export const PARTY_TAG = 'PC';

/** A wiki person as a cast member: name, summary and the party tag; the card fields stay empty. */
export function personAsCast(
  person: Pick<Person, 'id' | 'name' | 'description' | 'kind' | 'created_at' | 'updated_at'>,
): Character {
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

/** The most ids one world_entity read takes (the wiki's limits.world_entity_ids). */
const IDS_PER_READ = 100;

const pictureRows = z.object({
  world_entities: z.array(
    z.object({ id: z.string(), name: z.string().nullish(), picture: z.string().nullish(), summary: z.string().nullish() }),
  ),
});

/** What the wiki says of a person, for the pickers: their picture and a one-line description. */
export interface PersonLook {
  picture: string | null;
  line: string;
}

const NO_PICTURES: ReadonlyMap<string, PersonLook> = new Map();

/** The summary's first sentence, without the name it may start with ("Ilsa Marrow The Mystic. …"). */
export function oneLine(name: string, summary: string | null | undefined): string {
  // Markdown and a leading section heading ("# Description", "Description ") are not the line.
  let text = (summary ?? '')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`]/g, '')
    .trim()
    .replace(/^(description|summary|overview|about)\s*:?\s+/i, '');
  if (name !== '' && text.toLowerCase().startsWith(name.toLowerCase())) text = text.slice(name.length).trim();
  const end = text.search(/[.!?](\s|$)/);
  const first = end < 0 ? text : text.slice(0, end + 1);
  return first.length > 140 ? `${first.slice(0, 139).trimEnd()}…` : first;
}

/** Each person's picture (the wiki's world_entity read by ids), as the app's own /api path. */
function usePictures(ids: readonly string[]): ReadonlyMap<string, PersonLook> {
  const client = useClient();
  const key = ids.length === 0 ? null : ['rpg-ai', 'cast-pictures', ...[...ids].sort()];
  const { data } = useSWR(key, async () => {
    const found = new Map<string, PersonLook>();
    for (let start = 0; start < ids.length; start += IDS_PER_READ) {
      const chunk = ids.slice(start, start + IDS_PER_READ);
      const body = pictureRows.parse(await client.get('/v1/world_entity', { ids: chunk.join(',') }));
      for (const row of body.world_entities)
        found.set(row.id, {
          picture: row.picture ? (row.picture.startsWith('/') ? `/api${row.picture}` : row.picture) : null,
          line: oneLine(row.name ?? '', row.summary),
        });
    }
    return found;
  });
  return data ?? NO_PICTURES;
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
export function useCast(
  campaignId?: string | null,
  /**
   * Whether the old character cards join the wiki's persons. Never for a campaign's start (the
   * operator, 2026-11-21: 40k cards were offered on a D&D scenario): only that campaign's people.
   */
  { cards = true }: { cards?: boolean } = {},
): Pick<SWRResponse<Character[], Error>, 'data' | 'error' | 'isLoading'> {
  const personList = people.useList(
    campaignId === undefined || campaignId === null ? undefined : { campaign_id: campaignId },
  );
  const cardList = characters.useList();
  const cardData = cards ? cardList.data : [];
  const persons = useMemo(() => (personList.data ?? []).filter((person) => !person.is_template), [personList.data]);
  const pictures = usePictures(persons.map((person) => person.id));
  const data = useMemo(
    () =>
      personList.data === undefined && cardData === undefined
        ? undefined
        : mergeCast(
            persons.map((person) => {
              const look = pictures.get(person.id);
              // The picker's line under the name: the wiki's one-line description.
              return { ...personAsCast(person), avatar: look?.picture ?? null, folder: look?.line ?? '' };
            }),
            cardData ?? [],
          ),
    [personList.data, cardData, persons, pictures],
  );
  return {
    data,
    error: personList.error ?? (cards ? cardList.error : undefined),
    isLoading: personList.isLoading || (cards && cardList.isLoading),
  };
}
