// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A person's own instruct templates (A17): the markup a text API's model was trained on, when no
 * built-in one fits. A model endpoint then picks one in place of a built-in template, or a model
 * whose name its activation pattern matches takes it by itself. It can carry SillyTavern's context
 * template (a story string, an example separator, a chat start) and name every turn, and a
 * SillyTavern instruct or context file can be read in (audit gap 4).
 */
import { type ReactElement, useId, useState } from 'react';
import { Switch } from 'zephyrex/ui/switch';
import { templateFromSillyTavern } from '~/features/import/stTemplates';
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
export type InstructTemplateFields = Pick<
  InstructTemplateRecord,
  'name' | MarkupField | 'stop' | 'include_names' | 'activation_regex' | 'story_string' | 'example_separator' | 'chat_start'
>;

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
  const [context, setContext] = useState({
    include_names: template?.include_names ?? false,
    activation_regex: template?.activation_regex ?? '',
    story_string: template?.story_string ?? '',
    example_separator: template?.example_separator ?? '',
    chat_start: template?.chat_start ?? '',
  });
  const [imported, setImported] = useState<string | null>(null);
  const ids = {
    name: useId(),
    stop: useId(),
    field: useId(),
    names: useId(),
    regex: useId(),
    story: useId(),
    separator: useId(),
    start: useId(),
    file: useId(),
  };

  // A SillyTavern instruct or context file read in: what it sets replaces the form's, and what didn't map is named.
  const importFile = async (file: File | undefined) => {
    if (file === undefined) return;
    let json: unknown = null;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setImported('That file isn’t a SillyTavern template (not JSON).');
      return;
    }
    const read = templateFromSillyTavern(json);
    if (name.trim() === '') setName(read.name);
    setMarkup({
      start: read.start,
      system_prefix: read.system_prefix,
      system_suffix: read.system_suffix,
      user_prefix: read.user_prefix,
      user_suffix: read.user_suffix,
      assistant_prefix: read.assistant_prefix,
      assistant_suffix: read.assistant_suffix,
    });
    setStop(read.stop.join('\n'));
    setContext({
      include_names: read.include_names,
      activation_regex: read.activation_regex,
      story_string: read.story_string,
      example_separator: read.example_separator,
      chat_start: read.chat_start,
    });
    setImported(
      read.unmapped.length === 0
        ? 'Read in. Save to keep it.'
        : `Read in. Not brought over: ${read.unmapped.join(', ')}. Save to keep it.`,
    );
  };

  return (
    <form
      className='grid gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ name: name.trim(), ...markup, stop: stopLines(stop), ...context }).then((saved) => {
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
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <Label htmlFor={ids.names}>Name every turn</Label>
        <Switch
          id={ids.names}
          checked={context.include_names}
          onCheckedChange={(on) => setContext({ ...context, include_names: on })}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.regex}>Use for models matching</Label>
        <p id={`${ids.regex}-hint`} className='text-xs text-muted-foreground'>
          A pattern: a model whose name it matches uses this template unless its endpoint names one.
        </p>
        <Input
          id={ids.regex}
          value={context.activation_regex}
          maxLength={INSTRUCT_CUSTOM.activation_regex_characters}
          placeholder='llama-3'
          aria-describedby={`${ids.regex}-hint`}
          className='h-11 font-mono text-sm'
          onChange={(event) => setContext({ ...context, activation_regex: event.target.value })}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.story}>Story string</Label>
        <p id={`${ids.story}-hint`} className='text-xs text-muted-foreground'>
          SillyTavern’s context template, in place of the card’s sections: {'{{system}}'}, {'{{description}}'},{' '}
          {'{{personality}}'}, {'{{scenario}}'}, {'{{persona}}'}, {'{{wiBefore}}'}, {'{{wiAfter}}'}, {'{{mesExamples}}'} and{' '}
          {'{{#if x}}…{{/if}}'}. Blank: the sections as the prompt manager orders them.
        </p>
        <Textarea
          id={ids.story}
          rows={4}
          value={context.story_string}
          maxLength={INSTRUCT_CUSTOM.story_characters}
          aria-describedby={`${ids.story}-hint`}
          className='font-mono text-sm'
          onChange={(event) => setContext({ ...context, story_string: event.target.value })}
        />
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.separator}>Example separator</Label>
          <Input
            id={ids.separator}
            value={context.example_separator}
            maxLength={INSTRUCT_CUSTOM.field_characters}
            className='h-11 font-mono text-sm'
            onChange={(event) => setContext({ ...context, example_separator: event.target.value })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.start}>Chat start</Label>
          <Input
            id={ids.start}
            value={context.chat_start}
            maxLength={INSTRUCT_CUSTOM.field_characters}
            className='h-11 font-mono text-sm'
            onChange={(event) => setContext({ ...context, chat_start: event.target.value })}
          />
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.file}>Read in a SillyTavern template</Label>
        <Input
          id={ids.file}
          type='file'
          accept='application/json,.json'
          className='h-11'
          aria-describedby={`${ids.file}-status`}
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <p id={`${ids.file}-status`} role='status' className='text-xs text-muted-foreground'>
          {imported ?? 'An instruct template, a context template, or a master export of both.'}
        </p>
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
