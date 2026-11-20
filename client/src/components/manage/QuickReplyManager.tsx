// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Quick replies (A32, A38): buttons above the composer for lines you send often. Each sends its
 * line at once or fills it in for you to edit, to the story or as table talk. `{{char}}` and
 * `{{user}}` are filled with the character about to speak and your persona.
 */
import { type ReactElement, useId, useState } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { LIMITS, QUICK_REPLY } from '~/contract';
import { type QuickReply, quickReplies } from '~/features/data/records';
import { ManagedList } from './ManagedList';

const ACTION_LABELS = { send: 'Send at once', fill: 'Fill in to edit' } as const;
const CHANNEL_LABELS = { ic: 'In the story', ooc: 'Table talk' } as const;
const CHIP = 'h-11 rounded-full border px-4 text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground';

function Chips<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onChange: (next: T) => void }): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-2'>
      <span id={id} className='text-sm font-medium'>
        {label}
      </span>
      <div ref={chipGroup} role='radiogroup' aria-labelledby={id} className='flex flex-wrap gap-2'>
        {options.map((option) => (
          <ChoiceChip key={option} checked={value === option} className={CHIP} onClick={() => onChange(option)}>
            {labels[option]}
          </ChoiceChip>
        ))}
      </div>
    </div>
  );
}

export function QuickReplyForm({ reply, done }: { reply: QuickReply | null; done: () => void }): ReactElement {
  const { create, update } = quickReplies.useActions();
  const [label, setLabel] = useState(reply?.label ?? '');
  const [message, setMessage] = useState(reply?.message ?? '');
  const [action, setAction] = useState<QuickReply['action']>(reply?.action ?? 'send');
  const [channel, setChannel] = useState<QuickReply['channel']>(reply?.channel ?? 'ic');
  const [enabled, setEnabled] = useState(reply?.enabled ?? true);
  const [position, setPosition] = useState(String(reply?.position ?? 0));
  const [problem, setProblem] = useState<string | null>(null);
  const ids = { label: useId(), message: useId(), enabled: useId(), position: useId() };

  const save = async () => {
    const fields = { label: label.trim(), message: message.trim(), action, channel, enabled, position: Math.max(0, Number.parseInt(position, 10) || 0) };
    const failed = await writeProblem(reply === null ? create(fields) : update(reply, fields), 'Not saved');
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
        <Label htmlFor={ids.label}>Button label</Label>
        <Input id={ids.label} required value={label} maxLength={LIMITS.quick_reply_label_characters} placeholder='Look around' className='h-11' onChange={(event) => setLabel(event.target.value)} />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.message}>Line</Label>
        <p id={`${ids.message}-hint`} className='text-xs text-muted-foreground'>
          {'{{char}}'} is the character about to speak; {'{{user}}'} is you.
        </p>
        <Textarea id={ids.message} required rows={3} value={message} maxLength={LIMITS.message_characters} aria-describedby={`${ids.message}-hint`} onChange={(event) => setMessage(event.target.value)} />
      </div>
      <Chips label='When pressed' options={QUICK_REPLY.actions} labels={ACTION_LABELS} value={action} onChange={setAction} />
      <Chips label='Goes to' options={QUICK_REPLY.channels} labels={CHANNEL_LABELS} value={channel} onChange={setChannel} />
      <div className='grid grid-cols-2 gap-3'>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.position}>Order</Label>
          <Input id={ids.position} type='number' inputMode='numeric' min={0} className='h-11' value={position} onChange={(event) => setPosition(event.target.value)} />
        </div>
        <div className='flex min-h-11 items-end justify-between gap-3 pb-2'>
          <Label htmlFor={ids.enabled}>Shown</Label>
          <Switch id={ids.enabled} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <WriteProblem problem={problem} />
      <Button type='submit' className='h-11' disabled={label.trim() === '' || message.trim() === ''}>
        Save
      </Button>
    </form>
  );
}

export function QuickReplyManager(): ReactElement {
  const list = quickReplies.useList();
  const { remove } = quickReplies.useActions();
  return (
    <ManagedList
      what='quick reply'
      rows={list.data?.map((row) => ({ ...row, name: row.label }))}
      error={list.error}
      onRetry={() => list.mutate()}
      summary={(row) => `${row.enabled ? '' : 'Hidden · '}${ACTION_LABELS[row.action]} · ${CHANNEL_LABELS[row.channel]} · ${row.message}`}
      newLabel='New quick reply'
      emptyText='No quick replies yet. Add the lines you send often, e.g. “I look around.”'
      editor={(row, done) => <QuickReplyForm reply={row} done={done} />}
      onDelete={(row) => void remove(row)}
    />
  );
}
