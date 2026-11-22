// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A line the AI wrote again carries a small icon (the operator, 2026-11-22: "It should show a small icon
 * beside the final output that will open the original response and reasoning for regeneration in the
 * drawer"): the first answer, with its reasoning, and why it was rewritten.
 */
import { History } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { splitReasoning } from '~/features/prompt/assemble';
import { useDrawer } from './CanonNotice';

export interface Revision {
  original: string;
  reason: string;
  kind: 'canon' | 'voice' | 'meta';
}

const KIND_LABEL: Record<Revision['kind'], string> = {
  canon: 'It broke canon',
  voice: 'It spoke for your character',
  meta: 'It stepped out of the story',
};

export function RevisionDetails({ revision }: { revision: Revision }): ReactElement {
  const { reasoning, reply } = splitReasoning(revision.original);
  return (
    <div className='grid gap-4 text-sm'>
      <p>
        <span className='font-medium'>{KIND_LABEL[revision.kind]}. </span>
        {revision.reason}
      </p>
      <section className='grid gap-1'>
        <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>The first answer</h3>
        <p className='whitespace-pre-wrap rounded-md border bg-muted/40 p-3'>{reply}</p>
      </section>
      {reasoning !== '' && (
        <section className='grid gap-1'>
          <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Its reasoning</h3>
          <p className='whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-muted-foreground'>{reasoning}</p>
        </section>
      )}
    </div>
  );
}

export function RevisionButton({ revision }: { revision: Revision }): ReactElement {
  const drawer = useDrawer();
  const [inPlace, setInPlace] = useState(false);
  return (
    <>
      <button
        type='button'
        className='inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground'
        aria-label='Written again: show the first answer'
        title='Written again: show the first answer'
        onClick={() =>
          drawer === null
            ? setInPlace((now) => !now)
            : drawer.open(<RevisionDetails revision={revision} />, 'Written again', KIND_LABEL[revision.kind])
        }
      >
        <History aria-hidden className='size-4' />
      </button>
      {drawer === null && inPlace && <RevisionDetails revision={revision} />}
    </>
  );
}
