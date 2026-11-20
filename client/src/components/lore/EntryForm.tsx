// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every field of a World Info entry, grouped the way a writer thinks about it: what it says, when
 * it activates, where it goes, chance and groups, timing, recursion, matching, and which
 * characters it is for. Keys are one per line, so a `/regex/` key may hold commas. Controlled: the
 * caller holds the draft. Native selects and number inputs, so a phone gets its own pickers.
 */
import { type ReactElement, type ReactNode, useId } from 'react';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { Textarea } from 'zephyrex/ui/textarea';
import { DEPTH_ROLES, LIMITS, LORE, LORE_POSITIONS, SELECTIVE_LOGIC } from '~/contract';
import type { EntryFields } from '~/features/import/stLorebook';

export const POSITION_LABELS: Record<(typeof LORE_POSITIONS)[number], string> = {
  before_char: 'Before the character',
  after_char: 'After the character',
  before_example: 'Before the example dialogue',
  after_example: 'After the example dialogue',
  before_an: 'Before the author’s note',
  after_an: 'After the author’s note',
  at_depth: 'In the chat, at a depth',
};

export const LOGIC_LABELS: Record<(typeof SELECTIVE_LOGIC)[number], string> = {
  and_any: 'and any of these',
  and_all: 'and all of these',
  not_any: 'and none of these',
  not_all: 'and not all of these',
};

const ROLE_LABELS: Record<(typeof DEPTH_ROLES)[number], string> = { system: 'System', user: 'User', assistant: 'Assistant' };

/** Keys as typed: one per line, trimmed, without blanks or repeats, within the limits. */
export function parseKeys(text: string): string[] {
  return [...new Set(text.split('\n').map((key) => key.trim()).filter(Boolean))]
    .filter((key) => key.length <= LIMITS.lore_key_characters)
    .slice(0, LIMITS.lore_keys_per_entry);
}

/** A whole number clamped to a contract range (an empty or non-numeric box keeps `fallback`). */
export function clampTo(text: string, key: keyof typeof LORE.ranges, fallback: number): number {
  const value = Number.parseInt(text, 10);
  if (Number.isNaN(value)) return fallback;
  const [low, high] = LORE.ranges[key];
  return Math.min(high, Math.max(low, value));
}

