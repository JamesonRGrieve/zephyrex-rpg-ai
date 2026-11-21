// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every scenario to start a campaign from (docs/DESIGN.md, The composed suite): the wiki's
 * campaigns, grouped by setting and then by game system (the operator, 2026-11-21), each with its
 * play-style tags (freeform, combat-heavy, mystery, …) to filter by. A tap starts a campaign of it;
 * the scenario itself (its places, people, plot and tags) is edited in the wiki.
 */
import { Play } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { chats } from '~/features/data/records';
import { groupScenarios, taggedWith, useScenarios } from '~/features/data/scenarios';

export function CampaignManager(): ReactElement {
  const read = useScenarios();
  // The campaigns played from each scenario (the operator, 2026-11-21: one page, each scenario's
  // campaigns under it). A campaign is a chat whose campaign is a playthrough of the scenario.
  const chatList = chats.useList();
  const played = new Map<string, { id: string; title: string; updated: string }[]>();
  for (const chat of chatList.data ?? []) {
    if (chat.campaign_id === null || chat.campaign_id === undefined) continue;
    const scenario = read.data?.scenarioOf.get(chat.campaign_id) ?? chat.campaign_id;
    played.set(scenario, [
      ...(played.get(scenario) ?? []),
      { id: chat.id, title: chat.title, updated: chat.updated_at ?? chat.created_at },
    ]);
  }
  const [wanted, setWanted] = useState<string[]>([]);
  const groups = {
    error: read.error,
    mutate: read.mutate,
    data:
      read.data === undefined
        ? undefined
        : groupScenarios(taggedWith(read.data.scenarios, wanted), read.data.settings, read.data.systems),
  };
  const styles = read.data?.styles ?? [];
  const toggle = (tag: string) =>
    setWanted(wanted.includes(tag) ? wanted.filter((one) => one !== tag) : [...wanted, tag]);
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
      {styles.length > 0 && (
        <div role='group' aria-label='Play style' className='flex flex-wrap gap-2'>
          {styles.map((tag) => (
            <ChoiceChip key={tag} checked={wanted.includes(tag)} onClick={() => toggle(tag)}>
              {tag}
            </ChoiceChip>
          ))}
        </div>
      )}
      {groups.error !== undefined ? (
        <LoadProblem what='the scenarios' error={groups.error} onRetry={() => groups.mutate()} />
      ) : groups.data === undefined ? (
        <SkeletonRows rows={3} />
      ) : groups.data.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {wanted.length > 0
            ? 'No scenario has all of those play styles.'
            : 'No scenarios yet. A scenario is a campaign in the wiki: its world, people and plot.'}
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
                    <li key={scenario.id} className='grid gap-1 rounded-lg border'>
                      <Link
                        href={`/play?new=1&campaign=${encodeURIComponent(scenario.id)}`}
                        className='flex min-h-14 items-center gap-3 rounded-lg p-3 hover:bg-muted'
                      >
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate font-medium'>{scenario.name}</span>
                          {scenario.description !== null && scenario.description !== '' && (
                            <span className='line-clamp-2 text-sm text-muted-foreground'>{scenario.description}</span>
                          )}
                          {(scenario.tags ?? []).length > 0 && (
                            <span className='mt-1 flex flex-wrap gap-1'>
                              {(scenario.tags ?? []).map((tag) => (
                                <span key={tag} className='rounded-full border px-2 text-xs text-muted-foreground'>
                                  {tag}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <Play aria-hidden className='size-4 shrink-0' />
                        <span className='sr-only'>Start a campaign</span>
                      </Link>
                      {(played.get(scenario.id) ?? []).length > 0 && (
                        <ul aria-label={`Campaigns of ${scenario.name}`} className='grid gap-1 px-3 pb-3'>
                          {[...(played.get(scenario.id) ?? [])]
                            .sort((a, b) => b.updated.localeCompare(a.updated))
                            .map((campaign) => (
                              <li key={campaign.id}>
                                <Link
                                  href={`/play/${campaign.id}`}
                                  className='flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 text-sm hover:bg-muted'
                                >
                                  <span className='min-w-0 truncate'>{campaign.title}</span>
                                  <span className='shrink-0 text-xs text-muted-foreground'>
                                    {new Date(campaign.updated).toLocaleDateString()}
                                  </span>
                                </Link>
                              </li>
                            ))}
                        </ul>
                      )}
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
