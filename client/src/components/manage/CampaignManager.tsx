// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every scenario to start a campaign from (docs/DESIGN.md, The composed suite): the wiki's
 * campaigns, grouped by setting and then by game system (the operator, 2026-11-21). A tap starts a
 * campaign of it; the scenario itself (its places, people and plot) is edited in the wiki.
 */
import { Play } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { useScenarioGroups } from '~/features/data/scenarios';

export function CampaignManager(): ReactElement {
  const groups = useScenarioGroups();
  return (
    <div className='grid gap-4'>
      <p className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
        Starting with a table?
        <Button asChild variant='outline' className='h-11'>
          <Link href='/campaigns/session-zero'>Run session zero</Link>
        </Button>
        <Button asChild variant='outline' className='h-11'>
          <Link href='/w'>Open the wiki</Link>
        </Button>
      </p>
      {groups.error !== undefined ? (
        <LoadProblem what='the scenarios' error={groups.error} onRetry={() => groups.mutate()} />
      ) : groups.data === undefined ? (
        <SkeletonRows rows={3} />
      ) : groups.data.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          No scenarios yet. A scenario is a campaign in the wiki: its world, people and plot.
        </p>
      ) : (
        groups.data.map((setting) => (
          <section key={setting.setting} aria-label={setting.setting} className='grid gap-3'>
            <h2 className='text-lg font-semibold'>{setting.setting}</h2>
            {setting.systems.map((system) => (
              <section key={system.system} aria-label={`${setting.setting}, ${system.system}`} className='grid gap-2'>
                <h3 className='text-sm font-medium text-muted-foreground'>{system.system}</h3>
                <ul className='grid gap-2'>
                  {system.scenarios.map((scenario) => (
                    <li key={scenario.id}>
                      <Link
                        href={`/play?new=1&campaign=${encodeURIComponent(scenario.id)}`}
                        className='flex min-h-14 items-center gap-3 rounded-lg border p-3 hover:bg-muted'
                      >
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate font-medium'>{scenario.name}</span>
                          {scenario.description !== null && scenario.description !== '' && (
                            <span className='line-clamp-2 text-sm text-muted-foreground'>{scenario.description}</span>
                          )}
                        </span>
                        <Play aria-hidden className='size-4 shrink-0' />
                        <span className='sr-only'>Start a campaign</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
