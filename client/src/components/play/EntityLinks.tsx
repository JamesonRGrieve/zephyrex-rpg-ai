// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Names in the story are links (the operator, 2026-11-23: "Names of characters, places and items should be
 * links to wiki pages that open in the drawer"): every name of a person, place or item of the campaign,
 * whole words, the longest first, opens its wiki page in the app wrapper's bottom drawer.
 */
import type { Viewer } from '@zephyrex-rpg/wiki/features/viewer';
import { RecordPage } from '@zephyrex-rpg/wiki/pages/RecordPage';
import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from 'react';
import { useDrawer } from './CanonNotice';

export interface LinkedEntity {
  id: string;
  name: string;
  /** The wiki's record kind: person, location, item. */
  kind: string;
}

const Entities = createContext<{ campaignId: string; entities: readonly LinkedEntity[]; viewer: Viewer } | null>(null);

export function EntityLinksProvider({
  campaignId,
  entities,
  viewer,
  children,
}: {
  campaignId: string | null;
  entities: readonly LinkedEntity[];
  /** Who reads the pages: the GM seat sees the GM's file; a player's character only what a player may
   * (the operator, 2026-11-24: "As a non-GM, only player visible information and learned facts"). */
  viewer: Viewer;
  children: ReactNode;
}): ReactElement {
  const value = useMemo(
    () =>
      campaignId === null ? null : { campaignId, viewer, entities: entities.filter((one) => one.name.trim().length >= 3) },
    [campaignId, entities, viewer],
  );
  return <Entities.Provider value={value}>{children}</Entities.Provider>;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text with every known name a link into the drawer; plain text outside a campaign. */
export function Linked({ text }: { text: string }): ReactElement {
  const known = useContext(Entities);
  const drawer = useDrawer();
  const pattern = useMemo(() => {
    if (known === null || known.entities.length === 0) return null;
    const names = [...known.entities].sort((a, b) => b.name.length - a.name.length).map((one) => escaped(one.name));
    return new RegExp(`(?<![\\p{L}\\p{N}])(${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  }, [known]);
  if (known === null || pattern === null || drawer === null) return <>{text}</>;
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const entity = known.entities.find((one) => one.name === match[0]);
    if (entity === undefined || match.index === undefined) continue;
    if (match.index > at) pieces.push(text.slice(at, match.index));
    pieces.push(
      <button
        key={`${match.index}-${entity.id}`}
        type='button'
        className='underline decoration-dotted underline-offset-2 hover:text-primary'
        onClick={() => drawer.open(<RecordPage world={known.campaignId} kind={entity.kind} id={entity.id} viewer={known.viewer} />, entity.name)}
      >
        {match[0]}
      </button>,
    );
    at = match.index + match[0].length;
  }
  if (at < text.length) pieces.push(text.slice(at));
  return <>{pieces}</>;
}
