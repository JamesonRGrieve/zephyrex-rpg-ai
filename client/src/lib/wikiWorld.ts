// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The wiki's world entities, read for World Info (the composed suite, docs/DESIGN.md) through the
 * wiki's own REST resource, as the API contract: GET /api/v1/world_entity?campaign_id=&include_setting=true,
 * paged, the campaign's records and its setting's canon. Never the wiki's tables. Without the wiki
 * (no such route), there is no world lore.
 */
import { WORLD_LORE } from '~/contract';
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
}

export interface WikiDocument {
  id: string;
  kind: string;
  name: string;
  text: string;
}

export const NO_WORLD: WorldReader = { campaign: async () => [], byIds: async () => [], documents: async () => [] };

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
      const query = new URLSearchParams({
        campaign_id: campaignId,
        include_setting: 'true',
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
  return { campaign, byIds, documents };
}
