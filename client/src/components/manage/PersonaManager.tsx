// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Who the person plays as: name, title, description, picture, and which one chats use by default.
 * As in SillyTavern (audit gap 9), a persona can be locked to characters (a chat with one of them
 * speaks as it, unless the chat chooses another), place its description elsewhere in the prompt,
 * and bring its own lorebook.
 */
import { type ReactElement, useId, useState } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { Choice, type Option } from '~/components/play/ChatSettings';
import { LIMITS, PERSONA } from '~/contract';
import { characters, lorebooks, type Persona, personas, refreshedByRecords } from '~/features/data/records';
import { ManagedList } from './ManagedList';

type Position = Persona['description_position'];
type Role = Persona['description_role'];

const POSITION_LABELS: Record<Position, string> = {
  prompt: 'With the character',
  depth: 'In the chat, at a depth',
  note_top: 'Above the author’s note',
  note_bottom: 'Below the author’s note',
  none: 'Nowhere',
};
const ROLE_LABELS: Record<Role, string> = { system: 'System', user: 'You', assistant: 'The character' };
const CHIP = 'h-11 px-4';

export type PersonaFields = Pick<
  Persona,
  | 'name'
  | 'title'
  | 'description'
  | 'is_default'
  | 'description_position'
  | 'description_depth'
  | 'description_role'
  | 'lorebook_id'
  | 'character_ids'
>;

/** A persona's form; `onSave` answers whether it was saved. */
export function PersonaFormView({
  persona,
  characterOptions,
  lorebookOptions,
  onSave,
  problem = null,
}: {
  persona: Persona | null;
  characterOptions: readonly Option[];
  lorebookOptions: readonly Option[];
  onSave: (fields: PersonaFields) => void;
  problem?: string | null;
}): ReactElement {
  const [name, setName] = useState(persona?.name ?? '');
  const [title, setTitle] = useState(persona?.title ?? '');
  const [description, setDescription] = useState(persona?.description ?? '');
  const [isDefault, setIsDefault] = useState(persona?.is_default ?? false);
  const [position, setPosition] = useState<Position>(persona?.description_position ?? 'prompt');
  const [depth, setDepth] = useState(String(persona?.description_depth ?? PERSONA.default_depth));
  const [role, setRole] = useState<Role>(persona?.description_role ?? 'system');
  const [lorebookId, setLorebookId] = useState(persona?.lorebook_id ?? null);
  const [locked, setLocked] = useState<string[]>([...(persona?.character_ids ?? [])]);
  const ids = {
    name: useId(),
    title: useId(),
    description: useId(),
    isDefault: useId(),
    position: useId(),
    depth: useId(),
    role: useId(),
    locked: useId(),
  };
  const toggleLock = (id: string) => setLocked((now) => (now.includes(id) ? now.filter((one) => one !== id) : [...now, id]));

  return (
    <form
      className='grid gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number.parseInt(depth, 10);
        onSave({
          name: name.trim(),
          title: title.trim(),
          description,
          is_default: isDefault,
          description_position: position,
          description_depth: Number.isNaN(parsed) ? PERSONA.default_depth : Math.min(PERSONA.depth_max, Math.max(0, parsed)),
          description_role: role,
          lorebook_id: lorebookId,
          character_ids: locked,
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
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.title}>Title</Label>
        <Input
          id={ids.title}
          value={title}
          maxLength={PERSONA.title_characters}
          placeholder='Deckhand of the Kestrel'
          className='h-11'
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.description}>Description</Label>
        <Textarea
          id={ids.description}
          rows={5}
          value={description}
          maxLength={LIMITS.persona_description_characters}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className='grid gap-2'>
        <span id={ids.position} className='text-sm font-medium'>
          Where the description goes
        </span>
        <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.position} className='flex flex-wrap gap-2'>
          {PERSONA.positions.map((option) => (
            <ChoiceChip key={option} checked={position === option} className={CHIP} onClick={() => setPosition(option)}>
              {POSITION_LABELS[option]}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {position === 'depth' && (
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.depth}>Messages from the end</Label>
            <Input
              id={ids.depth}
              type='number'
              inputMode='numeric'
              min={0}
              max={PERSONA.depth_max}
              className='h-11'
              value={depth}
              onChange={(event) => setDepth(event.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <span id={ids.role} className='text-sm font-medium'>
              Said by
            </span>
            <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.role} className='flex flex-wrap gap-2'>
              {PERSONA.roles.map((option) => (
                <ChoiceChip key={option} checked={role === option} className={CHIP} onClick={() => setRole(option)}>
                  {ROLE_LABELS[option]}
                </ChoiceChip>
              ))}
            </div>
          </div>
        </div>
      )}
      <Choice
        label='Lorebook'
        value={lorebookId}
        options={lorebookOptions}
        noneLabel='None of its own'
        onChange={setLorebookId}
      />
      {characterOptions.length > 0 && (
        <fieldset className='grid gap-2' aria-describedby={`${ids.locked}-hint`}>
          <legend className='text-sm font-medium'>Locked to characters</legend>
          <p id={`${ids.locked}-hint`} className='text-xs text-muted-foreground'>
            A chat with one of them speaks as this persona, unless the chat chooses another.
          </p>
          {characterOptions.map((character) => (
            <label key={character.id} className='flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm'>
              <input
                type='checkbox'
                className='size-5'
                checked={locked.includes(character.id)}
                onChange={() => toggleLock(character.id)}
              />
              {character.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <Label htmlFor={ids.isDefault}>Use in new chats</Label>
        <Switch id={ids.isDefault} checked={isDefault} onCheckedChange={setIsDefault} />
      </div>
      <WriteProblem problem={problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === ''}>
        Save
      </Button>
    </form>
  );
}

function PersonaForm({ persona, done }: { persona: Persona | null; done: () => void }): ReactElement {
  const { create, update } = personas.useActions();
  const writes = useWrites(refreshedByRecords);
  const characterOptions = characters.useList().data ?? [];
  const lorebookOptions = lorebooks.useList().data ?? [];
  return (
    <PersonaFormView
      persona={persona}
      characterOptions={characterOptions}
      lorebookOptions={lorebookOptions}
      problem={writes.problem}
      onSave={(fields) =>
        void writes.run(persona === null ? create(fields) : update(persona, fields), 'Not saved', 'Saved').then((saved) => {
          if (saved) done();
        })
      }
    />
  );
}

export function PersonaManager(): ReactElement {
  const list = personas.useList();
  const { remove } = personas.useActions();
  return (
    <ManagedList
      what='persona'
      rows={list.data}
      error={list.error}
      onRetry={() => list.mutate()}
      summary={(row) => [row.title, row.description || 'No description'].filter((part) => part !== '').join(' · ')}
      isDefault={(row) => row.is_default}
      newLabel='New persona'
      emptyText='No personas yet. Chats call you “You” until you add one.'
      editor={(row, done) => <PersonaForm persona={row} done={done} />}
      onDelete={(row) => void remove(row)}
    />
  );
}
