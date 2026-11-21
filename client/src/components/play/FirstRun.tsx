// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The first run's empty chat list says what to do next, in order: a model to answer, a character
 * to talk to, then a chat (UX and UI: a first-run state that says what to do next). Each step is
 * marked done from what the person already has, so a returning person sees only what's left.
 */
import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';
import { cn } from '~/lib/utils';

export interface FirstRunProps {
  hasModel: boolean;
  hasCharacter: boolean;
  onNewChat: () => void;
}

export function FirstRun({ hasModel, hasCharacter, onNewChat }: FirstRunProps): ReactElement {
  const steps = [
    {
      done: hasModel,
      title: 'Add a model',
      hint: 'Any OpenAI-compatible endpoint, local or hosted, answers for your characters.',
      action: (
        <Button asChild variant={hasModel ? 'outline' : 'default'} className='h-11'>
          <Link href='/models'>Models</Link>
        </Button>
      ),
    },
    {
      done: hasCharacter,
      title: 'Make or import a character',
      hint: 'Write one, or bring SillyTavern cards (PNG or JSON).',
      action: (
        <Button asChild variant={hasModel && !hasCharacter ? 'default' : 'outline'} className='h-11'>
          <Link href='/characters'>Characters</Link>
        </Button>
      ),
    },
    {
      done: false,
      title: 'Start a chat',
      hint: 'Pick one character, or several for a group.',
      action: (
        <Button
          type='button'
          variant={hasModel && hasCharacter ? 'default' : 'outline'}
          className='h-11'
          disabled={!hasCharacter}
          onClick={onNewChat}
        >
          New chat
        </Button>
      ),
    },
  ];
  return (
    <section aria-labelledby='first-run-title' className='grid gap-4 rounded-xl border border-dashed p-6'>
      <h2 id='first-run-title' className='text-lg font-semibold'>
        No chats yet. Three steps to the first one:
      </h2>
      <ol className='grid gap-4'>
        {steps.map((step, index) => (
          <li key={step.title} className='flex flex-wrap items-center gap-3'>
            <span
              aria-hidden
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm',
                step.done && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {step.done ? <Check className='size-4' /> : index + 1}
            </span>
            <div className='min-w-0 flex-1 basis-48'>
              <p className='font-medium'>
                {step.title}
                {step.done && <span className='sr-only'> (done)</span>}
              </p>
              <p className='text-sm text-muted-foreground'>{step.hint}</p>
            </div>
            {step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