function Group({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <fieldset className='grid gap-3 rounded-xl border p-4'>
      <legend className='px-1 text-sm font-semibold'>{title}</legend>
      {children}
    </fieldset>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }): ReactElement {
  const id = useId();
  return (
    <div className='flex min-h-11 items-center justify-between gap-3'>
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint !== undefined && <p className='text-xs text-muted-foreground'>{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: keyof typeof LORE.ranges;
  onChange: (value: number) => void;
}): ReactElement {
  const id = useId();
  const [low, high] = LORE.ranges[range];
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type='number' inputMode='numeric' min={low} max={high} value={value} className='h-11' onChange={(event) => onChange(clampTo(event.target.value, range, value))} />
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (value: T) => void }): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)} className='h-11 rounded-md border bg-background px-3 text-sm'>
        {(Object.entries(options) as [T, string][]).map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

const TRI = { book: 'Use the chat’s setting', on: 'On', off: 'Off' } as const;
const triOf = (value: boolean | null): keyof typeof TRI => (value === null ? 'book' : value ? 'on' : 'off');
const triValue = (choice: keyof typeof TRI): boolean | null => (choice === 'book' ? null : choice === 'on');

export function EntryForm({ value, onChange }: { value: EntryFields; onChange: (next: EntryFields) => void }): ReactElement {
  const set = <K extends keyof EntryFields>(key: K, next: EntryFields[K]) => onChange({ ...value, [key]: next });
  const ids = { comment: useId(), content: useId(), keys: useId(), secondary: useId(), group: useId(), names: useId() };

  return (
    <div className='grid gap-4'>
      <Group title='What it says'>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.comment}>Label</Label>
          <Input id={ids.comment} value={value.comment} maxLength={LIMITS.short_text_characters} className='h-11' onChange={(event) => set('comment', event.target.value)} />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.content}>Content</Label>
          <Textarea id={ids.content} rows={6} value={value.content} maxLength={LIMITS.lore_content_characters} onChange={(event) => set('content', event.target.value)} />
        </div>
      </Group>

      <Group title='When it activates'>
        <Toggle label='Enabled' checked={value.enabled} onChange={(next) => set('enabled', next)} />
        <Toggle label='Always on' hint='Constant: in every reply, whatever is said.' checked={value.constant} onChange={(next) => set('constant', next)} />
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.keys}>Keys</Label>
          <p id={`${ids.keys}-hint`} className='text-xs text-muted-foreground'>
            One per line. Any one of them in the recent chat activates the entry. Write /pattern/i for a regular expression.
          </p>
          <Textarea id={ids.keys} rows={3} aria-describedby={`${ids.keys}-hint`} defaultValue={value.keys.join('\n')} onBlur={(event) => set('keys', parseKeys(event.target.value))} />
        </div>
        <Choice label='Secondary keys must match' value={value.selective_logic} options={LOGIC_LABELS} onChange={(next) => set('selective_logic', next)} />
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.secondary}>Secondary keys</Label>
          <Textarea id={ids.secondary} rows={2} defaultValue={value.secondary_keys.join('\n')} onBlur={(event) => set('secondary_keys', parseKeys(event.target.value))} />
        </div>
      </Group>

      <Group title='Where it goes'>
        <Choice label='Position' value={value.position} options={POSITION_LABELS} onChange={(next) => set('position', next)} />
        {value.position === 'at_depth' && (
          <div className='grid gap-3 sm:grid-cols-2'>
            <NumberField label='Depth (messages from the end)' value={value.depth} range='depth' onChange={(next) => set('depth', next)} />
            <Choice label='As' value={value.role} options={ROLE_LABELS} onChange={(next) => set('role', next)} />
          </div>
        )}
        <NumberField label='Order (higher goes later and wins the budget)' value={value.order} range='order' onChange={(next) => set('order', next)} />
      </Group>

      <Group title='Chance and groups'>
        <NumberField label='Chance (%)' value={value.probability} range='probability' onChange={(next) => set('probability', next)} />
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.group}>Inclusion group</Label>
          <Input id={ids.group} value={value.group} maxLength={LIMITS.short_text_characters} placeholder='Only one entry of a group goes in' className='h-11' onChange={(event) => set('group', event.target.value)} />
        </div>
        {value.group !== '' && (
          <div className='grid gap-3 sm:grid-cols-2'>
            <NumberField label='Group weight' value={value.group_weight} range='group_weight' onChange={(next) => set('group_weight', next)} />
            <Toggle label='Wins its group' checked={value.prioritize} onChange={(next) => set('prioritize', next)} />
          </div>
        )}
      </Group>

      <Group title='Timing (in messages)'>
        <div className='grid gap-3 sm:grid-cols-3'>
          <NumberField label='Sticky' value={value.sticky} range='timed' onChange={(next) => set('sticky', next)} />
          <NumberField label='Cooldown' value={value.cooldown} range='timed' onChange={(next) => set('cooldown', next)} />
          <NumberField label='Delay' value={value.delay} range='timed' onChange={(next) => set('delay', next)} />
        </div>
      </Group>

      <Group title='Recursion'>
        <Toggle label='Never activated by other entries' checked={value.exclude_recursion} onChange={(next) => set('exclude_recursion', next)} />
        <Toggle label='Never activates other entries' checked={value.prevent_recursion} onChange={(next) => set('prevent_recursion', next)} />
        <Toggle label='Only activated by other entries' checked={value.delay_until_recursion} onChange={(next) => set('delay_until_recursion', next)} />
      </Group>

      <Group title='Matching'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Choice label='Case-sensitive' value={triOf(value.case_sensitive)} options={TRI} onChange={(next) => set('case_sensitive', triValue(next))} />
          <Choice label='Whole words only' value={triOf(value.match_whole_words)} options={TRI} onChange={(next) => set('match_whole_words', triValue(next))} />
        </div>
      </Group>

      <Group title='Characters'>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.names}>Character names</Label>
          <Textarea
            id={ids.names}
            rows={2}
            placeholder='One per line; empty for every character'
            defaultValue={value.character_names.join('\n')}
            onBlur={(event) => set('character_names', parseKeys(event.target.value))}
          />
        </div>
        <Toggle label='Everyone except these' checked={value.character_exclude} onChange={(next) => set('character_exclude', next)} />
      </Group>
    </div>
  );
}
