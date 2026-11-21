// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The wiki's world entities, read for World Info (the composed suite, docs/DESIGN.md) through the
 * wiki's own REST resource, as the API contract: GET /api/v1/world_entity?campaign_id=&include_setting=true,
 * paged, the campaign's records and its setting's canon. Never the wiki's tables. Without the wiki
 * (no such route), there is no world lore.
 */
import { WORLD_LORE } from '~/contract';
import type { WorldEntity } from '~/features/lore/worldLore';

/** A campaign's world entities, or none. */
export type WorldReader = (campaignId: string) => Promise<WorldEntity[]>;

export const NO_WORLD: WorldReader = async () => [];

/** A reader that asks this app's own wiki resource, with the request's cookies (the caller's access). */
export function wikiReader(request: Request): WorldReader {
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie');
  return async (campaignId) => {
    const found: WorldEntity[] = [];
    let after: string | null = null;
    for (let page = 0; page < WORLD_LORE.max_pages; page += 1) {
      const query = new URLSearchParams({
        campaign_id: campaignId,
        include_setting: 'true',
        limit: String(WORLD_LORE.page_limit),
        ...(after === null ? {} : { after }),
      });
      const answer = await fetch(`${origin}/api/v1/world_entity?${query.toString()}`, {
        headers: cookie === null ? {} : { cookie },
        signal: request.signal,
      }).catch(() => null);
      if (answer === null || !answer.ok) return found;
      const body: unknown = await answer.json().catch(() => null);
      const rows: unknown = Reflect.get(Object(body), 'world_entities');
      if (!Array.isArray(rows)) return found;
      found.push(...(rows as WorldEntity[]));
      const next: unknown = Reflect.get(Object(body), 'next');
      if (typeof next !== 'string' || next === '') return found;
      after = next;
    }
    return found;
  };
}
