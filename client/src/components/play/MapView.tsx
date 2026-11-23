// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The campaign's map (the operator, 2026-11-21: "Quick swap between chat and map"): the VTT's view of
 * the campaign's current scene, as the person may see it. A campaign with no scene says so.
 */
import { SceneCanvas, SceneList, useSceneView, type ViewToken } from '@zephyrex/vtt-play';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useClient } from 'zephyrex';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { Button } from 'zephyrex/ui/button';

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
      <PlayScene sceneId={scene.data ?? ''} campaignId={campaignId} gm={gm} />
    </div>
  );
}

/**
 * The scene as the play screen shows it: the map alone, touched and dragged directly (the operator,
 * 2026-11-22, of the token list's arrow buttons: "What the fuck are those arrow keys? Just click or tap to
 * interact"). The VTT's own pages keep their token list.
 */
function PlayScene({ sceneId, campaignId, gm }: { sceneId: string; campaignId: string; gm: boolean }): ReactElement {
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
      {gm && (
        <MoveToScene
          tokens={data.view.tokens}
          sceneId={sceneId}
          campaignId={campaignId}
          onMoved={(name) => {
            setAnnouncement(`${name} moved to another scene`);
            scene.retry();
          }}
        />
      )}
    </section>
  );
}

/**
 * The GM moves someone to another scene (the operator, 2026-11-23: "The DM needs the ability to … move
 * them in a scene and between scenes"): the VTT takes the token off this scene and onto the target at its
 * entry (POST /v1/scene_token/{id}/move_scene), and where the story says they are follows.
 */
function MoveToScene({
  tokens,
  sceneId,
  campaignId,
  onMoved,
}: {
  tokens: readonly ViewToken[];
  sceneId: string;
  campaignId: string;
  onMoved: (name: string) => void;
}): ReactElement | null {
  const client = useClient();
  const { mutate } = useSWRConfig();
  const ids = { who: useId(), where: useId() };
  const scenes = useSWR(['rpg-ai', 'campaign-scenes', campaignId], async () => {
    const answer = await client.get('/v1/scene', { campaign_id: campaignId });
    const rows = Reflect.get(Object(answer), 'scenes');
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const id = Reflect.get(Object(row), 'id');
      const name = Reflect.get(Object(row), 'name');
      return typeof id === 'string' && id !== sceneId
        ? [{ id, name: typeof name === 'string' ? name : 'Untitled scene' }]
        : [];
    });
  });
  const [who, setWho] = useState('');
  const [where, setWhere] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const others = scenes.data ?? [];
  if (tokens.length === 0 || others.length === 0) return null;
  const move = async () => {
    const token = tokens.find((one) => one.id === who);
    if (token === undefined || where === '') return;
    try {
      await client.post(`/v1/scene_token/${token.id}/move_scene`, { move_scene: { scene_id: where } });
      setProblem(null);
      setWho('');
      onMoved(token.name ?? 'Token');
      // Who is here follows the tokens: the Context panel and the cast read them again.
      void mutate((key) => JSON.stringify(key ?? '').match(/scene|token|person|world_entity/) !== null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'They could not be moved.');
    }
  };
  return (
    <form
      aria-label='Move to another scene'
      className='flex flex-wrap items-end gap-2 rounded-lg border px-3 py-2'
      onSubmit={(event) => {
        event.preventDefault();
        void move();
      }}
    >
      <div className='grid gap-1'>
        <label htmlFor={ids.who} className='text-xs font-medium'>
          Move
        </label>
        <select
          id={ids.who}
          className='h-11 rounded-md border bg-background px-2 text-sm'
          value={who}
          onChange={(event) => setWho(event.target.value)}
        >
          <option value=''>Someone here</option>
          {tokens.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name ?? 'Token'}
            </option>
          ))}
        </select>
      </div>
      <div className='grid gap-1'>
        <label htmlFor={ids.where} className='text-xs font-medium'>
          To
        </label>
        <select
          id={ids.where}
          className='h-11 rounded-md border bg-background px-2 text-sm'
          value={where}
          onChange={(event) => setWhere(event.target.value)}
        >
          <option value=''>A scene</option>
          {others.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
      </div>
      <Button type='submit' variant='outline' className='h-11' disabled={who === '' || where === ''}>
        Move
      </Button>
      {problem !== null && (
        <p role='alert' className='w-full text-sm text-destructive'>
          {problem}
        </p>
      )}
    </form>
  );
}
