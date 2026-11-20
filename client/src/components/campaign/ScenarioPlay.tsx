// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A running scenario's state at the table (A60): the clocks filled by tapping their segments up or
 * down, clues found, beats reached. Each change is handed up to be saved; what the model reads every
 * turn follows it.
 */
import { Check, Minus, Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';
import { advanceClock, learned, toggleBeat, toggleClue } from '~/features/campaign/scenario';
import type { Scenario } from '~/features/data/records';
import { cn } from '~/lib/utils';

type State = Pick<Scenario, 'clocks' | 'secrets' | 'beats'>;

export function ScenarioPlay({ scenario, onChange }: { scenario: Scenario; onChange: (next: Partial<State>) => void }): ReactElement {
  return (
    <div className='grid gap-6'>
      {scenario.premise !== '' && <p className='text-sm text-muted-foreground'>{scenario.premise}</p>}
      {scenario.clocks.length > 0 && (
        <section aria-labelledby='play-clocks' className='grid gap-3'>
          <h3 id='play-clocks' className='text-sm font-semibold'>
            Clocks
          </h3>
          <ul className='grid gap-3'>
            {scenario.clocks.map((clock, index) => (
              // Clocks have no identity beyond their place in the scenario.
              <li key={index} className='grid gap-2 rounded-lg border p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>{clock.name}</span>
                  <span className='text-sm' aria-label={`${clock.filled} of ${clock.segments} filled`}>
                    {clock.filled}/{clock.segments}
                  </span>
                </div>
                <div className='flex gap-1' aria-hidden>
                  {Array.from({ length: clock.segments }, (_segment, at) => (
                    <span key={at} className={cn('h-3 flex-1 rounded-sm border', at < clock.filled ? 'border-primary bg-primary' : 'bg-muted')} />
                  ))}
                </div>
                {clock.advances !== '' && <p className='text-xs text-muted-foreground'>Advances when {clock.advances}.</p>}
                {clock.filled >= clock.segments && clock.when_full !== '' && <p className='text-sm font-medium'>Full: {clock.when_full}</p>}
                <div className='flex gap-2'>
                  <Button type='button' variant='outline' size='icon' className='size-11' aria-label={`Take a segment off ${clock.name}`} disabled={clock.filled === 0} onClick={() => onChange({ clocks: advanceClock(scenario.clocks, index, -1) })}>
                    <Minus aria-hidden />
                  </Button>
                  <Button type='button' variant='outline' size='icon' className='size-11' aria-label={`Fill a segment of ${clock.name}`} disabled={clock.filled >= clock.segments} onClick={() => onChange({ clocks: advanceClock(scenario.clocks, index, 1) })}>
                    <Plus aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {scenario.secrets.length > 0 && (
        <section aria-labelledby='play-secrets' className='grid gap-3'>
          <h3 id='play-secrets' className='text-sm font-semibold'>
            Secrets and clues
          </h3>
          <ul className='grid gap-3'>
            {scenario.secrets.map((secret, index) => (
              // Secrets have no identity beyond their place in the scenario.
              <li key={index} className='grid gap-2 rounded-lg border p-3'>
                <p className='text-sm'>
                  {learned(secret) && <Check className='mr-1 inline size-4 text-primary' aria-label='Learned' />}
                  {secret.truth}
                </p>
                {secret.clues.map((clue, at) => (
                  <label key={at} className='flex min-h-11 items-center gap-3 text-sm'>
                    <input type='checkbox' className='size-5' checked={clue.found} onChange={() => onChange({ secrets: toggleClue(scenario.secrets, index, at) })} />
                    {clue.text}
                  </label>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {scenario.beats.length > 0 && (
        <fieldset className='grid gap-1'>
          <legend className='mb-2 text-sm font-semibold'>Beats</legend>
          {scenario.beats.map((beat, index) => (
            // Beats have no identity beyond their place in the scenario.
            <label key={index} className='flex min-h-11 items-center gap-3 text-sm'>
              <input type='checkbox' className='size-5' checked={beat.done} onChange={() => onChange({ beats: toggleBeat(scenario.beats, index) })} />
              <span className={cn(beat.done && 'text-muted-foreground line-through')}>{beat.text}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
