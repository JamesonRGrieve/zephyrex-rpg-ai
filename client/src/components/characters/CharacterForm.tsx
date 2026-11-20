// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every field of a character card, in the order a writer works: who they are, how they open, how
 * the model is steered, and the card's own notes. Controlled: the caller holds the draft.
 */
import { ImageUp, Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { LIMITS } from '~/contract';
import { initials } from './CharacterTile';
import { PICTURE_TYPES, pictureFromFile } from '~/features/media/picture';

export interface CharacterDraft {
  name: string;
  avatar: string | null;
  description: string;
  personality: string;
  scenario: string;
  first_message: string;
  alternate_greetings: string[];
  example_messages: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  creator: string;
  character_version: string;
  tags: string[];
}


/** Tags as typed: comma-separated, trimmed, without blanks or repeats. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function TextField({
  label,
  hint,
  value,
  rows = 4,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      {hint !== undefined && (
        <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
          {hint}
        </p>
      )}
      <Textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={LIMITS.card_field_characters}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function CharacterForm({
  value,
  onChange,
  onAvatarRefused,
}: {
  value: CharacterDraft;
  onChange: (next: CharacterDraft) => void;
  /** Why a picture was not taken (too big, not an image). */
  onAvatarRefused?: (reason: string) => void;
}): ReactElement {
  const ids = { name: useId(), tags: useId(), creator: useId(), version: useId(), avatar: useId() };
  const set = <K extends keyof CharacterDraft>(key: K, next: CharacterDraft[K]) => onChange({ ...value, [key]: next });

  const takeAvatar = async (file: File | undefined) => {
    if (file === undefined) return;
    const picture = await pictureFromFile(file);
    if ('refused' in picture) onAvatarRefused?.(picture.refused);
    else set('avatar', picture.url);
  };

  return (
    <div className='grid gap-8'>
      <section aria-labelledby='card-identity' className='grid gap-4'>
        <h2 id='card-identity' className='text-lg font-semibold'>
          Who they are
        </h2>
        <div className='flex items-center gap-4'>
          <Avatar className='size-20'>
            {value.avatar !== null && <AvatarImage src={value.avatar} alt='' />}
            <AvatarFallback>{initials(value.name)}</AvatarFallback>
          </Avatar>
          <div className='flex flex-wrap gap-2'>
            <Button asChild variant='outline' className='h-11'>
              <label htmlFor={ids.avatar} className='cursor-pointer'>
                <ImageUp aria-hidden /> Picture
              </label>
            </Button>
            <input id={ids.avatar} type='file' accept={PICTURE_TYPES.join(',')} className='sr-only' onChange={(event) => void takeAvatar(event.target.files?.[0])} />
            {value.avatar !== null && (
              <Button type='button' variant='ghost' className='h-11' onClick={() => set('avatar', null)}>
                Remove picture
              </Button>
            )}
          </div>
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.name}>Name</Label>
          <Input id={ids.name} value={value.name} required maxLength={LIMITS.name_characters} className='h-11' onChange={(event) => set('name', event.target.value)} />
        </div>
        <TextField label='Description' hint='Who {{char}} is: looks, history, what they want.' value={value.description} rows={6} onChange={(next) => set('description', next)} />
        <TextField label='Personality' value={value.personality} rows={2} onChange={(next) => set('personality', next)} />
        <TextField label='Scenario' hint='Where the story starts.' value={value.scenario} rows={3} onChange={(next) => set('scenario', next)} />
      </section>

      <section aria-labelledby='card-greetings' className='grid gap-4'>
        <h2 id='card-greetings' className='text-lg font-semibold'>
          How they open
        </h2>
        <TextField label='First message' value={value.first_message} rows={5} onChange={(next) => set('first_message', next)} />
        <fieldset className='grid gap-3'>
          <legend className='text-sm font-medium'>Alternate greetings</legend>
          {value.alternate_greetings.map((greeting, index) => (
            // Greetings have no ids of their own; their place is what identifies them here.
            <div key={index} className='flex items-start gap-2'>
              <Textarea
                aria-label={`Alternate greeting ${index + 1}`}
                rows={3}
                value={greeting}
                maxLength={LIMITS.card_field_characters}
                onChange={(event) => set('alternate_greetings', value.alternate_greetings.map((old, at) => (at === index ? event.target.value : old)))}
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11 shrink-0'
                aria-label={`Remove alternate greeting ${index + 1}`}
                onClick={() => set('alternate_greetings', value.alternate_greetings.filter((_, at) => at !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {value.alternate_greetings.length < LIMITS.greetings_per_character && (
            <Button type='button' variant='outline' className='h-11 justify-self-start' onClick={() => set('alternate_greetings', [...value.alternate_greetings, ''])}>
              <Plus aria-hidden /> Add a greeting
            </Button>
          )}
        </fieldset>
        <TextField label='Example dialogue' hint='Start each example with <START>.' value={value.example_messages} rows={6} onChange={(next) => set('example_messages', next)} />
      </section>

      <section aria-labelledby='card-prompts' className='grid gap-4'>
        <h2 id='card-prompts' className='text-lg font-semibold'>
          How the model is steered
        </h2>
        <TextField label='System prompt' hint='Leave empty for the default.' value={value.system_prompt} rows={3} onChange={(next) => set('system_prompt', next)} />
        <TextField label='Post-history instructions' hint='Sent after the chat, just before the reply.' value={value.post_history_instructions} rows={3} onChange={(next) => set('post_history_instructions', next)} />
      </section>

      <section aria-labelledby='card-notes' className='grid gap-4'>
        <h2 id='card-notes' className='text-lg font-semibold'>
          About the card
        </h2>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.tags}>Tags</Label>
          <Input id={ids.tags} defaultValue={value.tags.join(', ')} placeholder='fantasy, mentor' className='h-11' onBlur={(event) => set('tags', parseTags(event.target.value))} />
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.creator}>Creator</Label>
            <Input id={ids.creator} value={value.creator} maxLength={LIMITS.short_text_characters} className='h-11' onChange={(event) => set('creator', event.target.value)} />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.version}>Version</Label>
            <Input id={ids.version} value={value.character_version} maxLength={LIMITS.short_text_characters} className='h-11' onChange={(event) => set('character_version', event.target.value)} />
          </div>
        </div>
        <TextField label="Creator's notes" value={value.creator_notes} rows={3} onChange={(next) => set('creator_notes', next)} />
      </section>
    </div>
  );
}
