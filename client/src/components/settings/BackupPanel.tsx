// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Backups (A56): everything as one file, and everything back from one. A restore adds the records
 * beside what is here (it never deletes), each with a new id and its references pointed at the new
 * ids; model keys are not in a backup, so restored models ask for theirs again.
 */
import { DatabaseBackup, FileUp } from 'lucide-react';
import { type ChangeEvent, type ReactElement, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { useClient } from 'zephyrex';
import { notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { z } from 'zod';
import { WriteProblem } from '~/components/common/WriteProblem';
import { jsonBody } from '~/features/data/records';
import { BACKUP_RESOURCES, type BackupRecord, BackupFileError, makeBackup, parentsFirst, readBackup, restoredFields } from '~/features/backup/backup';

const record = z.looseObject({ id: z.string() });

export function BackupPanel(): ReactElement {
  const client = useClient();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState<'saving' | 'restoring' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const download = async () => {
    setBusy('saving');
    setProblem(null);
    try {
      const lists = await Promise.all(BACKUP_RESOURCES.map(async (spec) => [spec.resource, (await client.list(`/v1/${spec.resource}`, spec.plural, record)) as BackupRecord[]] as const));
      const url = URL.createObjectURL(new Blob([JSON.stringify(makeBackup(Object.fromEntries(lists)), null, 2)], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `rpg-ai-backup-${new Date().toISOString().slice(0, 10)}.json` });
      link.click();
      URL.revokeObjectURL(url);
      notify('Backup saved');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The backup could not be made');
    }
    setBusy(null);
  };

  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setBusy('restoring');
    setProblem(null);
    try {
      const backup = readBackup(JSON.parse(await file.text()) as unknown);
      const ids = new Map<string, Map<string, string>>();
      let written = 0;
      /** One record written, its new id noted for the records that point at it. */
      const writeOne = async (spec: (typeof BACKUP_RESOURCES)[number], old: BackupRecord): Promise<void> => {
        const answer = await client.post(`/v1/${spec.resource}`, jsonBody({ [spec.resource]: restoredFields(spec, old, ids) }));
        ids.get(spec.resource)?.set(old.id, record.parse(Reflect.get(Object(answer), spec.resource)).id);
        written += 1;
      };
      // One resource, and within it one record, at a time (a chain, not a batch): each may point at
      // a record written before it.
      await BACKUP_RESOURCES.reduce<Promise<void>>(async (before, spec) => {
        await before;
        ids.set(spec.resource, new Map());
        const records = backup.records[spec.resource] ?? [];
        const ordered = spec.resource === 'chat_message' ? parentsFirst(records) : records;
        await ordered.reduce<Promise<void>>(async (previous, old) => {
          await previous;
          await writeOne(spec, old);
        }, Promise.resolve());
      }, Promise.resolve());
      await mutate(() => true);
      notify('Backup restored', `${written} records added.`);
    } catch (error) {
      setProblem(error instanceof BackupFileError ? error.message : error instanceof Error ? `Restoring stopped: ${error.message}` : 'The backup could not be restored');
    }
    setBusy(null);
  };

  return (
    <section aria-labelledby='backup-heading' className='grid gap-3'>
      <h2 id='backup-heading' className='text-lg font-semibold'>
        Backups
      </h2>
      <p className='text-sm text-muted-foreground'>
        Everything as one file: characters, lorebooks, chats, campaigns and the rest. Restoring adds it beside what is here. Model keys are not saved.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' className='h-11' disabled={busy !== null} onClick={() => void download()}>
          <DatabaseBackup aria-hidden /> {busy === 'saving' ? 'Saving…' : 'Save a backup'}
        </Button>
        <Button type='button' variant='outline' className='h-11' disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> {busy === 'restoring' ? 'Restoring…' : 'Restore a backup'}
        </Button>
        <input ref={fileInput} type='file' accept='.json,application/json' hidden onChange={(event) => void restore(event)} />
      </div>
      <WriteProblem problem={problem} />
    </section>
  );
}
