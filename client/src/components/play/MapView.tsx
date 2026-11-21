// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The campaign's map (the operator, 2026-11-21: "Quick swap between chat and map"): the VTT's view of
 * the campaign's current scene, as the person may see it. A campaign with no scene says so.
 */
import { SceneView } from '@zephyrex/vtt-play';
import type { ReactElement } from 'react';
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { SkeletonRows } from 'zephyrex/ui/skeleton';

export function MapView({ campaignId, personHref }: { campaignId: string | null; personHref?: (id: string) => string | null }): ReactElement {
  const client = useClient();
  const scene = useSWR(campaignId === null ? null : ['rpg-ai', 'current-scene', campaignId], async () => {
    const answer = await client.post('/v1/scene/current', { current: { campaign_id: campaignId ?? '' } });
    const found = Reflect.get(Object(answer), 'scene') ?? Reflect.get(Object(answer), 'current') ?? answer;
    const id = Reflect.get(Object(found), 'id');
    return typeof id === 'string' ? id : null;
  });
  if (campaignId === null) return <p className='p-4 text-sm text-muted-foreground'>This chat has no campaign map.</p>;
  if (scene.data === undefined && scene.error === undefined) return <SkeletonRows rows={3} />;
  if (scene.error !== undefined || scene.data === null)
    return <p className='p-4 text-sm text-muted-foreground'>No map for this campaign yet. The GM sets the current scene in the VTT.</p>;
  return (
    <div className='mx-auto w-full max-w-5xl flex-1 px-3 pb-4'>
      <SceneView sceneId={scene.data ?? ''} personHref={personHref} />
    </div>
  );
}
