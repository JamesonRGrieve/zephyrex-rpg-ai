// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Connection profiles (audit gap 8), as SillyTavern's: a named model and preset that a chat
 * switches to in one step, from its settings. The model brings its API, address, key and instruct
 * template; the preset its samplers and prompt layout.
 */
import { type ReactElement, useId, useState } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { WriteProblem } from '~/components/common/WriteProblem';
import { Choice, type Option } from '~/components/play/ChatSettings';
import { LIMITS, SEARCH_APIS } from '~/contract';
import { type ConnectionProfile, connectionProfiles, endpoints, presets } from '~/features/data/records';
import { ManagedList } from './ManagedList';

export type ConnectionProfileFields = Pick<ConnectionProfile, 'name' | 'endpoint_id' | 'preset_id'>;

/** What a profile sets, in words: its model and preset by name. */
export function profileSummary(
  profile: ConnectionProfileFields,
  models: readonly Option[],
  settings: readonly Option[],
): string {
  const named = (id: string | null, options: readonly Option[], none: string) =>
    id === null ? none : (options.find((option) => option.id === id)?.name ?? 'A deleted one');
  return `${named(profile.endpoint_id, models, 'Your default model')} · ${named(profile.preset_id, settings, 'Default settings')}`;
}

/** A profile's form; `onSave` answers the problem that kept it from being saved, or null. */
export function ConnectionProfileFormView({
  profile,
  models,
  settings,
  onSave,
  done,
}: {
  profile: ConnectionProfile | null;
  models: readonly Option[];
  settings: readonly Option[];
  onSave: (fields: ConnectionProfileFields) => Promise<string | null>;
  done: () => void;
}): ReactElement {
  const [name, setName] = useState(profile?.name ?? '');
  const [endpointId, setEndpointId] = useState(profile?.endpoint_id ?? null);
  const [presetId, setPresetId] = useState(profile?.preset_id ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const nameId = useId();

  const save = async () => {
    const failed = await onSave({ name: name.trim(), endpoint_id: endpointId, preset_id: presetId });
    setProblem(failed);
    if (failed === null) {
      notify('Saved');
      done();
    }
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
        <Label htmlFor={nameId}>Profile name</Label>
        <Input
          id={nameId}
          required
          value={name}
          maxLength={LIMITS.name_characters}
          placeholder='Claude for long scenes'
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Choice label='Model' value={endpointId} options={models} noneLabel='Your default model' onChange={setEndpointId} />
      <Choice label='Preset' value={presetId} options={settings} noneLabel='Default settings' onChange={setPresetId} />
      <WriteProblem problem={problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === ''}>
        Save
      </Button>
    </form>
  );
}

export function ConnectionProfileManager(): ReactElement {
  const list = connectionProfiles.useList();
  const { create, update, remove } = connectionProfiles.useActions();
  // A search source answers searches, not a chat, so it isn't a profile's model.
  const models = (endpoints.useList().data ?? []).filter(
    (endpoint) => !(SEARCH_APIS as readonly string[]).includes(endpoint.api),
  );
  const settings = presets.useList().data ?? [];
  return (
    <section className='grid gap-3'>
      <div>
        <h2 className='text-lg font-semibold'>Connection profiles</h2>
        <p className='text-sm text-muted-foreground'>
          A model and a preset under one name. A chat switches to both at once from its settings.
        </p>
      </div>
      <ManagedList
        what='connection profile'
        rows={list.data}
        error={list.error}
        onRetry={() => list.mutate()}
        summary={(row) => profileSummary(row, models, settings)}
        newLabel='New connection profile'
        emptyText='No connection profiles yet. Save a model and a preset you switch between, e.g. a fast one and a careful one.'
        editor={(row, done) => (
          <ConnectionProfileFormView
            profile={row}
            models={models}
            settings={settings}
            done={done}
            onSave={(fields) => writeProblem(row === null ? create(fields) : update(row, fields), 'Not saved')}
          />
        )}
        onDelete={(row) => void remove(row)}
      />
    </section>
  );
}
