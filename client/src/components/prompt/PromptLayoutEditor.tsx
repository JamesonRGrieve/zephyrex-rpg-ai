// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The prompt manager (A16): the sections of what the model reads, in order. Each can be moved up or
 * down (buttons, so it works by touch, keyboard and screen reader alike), switched off, and given a
 * token budget it is cut to. Blank budget: no limit.
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Switch } from 'zephyrex/ui/switch';
import { PROMPT } from '~/contract';
import { type PromptSection, type PromptSectionId, promptLayout } from '~/features/prompt/assemble';
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
  summary: 'Summary',
  author_note: 'Author’s note',
  post_history: 'Post-history instructions',
};

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
    <li className={cn('grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center', !section.enabled && 'bg-muted/40 text-muted-foreground')}>
      <div className='flex min-h-11 items-center gap-3'>
        <Switch checked={section.enabled} aria-label={`Include ${label}`} onCheckedChange={(enabled) => onChange({ ...section, enabled })} />
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
            onChange({ ...section, max_tokens: Number.isNaN(value) ? null : Math.min(high ?? value, Math.max(low ?? value, value)) });
          }}
        />
      </div>
      <div className='flex gap-1 justify-self-end'>
        <Button type='button' variant='ghost' size='icon' className='size-11' aria-label={`Move ${label} up`} disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp aria-hidden />
        </Button>
        <Button type='button' variant='ghost' size='icon' className='size-11' aria-label={`Move ${label} down`} disabled={last} onClick={() => onMove(1)}>
          <ArrowDown aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function PromptLayoutEditor({ value, onChange }: { value: readonly PromptSection[]; onChange: (next: PromptSection[]) => void }): ReactElement {
  const layout = promptLayout(value);
  const move = (index: number, step: -1 | 1) => {
    const next = [...layout];
    const [moved] = next.splice(index, 1);
    if (moved !== undefined) next.splice(index + step, 0, moved);
    onChange(next);
  };
  return (
    <fieldset className='grid gap-2'>
      <legend className='text-sm font-medium'>Prompt sections</legend>
      <p className='text-xs text-muted-foreground'>What the model reads before the chat, in this order. The chat itself always goes in.</p>
      <ol className='grid gap-2'>
        {layout.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            first={index === 0}
            last={index === layout.length - 1}
            onMove={(step) => move(index, step)}
            onChange={(changed) => onChange(layout.map((one) => (one.id === changed.id ? changed : one)))}
          />
        ))}
      </ol>
      <Button type='button' variant='outline' className='h-11 justify-self-start' onClick={() => onChange([])}>
        Default order
      </Button>
    </fieldset>
  );
}
