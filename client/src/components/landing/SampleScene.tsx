// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactElement } from 'react';

/** An illustrative exchange, so visitors see the story and the table talk apart. Not a real chat. */
const LINES = [
  { who: 'Ada', kind: 'story', text: '“Mind the coolant,” Ada says, not looking up from the reactor housing.' },
  { who: 'You', kind: 'story', text: 'I hand her the spanner and ask what broke.' },
  { who: 'Sam (table talk)', kind: 'table', text: 'Can we skip ahead to the docking scene?' },
  { who: 'Ada', kind: 'story', text: '“Everything,” she sighs. “Twice.”' },
] as const;

export function SampleScene(): ReactElement {
  return (
    <figure className='rounded-2xl border bg-card p-5 shadow-sm'>
      <figcaption className='text-xs tracking-wide text-muted-foreground uppercase'>Example chat</figcaption>
      <ol className='mt-4 space-y-3'>
        {LINES.map((line) => (
          <li
            key={line.text}
            className={line.kind === 'table' ? 'ml-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground' : 'rounded-lg border px-3 py-2'}
          >
            <span className='block text-xs font-semibold'>{line.who}</span>
            {line.text}
          </li>
        ))}
      </ol>
    </figure>
  );
}
