// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The models replies come from: any OpenAI-compatible endpoint (Ollama, llama.cpp, vLLM, a gateway
 * such as Bifrost, or a hosted API). An API key is write-only: once saved it is never shown again.
 */
import { type ReactElement, useId, useState } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { LIMITS } from '~/contract';
import { type ModelEndpoint, endpoints } from '~/features/data/records';
import { ManagedList } from './ManagedList';

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
  const ids = { name: useId(), url: useId(), model: useId(), key: useId(), isDefault: useId() };

  const save = async () => {
    const fields = { name: name.trim(), base_url: baseUrl.trim(), model: model.trim(), is_default: isDefault, ...(apiKey === '' ? {} : { api_key: apiKey }) };
    try {
      if (endpoint === null) await create(fields);
      else await update(endpoint, fields);
      done();
    } catch (error) {
      notify('Not saved', error instanceof Error ? error.message : undefined);
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
        <Label htmlFor={ids.name}>Name</Label>
        <Input id={ids.name} required value={name} maxLength={LIMITS.name_characters} placeholder='My Ollama' className='h-11' onChange={(event) => setName(event.target.value)} />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.url}>Address</Label>
        <Input id={ids.url} required type='url' inputMode='url' value={baseUrl} maxLength={LIMITS.endpoint_url_characters} placeholder='http://localhost:11434/v1' className='h-11' onChange={(event) => setBaseUrl(event.target.value)} />
        <div className='flex flex-wrap gap-2' role='group' aria-label='Fill in a known server'>
          {KNOWN_ENDPOINTS.map((known) => (
            <Button key={known.label} type='button' variant='outline' size='sm' className='h-9' onClick={() => setBaseUrl(known.base_url)}>
              {known.label}
            </Button>
          ))}
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.model}>Model</Label>
        <Input id={ids.model} required value={model} maxLength={LIMITS.model_name_characters} placeholder='llama3.1:8b' className='h-11' autoCapitalize='off' autoCorrect='off' onChange={(event) => setModel(event.target.value)} />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.key}>API key</Label>
        <Input
          id={ids.key}
          type='password'
          autoComplete='off'
          value={apiKey}
          maxLength={LIMITS.api_key_characters}
          placeholder={endpoint?.has_api_key === true ? 'Saved; type a new one to replace it' : 'Only if the endpoint needs one'}
          className='h-11'
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <Label htmlFor={ids.isDefault}>Use for new chats</Label>
        <Switch id={ids.isDefault} checked={isDefault} onCheckedChange={setIsDefault} />
      </div>
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
  );
}
