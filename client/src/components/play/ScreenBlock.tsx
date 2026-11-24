// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** The narrator's markup as shown (features/chat/markup.ts): a screen block, and the palette's colours. */
import type { ReactElement } from 'react';
import { type Colour, colourSpans } from '~/features/chat/markup';
import { Linked } from './EntityLinks';

/** A device's display (a cogitator, a data-slate, an auspex), set as a screen. */
export function ScreenBlock({ title, text }: { title: string; text: string }): ReactElement {
  return (
    <figure className='my-2 overflow-hidden rounded-md border border-emerald-500/50 bg-zinc-950 text-emerald-300 shadow-inner'>
      <figcaption className='border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs uppercase tracking-widest'>
        {title}
      </figcaption>
      <pre className='whitespace-pre-wrap px-3 py-2 font-mono text-sm [overflow-wrap:anywhere] [text-shadow:0_0_6px_rgb(16_185_129/0.5)]'>
        <Coloured text={text} />
      </pre>
    </figure>
  );
}

const COLOURS: Record<Colour, string> = {
  red: 'font-semibold text-red-500',
  amber: 'font-semibold text-amber-500',
  green: 'font-semibold text-emerald-500',
  blue: 'font-semibold text-sky-500',
  gold: 'font-semibold text-yellow-500',
  grey: 'text-muted-foreground',
};

/** Text with the narrator's palette colours (features/chat/markup.ts). */
export function Coloured({ text }: { text: string }): ReactElement {
  return (
    <>
      {colourSpans(text).map((span, index) =>
        // Spans have no identity beyond their place in the text.
        span.colour === null ? (
          <span key={index}>
            <Linked text={span.text} />
          </span>
        ) : (
          <span key={index} className={COLOURS[span.colour]}>
            <Linked text={span.text} />
          </span>
        ),
      )}
    </>
  );
}
