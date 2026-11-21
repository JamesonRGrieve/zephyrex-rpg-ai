// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * An endpoint's extra request fields (SillyTavern's "additional parameters"), typed as JSON: merged
 * into every request sent to it, e.g. `{"reasoning_effort": "none"}` to stop a model thinking. Says
 * at once why what's typed can't be kept.
 */
import { type ReactElement, useId } from 'react';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { readExtraBody } from '~/features/models/extraBody';

/** The text the field starts with for stored fields: blank for none, else pretty JSON. */
export const extraBodyText = (value: Readonly<Record<string, unknown>> | undefined): string =>
  value === undefined || Object.keys(value).length === 0 ? '' : JSON.stringify(value, null, 2);

export function ExtraBodyField({ text, onChange }: { text: string; onChange: (text: string) => void }): ReactElement {
  const id = useId();
  const read = readExtraBody(text);
  const problem = 'problem' in read ? read.problem : null;
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>Extra request fields (JSON)</Label>
      <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
        Added to every request sent to this model, for settings the app doesn’t have. For example{' '}
        <code>{'{"reasoning_effort": "none"}'}</code> stops a thinking model from thinking.
      </p>
      <Textarea
        id={id}
        rows={3}
        value={text}
        spellCheck={false}
        className='font-mono text-sm'
        placeholder='{"reasoning_effort": "none"}'
        aria-invalid={problem !== null}
        aria-describedby={`${id}-hint${problem === null ? '' : ` ${id}-problem`}`}
        onChange={(event) => onChange(event.target.value)}
      />
      {problem !== null && (
        <p id={`${id}-problem`} role='alert' className='text-sm text-destructive'>
          {problem}
        </p>
      )}
    </div>
  );
}
