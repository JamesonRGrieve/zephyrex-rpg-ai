// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The wiki's world entities, read for World Info (the composed suite, docs/DESIGN.md) through the
 * wiki's own REST resource, as the API contract: GET /api/v1/world_entity?campaign_id=&include_setting=true,
 * paged, the campaign's records and its setting's canon. Never the wiki's tables. Without the wiki
 * (no such route), there is no world lore.
 */
import { WORLD_LORE } from '~/contract';
import type { CampaignFraming } from '~/features/prompt/campaignFraming';
import type { CastEntity } from '~/features/prompt/worldCast';

/**
 * The wiki's world entities: a campaign's (with its setting's canon), and specific ones by id (a
 * sandbox's persons from other campaigns; GET /api/v1/world_entity?ids=, wiki world_entities_by_id).
 * None that can't be read.
 */
export interface WorldReader {
  campaign: (campaignId: string) => Promise<CastEntity[]>;
  byIds: (ids: readonly string[]) => Promise<CastEntity[]>;
  /** A campaign's documents for the data bank (mapping item 4; GET /api/v1/campaign_document). */
  documents: (campaignId: string) => Promise<WikiDocument[]>;
  /** The campaign's clock advanced (GM only; POST /api/v1/campaign/{id}/clock), or null when refused. */
  advanceClock: (campaignId: string, minutes: number, reason: string) => Promise<WikiClock | null>;
  /** A person moved (GM only; POST /api/v1/person_move); false when refused. */
  movePerson: (personId: string, locationId: string, reason: string) => Promise<boolean>;
  /** The turn's lore passages from the wiki's hybrid search (POST /api/v1/campaign/{id}/lore_search); [] without. */
  loreSearch: (campaignId: string, text: string) => Promise<{ name?: string; text?: string }[]>;
  /** The records a text names, campaign and setting canon, through the wiki's key index; [] without. */
  matching: (campaignId: string, text: string) => Promise<CastEntity[]>;
  /** A campaign's own framing (GET /api/v1/campaign/{id}/framing); null without one. */
  framing: (campaignId: string) => Promise<CampaignFraming | null>;
  /** Someone the narrator voiced, made a GM-only npc (POST /api/v1/campaign/{id}/person); null when refused. */
  ensurePerson: (
    campaignId: string,
    name: string,
    summary: string,
  ) => Promise<{ id: string; name: string; created: boolean } | null>;
  /** A character card imported as the person's own wiki person (POST /api/v1/campaign/card_person); null when refused. */
  cardPerson: (card: Record<string, unknown>) => Promise<{ person_id: string; campaign_id: string } | null>;
}

/** The wiki's campaign clock: minutes from day 1, 00:00, as its day and "HH:MM". */
export interface WikiClock {
  minutes: number;
  day: number;
  time: string;
}

export interface WikiDocument {
  id: string;
  kind: string;
  name: string;
  text: string;
}

export const NO_WORLD: WorldReader = {
  campaign: async () => [],
  byIds: async () => [],
  documents: async () => [],
  loreSearch: async () => [],
  matching: async () => [],
  framing: async () => null,
  advanceClock: async () => null,
  movePerson: async () => false,
  ensurePerson: async () => null,
  cardPerson: async () => null,
};

