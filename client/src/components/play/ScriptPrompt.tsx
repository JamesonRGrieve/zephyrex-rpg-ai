// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A script asking the person (A37, STscript's /input and /buttons): a question with a text box, or
 * with buttons to choose from. Closing it answers nothing, and the script goes on with an empty pipe.
 */
import { type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from 'zephyrex/ui/dialog';
import { Input } from 'zephyrex/ui/input';

export function ScriptPrompt({
  prompt,
  options,
  onAnswer,
}: {
  prompt: string;
  /** The choices for /buttons; null for /input's text box. */
  options: readonly string[] | null;
  onAnswer: (answer: string | null) => void;
}): ReactElement {
  const [text, setText] = useState('');
  const id = useId();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onAnswer(null))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>A script asks</DialogTitle>
          <DialogDescription id={`${id}-prompt`}>{prompt === '' ? 'Your answer:' : prompt}</DialogDescription>
        </DialogHeader>
        {options === null ? (
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              onAnswer(text);
            }}
          >
            <Input
              aria-describedby={`${id}-prompt`}
              aria-label='Your answer'
              className='h-11'
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <DialogFooter>
              <Button type='submit' className='h-11'>
                Answer
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className='flex flex-wrap gap-2'>
            {options.map((option) => (
              <Button key={option} type='button' variant='outline' className='h-11' onClick={() => onAnswer(option)}>
                {option}
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
