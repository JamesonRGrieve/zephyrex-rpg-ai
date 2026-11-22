// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The campaign's map (the operator, 2026-11-21: "Quick swap between chat and map"): the VTT's view of
 * the campaign's current scene, as the person may see it. A campaign with no scene says so.
 */
import { SceneCanvas, SceneList, useSceneView, type ViewToken } from '@zephyrex/vtt-play';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { useState } from 'react';
import type { ReactElement } from 'react';
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { SkeletonRows } from 'zephyrex/ui/skeleton';

export function MapView({
  campaignId,
  gm = false,
}: {
  campaignId: string | null;
  personHref?: (id: string) => string | null;
  /**
   * The GM's seat: the campaign's scenes, to make one current (the operator, 2026-11-22: "Is full map
   * functionality with GM and player control in as well?"). Placing, fog and measuring follow from the VTT.
   */
  gm?: boolean;
}): ReactElement {
  const client = useClient();
  // The GM's Make current (in the VTT's scene list) shows here within seconds.
  const scene = useSWR(
    campaignId === null ? null : ['rpg-ai', 'current-scene', campaignId],
    async () => {
      const answer = await client.post('/v1/scene/current', { current: { campaign_id: campaignId ?? '' } });
      const found = Reflect.get(Object(answer), 'scene') ?? Reflect.get(Object(answer), 'current') ?? answer;
      const id = Reflect.get(Object(found), 'id');
      return typeof id === 'string' ? id : null;
    },
    gm ? { refreshInterval: 5000 } : undefined,
  );
  if (campaignId === null) return <p className='p-4 text-sm text-muted-foreground'>This chat has no campaign map.</p>;
  if (scene.data === undefined && scene.error === undefined) return <SkeletonRows rows={3} />;
  const scenes = gm ? (
    <details className='rounded-lg border px-3 py-2'>
      <summary className='cursor-pointer text-sm font-medium'>Scenes</summary>
      <div className='pt-2'>
        <SceneList campaignId={campaignId} />
      </div>
    </details>
  ) : null;
  if (scene.error !== undefined || scene.data === null)
    return (
      <div className='mx-auto grid w-full max-w-5xl gap-3 px-3 pb-4'>
        <p className='pt-4 text-sm text-muted-foreground'>
          {gm ? 'No scene is current. Make one current below.' : 'No map yet: the GM hasn’t set a scene.'}
        </p>
        {scenes}
      </div>
    );
  return (
    <div className='mx-auto grid w-full max-w-5xl flex-1 gap-3 px-3 pb-4'>
      {scenes}
      <PlayScene sceneId={scene.data ?? ''} />
    </div>
  );
}

/**
 * The scene as the play screen shows it: the map alone, touched and dragged directly (the operator,
 * 2026-11-22, of the token list's arrow buttons: "What the fuck are those arrow keys? Just click or tap to
 * interact"). The VTT's own pages keep their token list.
 */
function PlayScene({ sceneId }: { sceneId: string }): ReactElement {
  const scene = useSceneView(sceneId);
  const [announcement, setAnnouncement] = useState('');
  const { data } = scene;
  if (data.state === 'loading') return <SkeletonRows rows={4} />;
  if (data.state === 'failed') return <LoadProblem what='the map' error={data.error} onRetry={scene.retry} />;
  const move = (one: ViewToken, x: number, y: number): void => {
    void scene.move(one, x, y);
    setAnnouncement(`${one.name ?? 'Token'} moved`);
  };
  return (
    <section aria-label={data.view.name ?? 'Map'} className='grid gap-2'>
      <SceneCanvas view={data.view} onMove={move} />
      {scene.problem !== null && (
        <p role='alert' className='text-sm text-destructive'>
          {scene.problem}
        </p>
      )}
      <p aria-live='polite' className='sr-only'>
        {announcement}
      </p>
    </section>
  );
}
