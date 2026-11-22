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
  asker = 'A script',
  other = false,
}: {
  prompt: string;
  /** Who asks: a script's /buttons and /input, or the GM's question about a line. */
  asker?: string;
  /** The choices for /buttons; null for /input's text box. */
  options: readonly string[] | null;
  onAnswer: (answer: string | null) => void;
  /**
   * With the choices, a box for any other answer (the operator, 2026-11-22: asked what they acted on,
   * the choices were people when they meant the hearth: "This is why we need a text entry for target").
   */
  other?: boolean;
}): ReactElement {
  const [text, setText] = useState('');
  const id = useId();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onAnswer(null))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asker} asks</DialogTitle>
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
          <div className='grid gap-3'>
            <div className='flex flex-wrap gap-2'>
              {options.map((option) => (
                <Button key={option} type='button' variant='outline' className='h-11' onClick={() => onAnswer(option)}>
                  {option}
                </Button>
              ))}
            </div>
            {other && (
              <form
                className='flex gap-2'
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim() !== '') onAnswer(text.trim());
                }}
              >
                <Input
                  aria-label='Something else'
                  placeholder='Something else (the hearth, the door…)'
                  className='h-11 min-w-0 flex-1'
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <Button type='submit' className='h-11 shrink-0' disabled={text.trim() === ''}>
                  Use this
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
