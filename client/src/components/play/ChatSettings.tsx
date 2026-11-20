// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A chat's own settings: its title, who the person plays as, the sampler preset, the model, the
 * author's note and its own system prompt (docs/DESIGN.md A16), the lorebooks it reads and its World Info settings (A14). Native selects on purpose: on a phone they open the system's
 * own picker. Opens from the side on a wide screen and from the bottom on a phone.
 */
import { type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { Textarea } from 'zephyrex/ui/textarea';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { LIMITS, LORE } from '~/contract';

export interface ChatSettingsValue {
  title: string;
  persona_id: string | null;
  preset_id: string | null;
  endpoint_id: string | null;
  author_note: string;
  lorebook_ids: string[];
  lore_settings: LoreSettingsValue;
  system_prompt: string;
}

/** What a chat sets of World Info's settings; the rest take the contract's defaults. */
export type LoreSettingsValue = {
  scan_depth?: number;
  token_budget?: number;
  recursion_steps?: number;
  case_sensitive?: boolean;
  match_whole_words?: boolean;
};

export interface Option {
  id: string;
  name: string;
}

const NONE = '';

function Choice({
  label,
  value,
  options,
  noneLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly Option[];
  noneLabel: string;
  onChange: (value: string | null) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value ?? NONE}
        onChange={(event) => onChange(event.target.value === NONE ? null : event.target.value)}
        className='h-11 rounded-md border bg-background px-3 text-sm'
      >
        <option value={NONE}>{noneLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ChatSettings({
  open,
  onOpenChange,
  value,
  personas,
  presets,
  endpoints,
  lorebooks,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ChatSettingsValue;
  personas: readonly Option[];
  presets: readonly Option[];
  endpoints: readonly Option[];
  lorebooks: readonly Option[];
  onSave: (value: ChatSettingsValue) => void;
}): ReactElement {
  const mobile = useIsMobile();
  const [draft, setDraft] = useState(value);
  const ids = { title: useId(), system: useId(), note: useId(), scan: useId(), budget: useId(), recursion: useId() };
  const setLore = <K extends keyof LoreSettingsValue>(key: K, next: LoreSettingsValue[K]) => set('lore_settings', { ...draft.lore_settings, [key]: next });
  const loreNumber = (key: 'scan_depth' | 'token_budget' | 'recursion_steps', text: string) => {
    const [low, high] = LORE.ranges[key];
    const value = Number.parseInt(text, 10);
    setLore(key, Number.isNaN(value) ? undefined : Math.min(high, Math.max(low, value)));
  };
  const toggleBook = (id: string) =>
    set('lorebook_ids', draft.lorebook_ids.includes(id) ? draft.lorebook_ids.filter((one) => one !== id) : [...draft.lorebook_ids, id].slice(0, LIMITS.lorebooks_per_chat));
  const set = <K extends keyof ChatSettingsValue>(key: K, next: ChatSettingsValue[K]) => setDraft({ ...draft, [key]: next });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value);
        onOpenChange(next);
      }}
    >
      <SheetContent side={mobile ? 'bottom' : 'right'} className='max-h-[90svh] overflow-y-auto pb-safe'>
        <SheetHeader>
          <SheetTitle>Chat settings</SheetTitle>
          <SheetDescription>Apply to this chat only.</SheetDescription>
        </SheetHeader>
        <form
          className='grid gap-4 p-4'
          onSubmit={(event) => {
            event.preventDefault();
            // Settings left empty take the contract's defaults: they are not sent.
            const loreSettings = Object.fromEntries(Object.entries(draft.lore_settings).filter(([, setting]) => setting !== undefined));
            onSave({ ...draft, title: draft.title.trim() || value.title, lore_settings: loreSettings });
            onOpenChange(false);
          }}
        >
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.title}>Title</Label>
            <Input id={ids.title} value={draft.title} maxLength={LIMITS.chat_title_characters} className='h-11' onChange={(event) => set('title', event.target.value)} />
          </div>
          <Choice label='You play as' value={draft.persona_id} options={personas} noneLabel='Your default persona' onChange={(next) => set('persona_id', next)} />
          <Choice label='Preset' value={draft.preset_id} options={presets} noneLabel='Default settings' onChange={(next) => set('preset_id', next)} />
          <Choice label='Model' value={draft.endpoint_id} options={endpoints} noneLabel='Your default model' onChange={(next) => set('endpoint_id', next)} />
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.system}>System prompt</Label>
            <p id={`${ids.system}-hint`} className='text-xs text-muted-foreground'>
              Replaces the character’s own for this chat. Leave it blank to keep theirs.
            </p>
            <Textarea
              id={ids.system}
              rows={3}
              value={draft.system_prompt}
              maxLength={LIMITS.chat_system_prompt_characters}
              aria-describedby={`${ids.system}-hint`}
              onChange={(event) => set('system_prompt', event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.note}>Author’s note</Label>
            <p id={`${ids.note}-hint`} className='text-xs text-muted-foreground'>
              A reminder the model reads close to the end of the chat, e.g. the mood or what happens next.
            </p>
            <Textarea
              id={ids.note}
              rows={4}
              value={draft.author_note}
              maxLength={LIMITS.author_note_characters}
              aria-describedby={`${ids.note}-hint`}
              onChange={(event) => set('author_note', event.target.value)}
            />
          </div>
          <fieldset className='grid gap-2'>
            <legend className='text-sm font-medium'>Lorebooks</legend>
            {lorebooks.length === 0 && <p className='text-sm text-muted-foreground'>No lorebooks yet.</p>}
            {lorebooks.map((book) => (
              <label key={book.id} className='flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm'>
                <input type='checkbox' className='size-5' checked={draft.lorebook_ids.includes(book.id)} onChange={() => toggleBook(book.id)} />
                {book.name}
              </label>
            ))}
          </fieldset>
          <fieldset className='grid gap-3'>
            <legend className='text-sm font-medium'>World Info settings</legend>
            <div className='grid gap-3 sm:grid-cols-3'>
              <div className='grid gap-1.5'>
                <Label htmlFor={ids.scan}>Messages scanned</Label>
                <Input id={ids.scan} type='number' inputMode='numeric' className='h-11' placeholder={String(LORE.defaults.scan_depth)} value={draft.lore_settings.scan_depth ?? ''} onChange={(event) => loreNumber('scan_depth', event.target.value)} />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor={ids.budget}>Token budget</Label>
                <Input id={ids.budget} type='number' inputMode='numeric' className='h-11' placeholder={String(LORE.defaults.token_budget)} value={draft.lore_settings.token_budget ?? ''} onChange={(event) => loreNumber('token_budget', event.target.value)} />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor={ids.recursion}>Recursion steps</Label>
                <Input id={ids.recursion} type='number' inputMode='numeric' className='h-11' placeholder={String(LORE.defaults.recursion_steps)} value={draft.lore_settings.recursion_steps ?? ''} onChange={(event) => loreNumber('recursion_steps', event.target.value)} />
              </div>
            </div>
            <label className='flex min-h-11 items-center gap-3 text-sm'>
              <input type='checkbox' className='size-5' checked={draft.lore_settings.case_sensitive ?? false} onChange={(event) => setLore('case_sensitive', event.target.checked)} />
              Keys are case-sensitive
            </label>
            <label className='flex min-h-11 items-center gap-3 text-sm'>
              <input type='checkbox' className='size-5' checked={draft.lore_settings.match_whole_words ?? false} onChange={(event) => setLore('match_whole_words', event.target.checked)} />
              Keys match whole words only
            </label>
          </fieldset>
          <Button type='submit' className='h-11'>
            Save
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
