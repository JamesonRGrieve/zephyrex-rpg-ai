// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The prompt manager (A16): the sections of what the model reads, in order. Each can be moved up or
 * down (buttons, so it works by touch, keyboard and screen reader alike), switched off, and given a
 * token budget it is cut to. Blank budget: no limit. The person can add prompts of their own, in the
 * system message or at a depth in the chat, and the text the reply starts with (audit gap 3).
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Switch } from 'zephyrex/ui/switch';
import { LIMITS, PROMPT } from '~/contract';
import {
  type LayoutEntry,
  OWN_PROMPT_PREFIX,
  type OwnPrompt,
  prefillOf,
  type PromptSection,
  type PromptSectionId,
  promptOrder,
} from '~/features/prompt/assemble';
import { cn } from '~/lib/utils';

export const SECTION_LABELS: Record<PromptSectionId, string> = {
  main: 'System prompt',
  safety: 'Table safety',
  table_notes: 'Table notes',
  campaign: 'Campaign frame',
  running_scenario: 'Running scenario',
  lore_before_char: 'Lore before the character',
  description: 'Description',
  personality: 'Personality',
  scenario: 'Scenario',
  lore_after_char: 'Lore after the character',
  persona: 'Your persona',
  lore_before_example: 'Lore before the examples',
  examples: 'Example dialogue',
  lore_after_example: 'Lore after the examples',
  data_bank: 'Data bank notes',
  memories: 'Memories (recalled by meaning)',
  summary: 'Summary',
  author_note: 'Author’s note',
  post_history: 'Post-history instructions',
};

function MoveButtons({
  label,
  first,
  last,
  onMove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  onMove: (step: -1 | 1) => void;
}): ReactElement {
  return (
    <div className='flex gap-1 justify-self-end'>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-11'
        aria-label={`Move ${label} up`}
        disabled={first}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-11'
        aria-label={`Move ${label} down`}
        disabled={last}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden />
      </Button>
    </div>
  );
}

/** One of the person's own prompts (audit gap 3): its name, text, role, and where it goes. */
function OwnPromptRow({
  prompt,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  prompt: OwnPrompt;
  first: boolean;
  last: boolean;
  onChange: (next: OwnPrompt) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}): ReactElement {
  const ids = { name: useId(), content: useId(), role: useId(), position: useId(), depth: useId() };
  const label = prompt.name.trim() === '' ? 'Your prompt' : prompt.name;
  return (
    <li className={cn('grid gap-3 rounded-lg border p-3', !prompt.enabled && 'bg-muted/40 text-muted-foreground')}>
      <div className='flex flex-wrap items-center gap-3'>
        <Switch
          checked={prompt.enabled}
          aria-label={`Include ${label}`}
          onCheckedChange={(enabled) => onChange({ ...prompt, enabled })}
        />
        <label htmlFor={ids.name} className='sr-only'>
          Prompt name
        </label>
        <Input
          id={ids.name}
          value={prompt.name}
          maxLength={LIMITS.name_characters}
          placeholder='Name'
          className='h-11 min-w-0 flex-1'
          onChange={(event) => onChange({ ...prompt, name: event.target.value })}
        />
        <MoveButtons label={label} first={first} last={last} onMove={onMove} />
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-11 text-destructive'
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <label htmlFor={ids.content} className='text-xs font-medium'>
        Text (macros work here)
      </label>
      <textarea
        id={ids.content}
        rows={3}
        value={prompt.content}
        maxLength={LIMITS.card_field_characters}
        className='rounded-md border bg-background p-2 text-sm'
        onChange={(event) => onChange({ ...prompt, content: event.target.value })}
      />
      <div className='flex flex-wrap items-center gap-3'>
        <label htmlFor={ids.position} className='text-xs'>
          Where
        </label>
        <select
          id={ids.position}
          value={prompt.position}
          className='h-11 rounded-md border bg-background px-3 text-sm'
          onChange={(event) => onChange({ ...prompt, position: event.target.value === 'depth' ? 'depth' : 'system' })}
        >
          <option value='system'>In the system message, here</option>
          <option value='depth'>In the chat, at a depth</option>
        </select>
        {prompt.position === 'depth' && (
          <>
            <label htmlFor={ids.depth} className='text-xs'>
              Depth
            </label>
            <Input
              id={ids.depth}
              type='number'
              inputMode='numeric'
              min={0}
              max={PROMPT.own_prompt_depth}
              value={prompt.depth}
              className='h-11 w-24'
              onChange={(event) => {
                const depth = Number.parseInt(event.target.value, 10);
                onChange({
                  ...prompt,
                  depth: Number.isNaN(depth) ? 0 : Math.min(PROMPT.own_prompt_depth, Math.max(0, depth)),
                });
              }}
            />
            <label htmlFor={ids.role} className='text-xs'>
              As
            </label>
            <select
              id={ids.role}
              value={prompt.role}
              className='h-11 rounded-md border bg-background px-3 text-sm'
              onChange={(event) =>
                onChange({
                  ...prompt,
                  role: event.target.value === 'user' ? 'user' : event.target.value === 'assistant' ? 'assistant' : 'system',
                })
              }
            >
              <option value='system'>System</option>
              <option value='user'>You</option>
              <option value='assistant'>The character</option>
            </select>
          </>
        )}
      </div>
    </li>
  );
}

