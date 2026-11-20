// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The models replies come from: any OpenAI-compatible endpoint (Ollama, llama.cpp, vLLM, a gateway
 * such as Bifrost, or a hosted API). An API key is write-only: once saved it is never shown again.
 * A text-completion server (KoboldCpp, llama.cpp's own API) reads one prompt in an instruct
 * template's markup (A17); a chat API takes the messages as they are.
 */
import { type ReactElement, useId, useState } from 'react';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { WriteProblem } from '~/components/common/WriteProblem';
import {
  type EndpointApi,
  type EndpointRole,
  ENDPOINT_ROLES,
  INSTRUCT_TEMPLATES,
  type InstructTemplateId,
  LIMITS,
} from '~/contract';
import { type ModelEndpoint, endpoints, refreshedByRecords } from '~/features/data/records';
import { pingEndpoint } from '~/features/models/ping';
import { ManagedList } from './ManagedList';
import { ModelStatus } from './ModelStatus';

/** What a model can be used for (A27), as the form names it. */
const ROLE_LABELS: Record<EndpointRole, string> = {
  story: 'Character replies',
  gm: 'The GM',
  summary: 'Summaries',
  translate: 'Translation',
  image: 'Pictures',
};

/** Common local servers' addresses, to fill in with one tap. */
export const KNOWN_ENDPOINTS = [
  { label: 'Ollama', base_url: 'http://localhost:11434/v1' },
  { label: 'llama.cpp', base_url: 'http://localhost:8080/v1' },
  { label: 'LM Studio', base_url: 'http://localhost:1234/v1' },
] as const;

function EndpointForm({ endpoint, done }: { endpoint: ModelEndpoint | null; done: () => void }): ReactElement {
  const { create, update } = endpoints.useActions();
  const [name, setName] = useState(endpoint?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(endpoint?.base_url ?? '');
  const [model, setModel] = useState(endpoint?.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(endpoint?.is_default ?? false);
  const [api, setApi] = useState<EndpointApi>(endpoint?.api ?? 'chat');
  const [template, setTemplate] = useState<InstructTemplateId>(endpoint?.instruct_template ?? 'chatml');
  const [roles, setRoles] = useState<EndpointRole[]>(endpoint?.roles ?? []);
  const writes = useWrites(refreshedByRecords);
  const ids = {
    name: useId(),
    url: useId(),
    model: useId(),
    key: useId(),
    isDefault: useId(),
    api: useId(),
    template: useId(),
  };

  const save = async () => {
    const fields = {
      name: name.trim(),
      base_url: baseUrl.trim(),
      model: model.trim(),
      is_default: isDefault,
      api,
      instruct_template: template,
      roles,
      ...(apiKey === '' ? {} : { api_key: apiKey }),
    };
    if (await writes.run(endpoint === null ? create(fields) : update(endpoint, fields), 'Not saved', 'Saved')) done();
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
          placeholder='My Ollama'
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.url}>Address</Label>
        <Input
          id={ids.url}
          required
          type='url'
          inputMode='url'
          value={baseUrl}
          maxLength={LIMITS.endpoint_url_characters}
          placeholder='http://localhost:11434/v1'
          className='h-11'
          onChange={(event) => setBaseUrl(event.target.value)}
        />
        <div className='flex flex-wrap gap-2' role='group' aria-label='Fill in a known server'>
          {KNOWN_ENDPOINTS.map((known) => (
            <Button
              key={known.label}
              type='button'
              variant='outline'
              size='sm'
              className='h-9'
              onClick={() => setBaseUrl(known.base_url)}
            >
              {known.label}
            </Button>
          ))}
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.model}>Model</Label>
        <Input
          id={ids.model}
          required
          value={model}
          maxLength={LIMITS.model_name_characters}
          placeholder='llama3.1:8b'
          className='h-11'
          autoCapitalize='off'
          autoCorrect='off'
          onChange={(event) => setModel(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.key}>API key</Label>
        <Input
          id={ids.key}
          type='password'
          autoComplete='off'
          value={apiKey}
          maxLength={LIMITS.api_key_characters}
          placeholder={
            endpoint?.has_api_key === true ? 'Saved; type a new one to replace it' : 'Only if the endpoint needs one'
          }
          className='h-11'
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <span id={ids.api} className='text-sm font-medium'>
          API
        </span>
        <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.api} className='flex flex-wrap gap-2'>
          {(
            [
              ['chat', 'Chat completions'],
              ['text', 'Text completion'],
            ] as const
          ).map(([value, label]) => (
            <ChoiceChip key={value} checked={api === value} className='h-11 px-4' onClick={() => setApi(value)}>
              {label}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {api === 'text' && (
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.template}>Instruct template</Label>
          <p id={`${ids.template}-hint`} className='text-xs text-muted-foreground'>
            The markup the model was trained on. Its stop strings are added to the preset’s.
          </p>
          <select
            id={ids.template}
            value={template}
            aria-describedby={`${ids.template}-hint`}
            className='h-11 rounded-md border bg-background px-3 text-sm'
            onChange={(event) => setTemplate(event.target.value as InstructTemplateId)}
          >
            {(Object.keys(INSTRUCT_TEMPLATES) as InstructTemplateId[]).map((id) => (
              <option key={id} value={id}>
                {INSTRUCT_TEMPLATES[id].name}
              </option>
            ))}
          </select>
        </div>
      )}
      <fieldset className='grid gap-2'>
        <legend className='text-sm font-medium'>Used for</legend>
        <p className='text-xs text-muted-foreground'>
          Run each job on the model that suits it: a big model for replies, a small fast one for summaries.
        </p>
        <div className='flex flex-wrap gap-2'>
          {ENDPOINT_ROLES.map((role) => (
            <label key={role} className='flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm'>
              <input
                type='checkbox'
                className='size-5'
                checked={roles.includes(role)}
                onChange={() => setRoles(roles.includes(role) ? roles.filter((one) => one !== role) : [...roles, role])}
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <Label htmlFor={ids.isDefault}>Use for new chats</Label>
        <Switch id={ids.isDefault} checked={isDefault} onCheckedChange={setIsDefault} />
      </div>
      <WriteProblem problem={writes.problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === '' || baseUrl.trim() === '' || model.trim() === ''}>
        Save
      </Button>
    </form>
  );
}

export function EndpointManager(): ReactElement {
  const list = endpoints.useList();
  const { remove } = endpoints.useActions();
  return (
    <div className='grid gap-8'>
      <ManagedList
        what='model'
        rows={list.data}
        error={list.error}
        onRetry={() => list.mutate()}
        summary={(row) => `${row.model} · ${row.base_url}`}
        isDefault={(row) => row.is_default}
        newLabel='Add a model'
        emptyText='No models yet. Add an OpenAI-compatible endpoint so characters can reply.'
        editor={(row, done) => <EndpointForm endpoint={row} done={done} />}
        onDelete={(row) => void remove(row)}
      />
      <ModelStatus models={list.data ?? []} check={pingEndpoint} />
    </div>
  );
}
