// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A person's own instruct templates (A17): the markup a text API's model was trained on, when no
 * built-in one fits. A model endpoint then picks one in place of a built-in template.
 */
import { type ReactElement, useId, useState } from 'react';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { INSTRUCT_CUSTOM, LIMITS } from '~/contract';
import { type InstructTemplateRecord, instructTemplates, refreshedByRecords } from '~/features/data/records';
import { ManagedList } from './ManagedList';

const MARKUP_FIELDS = [
  ['start', 'Before everything'],
  ['system_prefix', 'Before a system message'],
  ['system_suffix', 'After a system message'],
  ['user_prefix', 'Before your message'],
  ['user_suffix', 'After your message'],
  ['assistant_prefix', 'Before a reply'],
  ['assistant_suffix', 'After a reply'],
] as const;

type MarkupField = (typeof MARKUP_FIELDS)[number][0];
export type InstructTemplateFields = Pick<InstructTemplateRecord, 'name' | MarkupField | 'stop'>;

/** Stop strings typed one per line: empty lines dropped. */
export function stopLines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

export function InstructTemplateFormView({
  template,
  onSave,
  done,
}: {
  template: InstructTemplateRecord | null;
  onSave: (fields: InstructTemplateFields) => Promise<boolean>;
  done: () => void;
}): ReactElement {
  const [name, setName] = useState(template?.name ?? '');
  const [markup, setMarkup] = useState<Record<MarkupField, string>>(() => ({
    start: template?.start ?? '',
    system_prefix: template?.system_prefix ?? '',
    system_suffix: template?.system_suffix ?? '',
    user_prefix: template?.user_prefix ?? '',
    user_suffix: template?.user_suffix ?? '',
    assistant_prefix: template?.assistant_prefix ?? '',
    assistant_suffix: template?.assistant_suffix ?? '',
  }));
  const [stop, setStop] = useState((template?.stop ?? []).join('\n'));
  const ids = { name: useId(), stop: useId(), field: useId() };

  return (
    <form
      className='grid gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ name: name.trim(), ...markup, stop: stopLines(stop) }).then((saved) => {
          if (saved) done();
        });
      }}
    >
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          required
          value={name}
          maxLength={LIMITS.name_characters}
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <p className='text-xs text-muted-foreground'>
        The prompt is each message between its role’s before and after, ending on “Before a reply” for the model to write.
      </p>
      {MARKUP_FIELDS.map(([field, label]) => (
        <div key={field} className='grid gap-1.5'>
          <Label htmlFor={`${ids.field}-${field}`}>{label}</Label>
          <Textarea
            id={`${ids.field}-${field}`}
            rows={1}
            value={markup[field]}
            maxLength={INSTRUCT_CUSTOM.field_characters}
            className='font-mono text-sm'
            onChange={(event) => setMarkup({ ...markup, [field]: event.target.value })}
          />
        </div>
      ))}
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.stop}>Stop strings</Label>
        <p id={`${ids.stop}-hint`} className='text-xs text-muted-foreground'>
          One per line, at most {INSTRUCT_CUSTOM.stops}: where the model’s reply ends.
        </p>
        <Textarea
          id={ids.stop}
          rows={2}
          value={stop}
          aria-describedby={`${ids.stop}-hint`}
          className='font-mono text-sm'
          onChange={(event) => setStop(event.target.value)}
        />
      </div>
      <Button type='submit' className='h-11' disabled={name.trim() === ''}>
        Save
      </Button>
    </form>
  );
}

function InstructTemplateForm({
  template,
  done,
}: {
  template: InstructTemplateRecord | null;
  done: () => void;
}): ReactElement {
  const { create, update } = instructTemplates.useActions();
  const writes = useWrites(refreshedByRecords);
  return (
    <div className='grid gap-3'>
      <InstructTemplateFormView
        template={template}
        done={done}
        onSave={(fields) => writes.run(template === null ? create(fields) : update(template, fields), 'Not saved', 'Saved')}
      />
      <WriteProblem problem={writes.problem} />
    </div>
  );
}

export function InstructTemplateManager(): ReactElement {
  const list = instructTemplates.useList();
  const { remove } = instructTemplates.useActions();
  return (
    <section aria-labelledby='templates-title' className='grid gap-3'>
      <h2 id='templates-title' className='text-lg font-semibold'>
        Instruct templates
      </h2>
      <ManagedList
        what='instruct template'
        rows={list.data}
        error={list.error}
        onRetry={() => list.mutate()}
        summary={(row) => `${row.stop.length} stop string${row.stop.length === 1 ? '' : 's'}`}
        newLabel='New template'
        emptyText='None of your own yet: the built-in templates cover most models.'
        editor={(row, done) => <InstructTemplateForm template={row} done={done} />}
        onDelete={(row) => void remove(row)}
      />
    </section>
  );
}
