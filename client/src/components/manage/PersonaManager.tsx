// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** Who the person plays as: name, description, picture, and which one chats use by default. */
import { type ReactElement, useId, useState } from 'react';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { LIMITS } from '~/contract';
import { type Persona, personas, refreshedByRecords } from '~/features/data/records';
import { ManagedList } from './ManagedList';

function PersonaForm({ persona, done }: { persona: Persona | null; done: () => void }): ReactElement {
  const { create, update } = personas.useActions();
  const [name, setName] = useState(persona?.name ?? '');
  const [description, setDescription] = useState(persona?.description ?? '');
  const [isDefault, setIsDefault] = useState(persona?.is_default ?? false);
  const writes = useWrites(refreshedByRecords);
  const ids = { name: useId(), description: useId(), isDefault: useId() };

  const save = async () => {
    const fields = { name: name.trim(), description, is_default: isDefault };
    if (await writes.run(persona === null ? create(fields) : update(persona, fields), 'Not saved', 'Saved')) done();
  };

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
          className='h-11'
          onChange={(event) => setName(event.target.value)}
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
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <Label htmlFor={ids.isDefault}>Use in new chats</Label>
        <Switch id={ids.isDefault} checked={isDefault} onCheckedChange={setIsDefault} />
      </div>
      <WriteProblem problem={writes.problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === ''}>
        Save
      </Button>
    </form>
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
      summary={(row) => row.description || 'No description'}
      isDefault={(row) => row.is_default}
      newLabel='New persona'
      emptyText='No personas yet. Chats call you “You” until you add one.'
      editor={(row, done) => <PersonaForm persona={row} done={done} />}
      onDelete={(row) => void remove(row)}
    />
  );
}
