// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * How the models are doing (A28): each one's roles and, on a check, whether its server answers, how
 * quickly, and whether it offers the model named. Checks run only when asked: a check costs the
 * server a request.
 */
import { CircleAlert, CircleCheck, RefreshCw } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import type { ModelEndpoint } from '~/features/data/records';
import type { PingResult } from '~/features/models/ping';

type Checked = PingResult | 'checking' | { failed: string };

export function ModelStatus({ models, check }: { models: readonly ModelEndpoint[]; check: (id: string) => Promise<PingResult> }): ReactElement | null {
  const [results, setResults] = useState<ReadonlyMap<string, Checked>>(new Map());
  if (models.length === 0) return null;
  const set = (id: string, value: Checked) => setResults((current) => new Map(current).set(id, value));
  const run = (id: string) => {
    set(id, 'checking');
    void check(id)
      .then((result) => set(id, result))
      .catch((error: unknown) => set(id, { failed: error instanceof Error ? error.message : 'The check could not run' }));
  };
  return (
    <section aria-labelledby='model-status' className='grid gap-3'>
      <div className='flex items-center justify-between gap-2'>
        <h2 id='model-status' className='text-lg font-semibold'>
          Status
        </h2>
        <Button type='button' variant='outline' className='h-11' onClick={() => models.forEach((model) => run(model.id))}>
          <RefreshCw aria-hidden /> Check all
        </Button>
      </div>
      <ul className='divide-y rounded-xl border'>
        {models.map((model) => {
          const result = results.get(model.id);
          return (
            <li key={model.id} className='flex flex-wrap items-center gap-3 p-3 text-sm'>
              <span className='min-w-0 flex-1'>
                <span className='block font-medium'>{model.name}</span>
                <span className='block text-xs text-muted-foreground'>
                  {model.model}
                  {model.roles.length > 0 && ` · ${model.roles.join(', ')}`}
                </span>
              </span>
              <span aria-live='polite' className='text-xs'>
                {result === 'checking' && 'Checking…'}
                {result !== undefined && result !== 'checking' && 'failed' in result && <span className='text-destructive'>{result.failed}</span>}
                {result !== undefined && result !== 'checking' && 'ok' in result && (
                  <span className={result.ok ? 'text-foreground' : 'text-destructive'}>
                    {result.ok ? <CircleCheck className='mr-1 inline size-4 text-primary' aria-hidden /> : <CircleAlert className='mr-1 inline size-4' aria-hidden />}
                    {result.detail}
                    {result.ok && ` · ${result.latency_ms} ms`}
                    {result.has_model === false && ` · ${model.model} is not offered`}
                  </span>
                )}
              </span>
              <Button type='button' variant='ghost' className='h-11' onClick={() => run(model.id)} aria-label={`Check ${model.name}`}>
                Check
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
