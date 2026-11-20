// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A chat's own settings: its title, who the person plays as, the sampler preset, the model, and the
 * author's note (docs/DESIGN.md A16). Native selects on purpose: on a phone they open the system's
 * own picker. Opens from the side on a wide screen and from the bottom on a phone.
 */
import { type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { Textarea } from 'zephyrex/ui/textarea';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { LIMITS } from '~/contract';

export interface ChatSettingsValue {
  title: string;
  persona_id: string | null;
  preset_id: string | null;
  endpoint_id: string | null;
  author_note: string;
}

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
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ChatSettingsValue;
  personas: readonly Option[];
  presets: readonly Option[];
  endpoints: readonly Option[];
  onSave: (value: ChatSettingsValue) => void;
}): ReactElement {
  const mobile = useIsMobile();
  const [draft, setDraft] = useState(value);
  const ids = { title: useId(), note: useId() };
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
            onSave({ ...draft, title: draft.title.trim() || value.title });
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
          <Button type='submit' className='h-11'>
            Save
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