/** A reader that asks this app's own wiki resource, with the request's cookies (the caller's access). */
export function wikiReader(request: Request): WorldReader {
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie');
  const ask = async (query: URLSearchParams): Promise<{ rows: CastEntity[]; next: string | null } | null> => {
    const answer = await fetch(`${origin}/api/v1/world_entity?${query.toString()}`, {
      headers: cookie === null ? {} : { cookie },
      signal: request.signal,
    }).catch(() => null);
    if (answer === null || !answer.ok) return null;
    const body: unknown = await answer.json().catch(() => null);
    const rows: unknown = Reflect.get(Object(body), 'world_entities');
    if (!Array.isArray(rows)) return null;
    const next: unknown = Reflect.get(Object(body), 'next');
    return { rows: rows as CastEntity[], next: typeof next === 'string' && next !== '' ? next : null };
  };
  const campaign = async (campaignId: string) => {
    const found: CastEntity[] = [];
    let after: string | null = null;
    for (let page = 0; page < WORLD_LORE.max_pages; page += 1) {
      // The campaign's own records only: a setting's canon comes by relevance (matching), never in bulk.
      const query = new URLSearchParams({
        campaign_id: campaignId,
        include_setting: 'false',
        limit: String(WORLD_LORE.page_limit),
        ...(after === null ? {} : { after }),
      });
      const page = await ask(query);
      if (page === null) return found;
      found.push(...page.rows);
      if (page.next === null) return found;
      after = page.next;
    }
    return found;
  };
  const byIds = async (ids: readonly string[]) =>
    ids.length === 0 ? [] : ((await ask(new URLSearchParams({ ids: ids.join(',') })))?.rows ?? []);
  const documents = async (campaignId: string): Promise<WikiDocument[]> => {
    const answer = await fetch(
      `${origin}/api/v1/campaign_document?${new URLSearchParams({ campaign_id: campaignId }).toString()}`,
      { headers: cookie === null ? {} : { cookie }, signal: request.signal },
    ).catch(() => null);
    if (answer === null || !answer.ok) return [];
    const rows: unknown = Reflect.get(Object(await answer.json().catch(() => null)), 'campaign_documents');
    return Array.isArray(rows) ? (rows as WikiDocument[]) : [];
  };
  const matching = async (campaignId: string, text: string): Promise<CastEntity[]> => {
    const rows: unknown = Reflect.get(
      Object(
        await post(`/api/v1/campaign/${encodeURIComponent(campaignId)}/matching`, {
          matching: { text, limit: WORLD_LORE.matching_limit },
        }),
      ),
      'world_entities',
    );
    return Array.isArray(rows) ? (rows as CastEntity[]) : [];
  };
  const loreSearch = async (campaignId: string, text: string): Promise<{ name?: string; text?: string }[]> => {
    if (text.trim() === '') return [];
    const rows: unknown = Reflect.get(
      Object(
        await post(`/api/v1/campaign/${encodeURIComponent(campaignId)}/lore_search`, {
          lore_search: { text, k: WORLD_LORE.search_k, token_budget: WORLD_LORE.search_tokens },
        }),
      ),
      'passages',
    );
    return Array.isArray(rows) ? (rows as { name?: string; text?: string }[]) : [];
  };
  const framing = async (campaignId: string): Promise<CampaignFraming | null> => {
    const answer = await fetch(`${origin}/api/v1/campaign/${encodeURIComponent(campaignId)}/framing`, {
      headers: cookie === null ? {} : { cookie },
      signal: request.signal,
    }).catch(() => null);
    if (answer === null || !answer.ok) return null;
    const found: unknown = Reflect.get(Object(await answer.json().catch(() => null)), 'campaign_framing');
    return found !== null && typeof found === 'object' ? (found as CampaignFraming) : null;
  };
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const answer = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie === null ? {} : { cookie }) },
      body: JSON.stringify(body),
      signal: request.signal,
    }).catch(() => null);
    return answer === null || !answer.ok ? null : answer.json().catch(() => null);
  };
  const advanceClock = async (campaignId: string, minutes: number, reason: string): Promise<WikiClock | null> => {
    const clock: unknown = Reflect.get(
      Object(await post(`/api/v1/campaign/${encodeURIComponent(campaignId)}/clock`, { clock: { minutes, reason } })),
      'clock',
    );
    const day: unknown = Reflect.get(Object(clock), 'day');
    const time: unknown = Reflect.get(Object(clock), 'time');
    const total: unknown = Reflect.get(Object(clock), 'minutes');
    return typeof day === 'number' && typeof time === 'string' && typeof total === 'number'
      ? { minutes: total, day, time }
      : null;
  };
  const movePerson = async (personId: string, locationId: string, reason: string): Promise<boolean> =>
    (await post('/api/v1/person_move', {
      person_move: { person_id: personId, to_location_id: locationId, reason },
    })) !== null;
  const ensurePerson = async (
    campaignId: string,
    name: string,
    summary: string,
  ): Promise<{ id: string; name: string; created: boolean } | null> => {
    const person: unknown = Reflect.get(
      Object(await post(`/api/v1/campaign/${encodeURIComponent(campaignId)}/person`, { person: { name, summary } })),
      'person',
    );
    const id: unknown = Reflect.get(Object(person), 'id');
    if (typeof id !== 'string') return null;
    const named: unknown = Reflect.get(Object(person), 'name');
    return { id, name: typeof named === 'string' ? named : name, created: Reflect.get(Object(person), 'created') === true };
  };
  const cardPerson = async (card: Record<string, unknown>): Promise<{ person_id: string; campaign_id: string } | null> => {
    const made: unknown = await post('/api/v1/campaign/card_person', { card });
    const personId: unknown = Reflect.get(Object(made), 'person_id');
    const campaignId: unknown = Reflect.get(Object(made), 'campaign_id');
    return typeof personId === 'string' && typeof campaignId === 'string'
      ? { person_id: personId, campaign_id: campaignId }
      : null;
  };
  return { campaign, byIds, documents, loreSearch, matching, framing, advanceClock, movePerson, ensurePerson, cardPerson };
}
