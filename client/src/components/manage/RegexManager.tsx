// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Regex scripts (A33): find-and-replace on chat text, as SillyTavern runs them. Each says what it
 * finds and what it writes, where it applies (your messages, the characters', or both), and when:
 * as the message is saved, only as it is shown, or only as the model reads it. A try-it box shows
 * the result as you type. Scripts run in the order of their position.
 */
import { FileUp } from 'lucide-react';
import { type ChangeEvent, type ReactElement, useId, useRef, useState } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { Button } from 'zephyrex/ui/button';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { LIMITS, REGEX } from '~/contract';
import { applyRegex, compileFind, type RegexPlacement, type RegexTarget } from '~/features/chat/regex';
import { regexScriptsFromJson } from '~/features/import/stScripts';
import { type RegexScriptRecord, regexScripts, refreshedByRecords } from '~/features/data/records';
import { ManagedList } from './ManagedList';

const PLACEMENT_LABELS: Record<RegexPlacement, string> = { user_input: 'Your messages', ai_output: 'Characters’ replies' };
const TARGET_LABELS: Record<RegexTarget, string> = {
  stored: 'As saved',
  display: 'Only as shown',
  prompt: 'Only for the model',
};
const CHIP = 'h-11 px-4';

export function targetOf(script: Pick<RegexScriptRecord, 'display_only' | 'prompt_only'>): RegexTarget {
  return script.display_only ? 'display' : script.prompt_only ? 'prompt' : 'stored';
}

function depthOf(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? null : Math.min(REGEX.depth_range[1], Math.max(REGEX.depth_range[0], value));
}

function RegexForm({ script, done }: { script: RegexScriptRecord | null; done: () => void }): ReactElement {
  const { create, update } = regexScripts.useActions();
  const [name, setName] = useState(script?.name ?? '');
  const [find, setFind] = useState(script?.find ?? '');
  const [replace, setReplace] = useState(script?.replace ?? '');
  const [placements, setPlacements] = useState<RegexPlacement[]>(script?.placements ?? ['ai_output']);
  const [target, setTarget] = useState<RegexTarget>(script === null ? 'stored' : targetOf(script));
  const [minDepth, setMinDepth] = useState(script?.min_depth?.toString() ?? '');
  const [maxDepth, setMaxDepth] = useState(script?.max_depth?.toString() ?? '');
  const [enabled, setEnabled] = useState(script?.enabled ?? true);
  const [position, setPosition] = useState(String(script?.position ?? 0));
  const [sample, setSample] = useState('');
  const writes = useWrites(refreshedByRecords);
  const ids = {
    name: useId(),
    find: useId(),
    replace: useId(),
    where: useId(),
    when: useId(),
    min: useId(),
    max: useId(),
    enabled: useId(),
    position: useId(),
    sample: useId(),
  };
  const valid = find !== '' && compileFind(find) !== null;

  const save = async () => {
    const fields = {
      name: name.trim(),
      find,
      replace,
      placements,
      display_only: target === 'display',
      prompt_only: target === 'prompt',
      min_depth: target === 'stored' ? null : depthOf(minDepth),
      max_depth: target === 'stored' ? null : depthOf(maxDepth),
      enabled,
      position: Math.max(0, Number.parseInt(position, 10) || 0),
    };
    if (await writes.run(script === null ? create(fields) : update(script, fields), 'Not saved', 'Saved')) done();
  };

  const preview =
    sample === '' || !valid
      ? ''
      : applyRegex(
          sample,
          [
            {
              find,
              replace,
              placements: [placements[0] ?? 'ai_output'],
              display_only: false,
              prompt_only: false,
              min_depth: null,
              max_depth: null,
              enabled: true,
            },
          ],
          placements[0] ?? 'ai_output',
          'stored',
        );

  return (
    <form
      className='grid gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          required
          value={name}
          maxLength={LIMITS.name_characters}
          placeholder='Italic actions'
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.find}>Find</Label>
        <p id={`${ids.find}-hint`} className='text-xs text-muted-foreground'>
          A pattern, or /pattern/flags with g (every match), i (any case), m (each line) or s (across lines).
        </p>
        <Input
          id={ids.find}
          required
          value={find}
          maxLength={LIMITS.regex_pattern_characters}
          placeholder='/\*(.+?)\*/g'
          className='h-11 font-mono'
          autoCapitalize='off'
          autoCorrect='off'
          spellCheck={false}
          aria-describedby={`${ids.find}-hint`}
          aria-invalid={find !== '' && !valid}
          onChange={(event) => setFind(event.target.value)}
        />
        {find !== '' && !valid && <p className='text-sm text-destructive'>This pattern does not compile.</p>}
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.replace}>Replace with</Label>
        <p id={`${ids.replace}-hint`} className='text-xs text-muted-foreground'>
          $1, $2… for the groups; $&amp; or {'{{match}}'} for the whole match.
        </p>
        <Textarea
          id={ids.replace}
          rows={2}
          value={replace}
          maxLength={LIMITS.regex_replacement_characters}
          className='font-mono'
          aria-describedby={`${ids.replace}-hint`}
          onChange={(event) => setReplace(event.target.value)}
        />
      </div>
      <fieldset className='grid gap-2'>
        <legend id={ids.where} className='text-sm font-medium'>
          Applies to
        </legend>
        <div className='flex flex-wrap gap-3'>
          {REGEX.placements.map((placement) => (
            <label key={placement} className='flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm'>
              <input
                type='checkbox'
                className='size-5'
                checked={placements.includes(placement)}
                onChange={() =>
                  setPlacements(
                    placements.includes(placement)
                      ? placements.filter((one) => one !== placement)
                      : [...placements, placement],
                  )
                }
              />
              {PLACEMENT_LABELS[placement]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className='grid gap-2'>
        <span id={ids.when} className='text-sm font-medium'>
          Changes the text
        </span>
        <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.when} className='flex flex-wrap gap-2'>
          {REGEX.targets.map((one) => (
            <ChoiceChip key={one} checked={target === one} className={CHIP} onClick={() => setTarget(one)}>
              {TARGET_LABELS[one]}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {target !== 'stored' && (
        <div className='grid grid-cols-2 gap-3'>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.min}>From depth</Label>
            <Input
              id={ids.min}
              type='number'
              inputMode='numeric'
              placeholder='Newest (0)'
              className='h-11'
              value={minDepth}
              onChange={(event) => setMinDepth(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.max}>To depth</Label>
            <Input
              id={ids.max}
              type='number'
              inputMode='numeric'
              placeholder='Oldest'
              className='h-11'
              value={maxDepth}
              onChange={(event) => setMaxDepth(event.target.value)}
            />
          </div>
        </div>
      )}
      <div className='grid grid-cols-2 gap-3'>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.position}>Order</Label>
          <Input
            id={ids.position}
            type='number'
            inputMode='numeric'
            min={0}
            className='h-11'
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          />
        </div>
        <div className='flex min-h-11 items-end justify-between gap-3 pb-2'>
          <Label htmlFor={ids.enabled}>On</Label>
          <Switch id={ids.enabled} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <div className='grid gap-1.5 rounded-lg border bg-muted/40 p-3'>
        <Label htmlFor={ids.sample}>Try it</Label>
        <Input
          id={ids.sample}
          value={sample}
          placeholder='*waves* Hello there.'
          className='h-11'
          onChange={(event) => setSample(event.target.value)}
        />
        <output
          htmlFor={`${ids.sample} ${ids.find} ${ids.replace}`}
          aria-label='Result'
          className='min-h-6 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]'
        >
          {preview}
        </output>
      </div>
      <WriteProblem problem={writes.problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === '' || !valid || placements.length === 0}>
        Save
      </Button>
    </form>
  );
}

export function RegexManager(): ReactElement {
  const list = regexScripts.useList();
  const { create, remove } = regexScripts.useActions();
  const fileInput = useRef<HTMLInputElement>(null);

  /** SillyTavern regex script files: each script this app can run alike is added; the rest are named. */
  const readFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const read = await Promise.all(
      files.map(async (file) => regexScriptsFromJson(JSON.parse(await file.text()) as unknown)),
    ).catch(() => null);
    if (read === null) {
      notify('Not read in', 'Each file must be a SillyTavern regex script (.json).');
      return;
    }
    const offset = list.data?.length ?? 0;
    const scripts = read.flatMap((one) => one.scripts);
    const results = await Promise.allSettled(
      scripts.map((script, index) => create({ ...script, position: Math.min(LIMITS.regex_scripts, offset + index) })),
    );
    const added = results.filter((result) => result.status === 'fulfilled').length;
    const refused = read.flatMap((one) => one.refused);
    notify(
      `${added} ${added === 1 ? 'script' : 'scripts'} read in`,
      refused.length === 0 ? undefined : `Not usable here: ${refused.join(', ')}.`,
    );
  };

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> Read in from SillyTavern
        </Button>
        <input
          ref={fileInput}
          type='file'
          accept='.json,application/json'
          multiple
          hidden
          onChange={(event) => void readFiles(event)}
        />
      </div>
      <ManagedList
        what='regex script'
        rows={list.data}
        error={list.error}
        onRetry={() => list.mutate()}
        summary={(row) =>
          `${row.enabled ? '' : 'Off · '}${TARGET_LABELS[targetOf(row)]} · ${row.placements.map((placement) => PLACEMENT_LABELS[placement]).join(', ')}`
        }
        newLabel='New script'
        emptyText='No regex scripts yet. Add one to tidy or restyle chat text, e.g. to show *actions* in italics.'
        editor={(row, done) => <RegexForm script={row} done={done} />}
        onDelete={(row) => void remove(row)}
      />
    </div>
  );
}
