// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The GM's prep sheets (A59, A61; docs/DESIGN.md folds them into a scenario as its prep), shown
 * as "prep sheets" so they never share a name with the scenarios (the framings) at /campaigns.
 * Each is edited in a sheet; read in from a file, or saved to one (with its play reset, so it can
 * be run again).
 */
import { Download, FileUp } from 'lucide-react';
import { type ChangeEvent, type ReactElement, useRef } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { ScenarioForm } from '~/components/campaign/ScenarioForm';
import { ScenarioFileError, scenarioFromJson, scenarioToJson } from '~/features/campaign/scenario';
import { campaigns, type Scenario, scenarios } from '~/features/data/records';
import { ManagedList } from './ManagedList';

function saveFile(scenario: Scenario): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(scenarioToJson(scenario), null, 2)], { type: 'application/json' }),
  );
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `${scenario.name.replace(/[^\w.-]+/g, '_') || 'scenario'}.json`,
  });
  link.click();
  URL.revokeObjectURL(url);
}

/** `openId`: a scenario whose editor opens on arrival (`/scenarios?edit=<id>`). */
export function ScenarioManager({ openId = null }: { openId?: string | null } = {}): ReactElement {
  const list = scenarios.useList();
  const campaignList = campaigns.useList();
  const { create, remove } = scenarios.useActions();
  const fileInput = useRef<HTMLInputElement>(null);
  const campaignOptions = (campaignList.data ?? []).map((campaign) => ({ id: campaign.id, name: campaign.name }));

  const readFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const results = await Promise.allSettled(
      files.map(async (file) =>
        create({ ...scenarioFromJson(JSON.parse(await file.text()) as unknown), campaign_id: null }),
      ),
    );
    const done = results.filter((result) => result.status === 'fulfilled').length;
    if (done > 0) notify(done === 1 ? 'Prep sheet read in' : `${done} prep sheets read in`);
    const refused = results.find((result) => result.status === 'rejected');
    if (refused !== undefined)
      notify(
        'Some files were not read in',
        refused.reason instanceof ScenarioFileError ? refused.reason.message : 'Each must be a prep sheet file (.json).',
      );
  };

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> Read in a prep sheet
        </Button>
        <input
          ref={fileInput}
          type='file'
          accept='.json,application/json'
          multiple
          hidden
          onChange={(event) => void readFiles(event)}
        />
      </div>
      <ManagedList
        openId={openId}
        what='prep sheet'
        rows={list.data}
        error={list.error}
        onRetry={() => list.mutate()}
        summary={(row) => row.premise || 'No premise yet'}
        newLabel='New prep sheet'
        emptyText='No prep sheets yet. Write one as moving parts: who wants what, the clocks, the secrets and their clues.'
        editor={(row, done) => (
          <div className='grid gap-4'>
            {row !== null && (
              <Button type='button' variant='outline' className='h-11 justify-self-start' onClick={() => saveFile(row)}>
                <Download aria-hidden /> Save as a file
              </Button>
            )}
            <ScenarioForm scenario={row} campaigns={campaignOptions} done={done} />
          </div>
        )}
        onDelete={(row) => void remove(row)}
      />
    </div>
  );
}
