// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * "Sync from wiki" (A15): a lorebook linked to a wiki campaign pulls the world's changes since its
 * last pull: an entry per entity added, changed ones rewritten, deleted ones removed, the person's
 * own entries never touched (ai_lorebook's `POST /v1/lorebook/sync`). Shown only when the world is
 * loaded beside this app and the book is linked; a chat also pulls before each reply on its own.
 */
import { RefreshCw } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { useClient, writeProblem } from 'zephyrex';
import { notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { z } from 'zod';
import { useCapabilities } from '~/features/capabilities';
import type { Lorebook } from '~/features/data/records';

const syncSchema = z.object({ created: z.number(), updated: z.number(), removed: z.number() });
export type SyncResult = z.infer<typeof syncSchema>;

/** What one pull changed, as a person reads it. */
export function syncSummary({ created, updated, removed }: SyncResult): string {
  const parts = [
    created > 0 && `${created} added`,
    updated > 0 && `${updated} updated`,
    removed > 0 && `${removed} removed`,
  ].filter((part): part is string => part !== false);
  return parts.length === 0 ? 'Already up to date' : parts.join(', ');
}

/** When the book last pulled, as a person reads it. */
export function syncedLabel(syncedAt: string | null, now: Date = new Date()): string {
  if (syncedAt === null) return 'Not pulled from the wiki yet';
  const minutes = Math.round((now.getTime() - new Date(syncedAt).getTime()) / 60_000);
  if (minutes < 1) return 'Pulled from the wiki just now';
  if (minutes < 60) return `Pulled from the wiki ${minutes} min ago`;
  return `Pulled from the wiki ${new Date(syncedAt).toLocaleString()}`;
}

export function WikiSyncControl({
  syncedAt,
  onSync,
}: {
  syncedAt: string | null;
  onSync: () => Promise<string | null>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Button
        type='button'
        variant='outline'
        className='h-11'
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onSync().then((failed) => {
            setProblem(failed);
            setBusy(false);
          });
        }}
      >
        <RefreshCw aria-hidden className={busy ? 'motion-safe:animate-spin' : undefined} />
        {busy ? 'Syncing…' : 'Sync from wiki'}
      </Button>
      <span className='text-sm text-muted-foreground'>{syncedLabel(syncedAt)}</span>
      {problem !== null && (
        <p role='alert' className='basis-full text-sm text-destructive'>
          {problem}
        </p>
      )}
    </div>
  );
}

/** The control, bound to a book; nothing when the world isn't loaded or the book isn't linked. */
export function WikiSync({ book, onSynced }: { book: Lorebook; onSynced: () => void }): ReactElement | null {
  const { world } = useCapabilities();
  const client = useClient();
  if (!world || book.wiki_campaign_id === null) return null;
  return (
    <WikiSyncControl
      syncedAt={book.wiki_synced_at}
      onSync={async () => {
        let summary = '';
        const failed = await writeProblem(
          client.post('/v1/lorebook/sync', { sync: { lorebook_id: book.id } }).then((answer) => {
            summary = syncSummary(syncSchema.parse(answer));
          }),
          'Not synced',
        );
        if (failed === null) {
          notify('Synced from the wiki', summary);
          onSynced();
        }
        return failed;
      }}
    />
  );
}
