// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The table's notes (A11): house rules, pacing, tone and reminders the GM and every character read
 * each turn. Lines and veils have their own place (Table safety).
 */
import { Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { LIMITS, TABLE } from '~/contract';

export type NoteKind = (typeof TABLE.note_kinds)[number];

export interface TableNoteValue {
  kind: NoteKind;
  text: string;
}

const LABELS: Record<NoteKind, string> = TABLE.note_labels;

export function TableNotesEditor({ value, onChange }: { value: readonly TableNoteValue[]; onChange: (next: TableNoteValue[]) => void }): ReactElement {
  const [kind, setKind] = useState<NoteKind>('house_rule');
  const [text, setText] = useState('');
  const ids = { kind: useId(), text: useId() };
  const add = () => {
    if (text.trim() === '' || value.length >= LIMITS.table_notes) return;
    onChange([...value, { kind, text: text.trim() }]);
    setText('');
  };
  return (
    <fieldset className='grid gap-2'>
      <legend className='text-sm font-medium'>Table notes</legend>
      <p className='text-xs text-muted-foreground'>House rules, pacing, tone and reminders, read every turn.</p>
      {value.length > 0 && (
        <ul className='grid gap-2'>
          {value.map((note, index) => (
            // Notes have no identity beyond their place in the list.
            <li key={index} className='flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm'>
              <span className='shrink-0 text-xs font-medium text-muted-foreground'>{LABELS[note.kind]}</span>
              <span className='min-w-0 flex-1 [overflow-wrap:anywhere]'>{note.text}</span>
              <Button type='button' variant='ghost' size='icon' className='size-11 shrink-0' aria-label={`Remove ${LABELS[note.kind]}: ${note.text}`} onClick={() => onChange(value.filter((_note, at) => at !== index))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className='flex flex-wrap gap-2'>
        <label htmlFor={ids.kind} className='sr-only'>
          Kind of note
        </label>
        <select id={ids.kind} value={kind} className='h-11 rounded-md border bg-background px-3 text-sm' onChange={(event) => setKind(event.target.value as NoteKind)}>
          {TABLE.note_kinds.map((one) => (
            <option key={one} value={one}>
              {LABELS[one]}
            </option>
          ))}
        </select>
        <label htmlFor={ids.text} className='sr-only'>
          New table note
        </label>
        <Input
          id={ids.text}
          value={text}
          maxLength={LIMITS.short_text_characters}
          placeholder='Critical hits explode'
          className='h-11 min-w-40 flex-1'
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type='button' variant='outline' className='h-11' disabled={text.trim() === ''} onClick={add}>
          <Plus aria-hidden /> Add
        </Button>
      </div>
    </fieldset>
  );
}
