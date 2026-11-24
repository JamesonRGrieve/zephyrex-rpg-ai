// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A scenario's starting level, for its GM (the operator, 2026-11-24: "add a starting-level slider to the
 * scenarios, and build the pregens up to level 4 for now"; "as high as the builder supports"). The range is
 * the VTT's (POST /v1/builder/levels: the pack's maximum); the level is the campaign's starting_level, and
 * the pregens are built up to it (POST /v1/builder/pregens) when it changes. Shown only when the VTT answers
 * with a range above 1: a campaign with no pack, or a reader who isn't its GM, sees nothing.
 */
import { LoaderCircle } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { Slider } from 'zephyrex/ui/slider';

export interface Levels {
  maxLevel: number;
  startingLevel: number;
}

/** The VTT's answer, read; null when it isn't one. */
export function readLevels(answer: unknown): Levels | null {
  const max = Reflect.get(Object(answer), 'max_level');
  const at = Reflect.get(Object(answer), 'starting_level');
  if (typeof max !== 'number' || max < 1) return null;
  return { maxLevel: max, startingLevel: typeof at === 'number' && at >= 1 ? Math.min(at, max) : 1 };
}

/** The slider itself: the level to start at, 1 to the pack's maximum. */
export function StartingLevelField({
  levels,
  saving,
  report,
  onCommit,
}: {
  levels: Levels;
  saving: boolean;
  /** What the last build said (open choices, people it couldn't build); null before one. */
  report: string | null;
  onCommit: (level: number) => void;
}): ReactElement {
  const [level, setLevel] = useState(levels.startingLevel);
  useEffect(() => setLevel(levels.startingLevel), [levels.startingLevel]);
  return (
    <section aria-labelledby='starting-level' className='grid gap-2 rounded-lg border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 id='starting-level' className='text-sm font-medium'>
          Starting level
        </h3>
        <span className='flex items-center gap-1.5 text-sm tabular-nums'>
          {saving && <LoaderCircle aria-hidden className='size-3.5 animate-spin motion-reduce:animate-none' />}
          {level} of {levels.maxLevel}
        </span>
      </div>
      <Slider
        min={1}
        max={levels.maxLevel}
        step={1}
        value={[level]}
        disabled={saving}
        aria-label='Starting level'
        onValueChange={([next]) => next !== undefined && setLevel(next)}
        onValueCommit={([next]) => next !== undefined && next !== levels.startingLevel && onCommit(next)}
      />
      <p className='text-xs text-muted-foreground'>The pregens are built up to this level.</p>
      {report !== null && <p className='text-xs whitespace-pre-wrap'>{report}</p>}
    </section>
  );
}

/** One person's line of the build's report: what is still the player's to choose, or why it wasn't built. */
function reported(answer: unknown): string | null {
  const people = Reflect.get(Object(answer), 'results');
  const skipped = Reflect.get(Object(answer), 'skipped');
  if (!Array.isArray(people)) return null;
  const notBuilt = (Array.isArray(skipped) ? skipped : []).flatMap((one) => {
    const name = Reflect.get(Object(one), 'name');
    const reason = Reflect.get(Object(one), 'reason');
    return typeof name === 'string' ? [`${name}: not built (${typeof reason === 'string' ? reason : 'no reason given'})`] : [];
  });
  const lines = people.flatMap((one) => {
    const name = Reflect.get(Object(one), 'name');
    const gaps = Reflect.get(Object(one), 'gaps');
    if (typeof name !== 'string' || !Array.isArray(gaps) || gaps.length === 0) return [];
    const what = gaps.map((gap) => String(Reflect.get(Object(gap), 'what') ?? '')).filter((word) => word !== '');
    return [`${name}: open ${what.join(', ')}`];
  });
  const all = [...lines, ...notBuilt];
  return all.length === 0 ? 'Every pregen is built to this level.' : all.join('\n');
}

/** The scenario's slider, read from and written to the VTT. */
export function StartingLevel({ campaignId }: { campaignId: string }): ReactElement | null {
  const client = useClient();
  const levels = useSWR(['rpg-ai', 'starting-levels', campaignId], async () =>
    readLevels(await client.post('/v1/builder/levels', { levels: { campaign_id: campaignId } })),
  );
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  if (levels.data === undefined || levels.data === null || levels.data.maxLevel <= 1) return null;
  const commit = async (level: number) => {
    setSaving(true);
    try {
      const answer = await client.post('/v1/builder/pregens', { pregens: { campaign_id: campaignId, level } });
      setReport(reported(answer));
      await levels.mutate();
    } catch (error) {
      setReport(`The pregens were not built: ${error instanceof Error ? error.message : 'no answer'}`);
    } finally {
      setSaving(false);
    }
  };
  return <StartingLevelField levels={levels.data} saving={saving} report={report} onCommit={(level) => void commit(level)} />;
}
