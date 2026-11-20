// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The context inspector (A18): every message the model would be given, in order, with its role and
 * estimated tokens; how full the window is; how many old turns were left out; and the lore entries
 * that went in. Read-only.
 */
import type { ReactElement } from 'react';
import { Badge } from 'zephyrex/ui/badge';
import { cn } from '~/lib/utils';
import type { InspectedPrompt } from '~/features/chat/inspectPrompt';

const ROLE_LABEL = { system: 'System', user: 'User', assistant: 'Character' } as const;

export function ContextInspector({ prompt }: { prompt: InspectedPrompt }): ReactElement {
  const budget = prompt.context_tokens - prompt.max_tokens;
  const percent = budget <= 0 ? 100 : Math.min(100, Math.round((prompt.tokens / budget) * 100));
  return (
    <div className='grid gap-4'>
      <section aria-labelledby='context-summary' className='grid gap-2'>
        <h3 id='context-summary' className='text-sm font-semibold'>
          The window
        </h3>
        <p className='text-sm'>
          About {prompt.tokens.toLocaleString()} of {budget.toLocaleString()} tokens ({percent}%), leaving{' '}
          {prompt.max_tokens.toLocaleString()} for the reply.
        </p>
        <div className='h-2 overflow-hidden rounded-full bg-muted' role='img' aria-label={`${percent}% of the window used`}>
          <div className='h-full bg-primary' style={{ width: `${percent}%` }} />
        </div>
        <p className='text-sm text-muted-foreground'>
          {prompt.dropped === 0
            ? 'Nothing was left out.'
            : `${prompt.dropped} older ${prompt.dropped === 1 ? 'turn was' : 'turns were'} left out to fit.`}{' '}
          {prompt.active_lore.length === 0
            ? 'No lore entries went in.'
            : `${prompt.active_lore.length} lore ${prompt.active_lore.length === 1 ? 'entry' : 'entries'} went in.`}
        </p>
      </section>
      <section aria-labelledby='context-messages' className='grid gap-2'>
        <h3 id='context-messages' className='text-sm font-semibold'>
          What the model reads, in order
        </h3>
        <ol className='grid gap-2'>
          {prompt.messages.map((message, index) => (
            // Messages have no identity beyond their place in this prompt.
            <li key={index} className={cn('rounded-lg border p-3 text-sm', message.role === 'system' && 'bg-muted/50')}>
              <div className='mb-1 flex items-center justify-between gap-2'>
                <Badge variant={message.role === 'system' ? 'secondary' : 'outline'}>{ROLE_LABEL[message.role]}</Badge>
                <span className='text-xs text-muted-foreground'>≈ {message.tokens} tokens</span>
              </div>
              <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{message.content}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
