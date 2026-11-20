// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A chat's objectives (A53): tasks in order, ticked off as the story reaches them. The first not
 * done is put to the model as the character's current task.
 */
import { Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { LIMITS } from '~/contract';
import { cn } from '~/lib/utils';

export interface Objective {
  text: string;
  done: boolean;
}

export function ObjectivesEditor({ value, onChange }: { value: readonly Objective[]; onChange: (next: Objective[]) => void }): ReactElement {
  const [adding, setAdding] = useState('');
  const addId = useId();
  const current = value.findIndex((objective) => !objective.done);
  const add = () => {
    const text = adding.trim();
    if (text === '' || value.length >= LIMITS.objectives_per_chat) return;
    onChange([...value, { text, done: false }]);
    setAdding('');
  };
  return (
    <fieldset className='grid gap-2'>
      <legend className='text-sm font-medium'>Objectives</legend>
      <p className='text-xs text-muted-foreground'>The first one not done is the character’s current task.</p>
      {value.length > 0 && (
        <ol className='grid gap-2'>
          {value.map((objective, index) => (
            // Objectives have no identity beyond their place in the list.
            <li key={index} className={cn('flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm', index === current && 'border-primary')}>
              <input
                type='checkbox'
                className='size-5 shrink-0'
                aria-label={`Done: ${objective.text}`}
                checked={objective.done}
                onChange={() => onChange(value.map((one, at) => (at === index ? { ...one, done: !one.done } : one)))}
              />
              <span className={cn('min-w-0 flex-1 [overflow-wrap:anywhere]', objective.done && 'text-muted-foreground line-through')}>
                {objective.text}
                {index === current && <span className='ml-2 text-xs font-medium text-primary'>Current</span>}
              </span>
              <Button type='button' variant='ghost' size='icon' className='size-11 shrink-0' aria-label={`Remove ${objective.text}`} onClick={() => onChange(value.filter((_one, at) => at !== index))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className='flex gap-2'>
        <label htmlFor={addId} className='sr-only'>
          New objective
        </label>
        <Input
          id={addId}
          value={adding}
          maxLength={LIMITS.short_text_characters}
          placeholder='Get Sam to fix the pump'
          className='h-11'
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type='button' variant='outline' className='h-11 shrink-0' disabled={adding.trim() === ''} onClick={add}>
          <Plus aria-hidden /> Add
        </Button>
      </div>
    </fieldset>
  );
}