function SectionRow({
  section,
  first,
  last,
  onChange,
  onMove,
}: {
  section: PromptSection;
  first: boolean;
  last: boolean;
  onChange: (next: PromptSection) => void;
  onMove: (step: -1 | 1) => void;
}): ReactElement {
  const label = SECTION_LABELS[section.id];
  const budgetId = useId();
  const [low, high] = PROMPT.section_token_range;
  return (
    <li
      className={cn(
        'grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center',
        !section.enabled && 'bg-muted/40 text-muted-foreground',
      )}
    >
      <div className='flex min-h-11 items-center gap-3'>
        <Switch
          checked={section.enabled}
          aria-label={`Include ${label}`}
          onCheckedChange={(enabled) => onChange({ ...section, enabled })}
        />
        <span className='text-sm font-medium'>{label}</span>
      </div>
      <div className='flex items-center gap-2'>
        <label htmlFor={budgetId} className='text-xs'>
          Max tokens
        </label>
        <Input
          id={budgetId}
          type='number'
          inputMode='numeric'
          min={low}
          max={high}
          placeholder='No limit'
          className='h-11 w-28'
          value={section.max_tokens ?? ''}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            onChange({
              ...section,
              max_tokens: Number.isNaN(value) ? null : Math.min(high ?? value, Math.max(low ?? value, value)),
            });
          }}
        />
      </div>
      <MoveButtons label={label} first={first} last={last} onMove={onMove} />
    </li>
  );
}

export function PromptLayoutEditor({
  value,
  onChange,
}: {
  value: readonly LayoutEntry[];
  onChange: (next: LayoutEntry[]) => void;
}): ReactElement {
  const order = promptOrder(value);
  const prefill = (value.find((entry) => entry.id === 'prefill') as LayoutEntry | undefined) ?? null;
  const prefillId = useId();
  const own = order.filter((entry): entry is OwnPrompt => 'content' in entry);
  // The layout as saved: the order, then "start reply with" when it has text.
  const emit = (next: (PromptSection | OwnPrompt)[], start: { content: string; enabled: boolean } | null) =>
    onChange([...next, ...(start === null || start.content === '' ? [] : [{ id: 'prefill' as const, ...start }])]);
  const keptPrefill =
    prefill === null
      ? null
      : { content: Reflect.get(prefill, 'content') as string, enabled: Reflect.get(prefill, 'enabled') !== false };
  const move = (index: number, step: -1 | 1) => {
    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (moved !== undefined) next.splice(index + step, 0, moved);
    emit(next, keptPrefill);
  };
  const replace = (changed: PromptSection | OwnPrompt) =>
    emit(
      order.map((one) => (one.id === changed.id ? changed : one)),
      keptPrefill,
    );
  const addPrompt = () => {
    let number = own.length + 1;
    while (order.some((entry) => entry.id === `${OWN_PROMPT_PREFIX}${number}`)) number += 1;
    const added: OwnPrompt = {
      id: `${OWN_PROMPT_PREFIX}${number}`,
      name: `Prompt ${number}`,
      content: '',
      role: 'system',
      position: 'system',
      depth: 0,
      enabled: true,
      max_tokens: null,
    };
    emit([...order, added], keptPrefill);
  };
  return (
    <fieldset className='grid gap-2'>
      <legend className='text-sm font-medium'>Prompt sections</legend>
      <p className='text-xs text-muted-foreground'>
        What the model reads before the chat, in this order. The chat itself always goes in.
      </p>
      <ol className='grid gap-2'>
        {order.map((entry, index) =>
          'content' in entry ? (
            <OwnPromptRow
              key={entry.id}
              prompt={entry}
              first={index === 0}
              last={index === order.length - 1}
              onMove={(step) => move(index, step)}
              onChange={replace}
              onRemove={() =>
                emit(
                  order.filter((one) => one.id !== entry.id),
                  keptPrefill,
                )
              }
            />
          ) : (
            <SectionRow
              key={entry.id}
              section={entry}
              first={index === 0}
              last={index === order.length - 1}
              onMove={(step) => move(index, step)}
              onChange={replace}
            />
          ),
        )}
      </ol>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          className='h-11'
          disabled={own.length >= PROMPT.own_prompts}
          onClick={addPrompt}
        >
          <Plus aria-hidden /> Add a prompt
        </Button>
        <Button
          type='button'
          variant='outline'
          className='h-11'
          onClick={() => emit([...promptOrder([]), ...own], keptPrefill)}
        >
          Default order
        </Button>
      </div>
      <div className='mt-2 grid gap-1.5'>
        <label htmlFor={prefillId} className='text-sm font-medium'>
          Start reply with
        </label>
        <p id={`${prefillId}-hint`} className='text-xs text-muted-foreground'>
          The reply begins with this, and the model carries on from it. Macros work here. Blank: off.
        </p>
        <textarea
          id={prefillId}
          rows={2}
          aria-describedby={`${prefillId}-hint`}
          value={prefillOf(value)}
          maxLength={LIMITS.card_field_characters}
          className='rounded-md border bg-background p-2 text-sm'
          onChange={(event) => emit(order, { content: event.target.value, enabled: true })}
        />
      </div>
    </fieldset>
  );
}
