// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The data bank (A41): notes and documents the model draws on when the story turns to them. Each is
 * for every chat, one chat, or one character. A text or Markdown file can be read in.
 */
import { FileUp } from 'lucide-react';
import { type ChangeEvent, type ReactElement, useId, useRef, useState } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { notify } from 'zephyrex/hooks/useToast';
import { writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { DATA_BANK, LIMITS } from '~/contract';
import { characters, chats, type DataDocument, dataDocuments } from '~/features/data/records';
import { ManagedList } from './ManagedList';

type Scope = DataDocument['scope'];
const SCOPE_LABELS: Record<Scope, string> = { global: 'Every chat', chat: 'One chat', character: 'One character' };
const CHIP = 'h-11 rounded-full border px-4 text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground';

function DocumentForm({ document, done }: { document: DataDocument | null; done: () => void }): ReactElement {
  const { create, update } = dataDocuments.useActions();
  const chatList = chats.useList();
  const cast = characters.useList();
  const [name, setName] = useState(document?.name ?? '');
  const [text, setText] = useState(document?.text ?? '');
  const [scope, setScope] = useState<Scope>(document?.scope ?? 'global');
  const [scopeId, setScopeId] = useState<string | null>(document?.scope_id ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), text: useId(), scope: useId(), target: useId() };
  const targets = scope === 'chat' ? (chatList.data ?? []).map((chat) => ({ id: chat.id, name: chat.title })) : (cast.data ?? []).map((one) => ({ id: one.id, name: one.name }));

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setText((await file.text()).slice(0, LIMITS.data_document_characters));
    if (name.trim() === '') setName(file.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.name_characters));
  };

  const save = async () => {
    // A document keeps its scope once made: only its name and text change.
    const writing =
      document === null
        ? create({ name: name.trim(), text, scope, scope_id: scope === 'global' ? null : scopeId })
        : update(document, { name: name.trim(), text });
    const failed = await writeProblem(writing, 'Not saved');
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
        <Label htmlFor={ids.name}>Name</Label>
        <Input id={ids.name} required value={name} maxLength={LIMITS.name_characters} placeholder='The Kestrel’s deck plan' className='h-11' onChange={(event) => setName(event.target.value)} />
      </div>
      {document === null && (
        <div className='grid gap-2'>
          <span id={ids.scope} className='text-sm font-medium'>
            For
          </span>
          <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.scope} className='flex flex-wrap gap-2'>
            {DATA_BANK.scopes.map((one) => (
              <ChoiceChip
                key={one}
                checked={scope === one}
                className={CHIP}
                onClick={() => {
                  setScope(one);
                  setScopeId(null);
                }}
              >
                {SCOPE_LABELS[one]}
              </ChoiceChip>
            ))}
          </div>
          {scope !== 'global' && (
            <>
              <Label htmlFor={ids.target}>{scope === 'chat' ? 'Chat' : 'Character'}</Label>
              <select id={ids.target} required value={scopeId ?? ''} className='h-11 rounded-md border bg-background px-3 text-sm' onChange={(event) => setScopeId(event.target.value === '' ? null : event.target.value)}>
                <option value=''>Choose…</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
      <div className='grid gap-1.5'>
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor={ids.text}>Text</Label>
          <Button type='button' variant='ghost' className='h-11' onClick={() => fileInput.current?.click()}>
            <FileUp aria-hidden /> Read a file
          </Button>
          <input ref={fileInput} type='file' accept='.txt,.md,text/plain,text/markdown' hidden onChange={(event) => void readFile(event)} />
        </div>
        <p id={`${ids.text}-hint`} className='text-xs text-muted-foreground'>
          Split it with blank lines: each part is found on its own when the story mentions what it is about.
        </p>
        <Textarea id={ids.text} required rows={10} value={text} maxLength={LIMITS.data_document_characters} aria-describedby={`${ids.text}-hint`} onChange={(event) => setText(event.target.value)} />
      </div>
      <WriteProblem problem={problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === '' || text.trim() === '' || (document === null && scope !== 'global' && scopeId === null)}>
        Save
      </Button>
    </form>
  );
}

export function DataBankManager(): ReactElement {
  const list = dataDocuments.useList();
  const { remove } = dataDocuments.useActions();
  return (
    <ManagedList
      what='document'
      rows={list.data}
      error={list.error}
      onRetry={() => list.mutate()}
      summary={(row) => `${SCOPE_LABELS[row.scope]} · ${row.text.slice(0, 80)}`}
      newLabel='New document'
      emptyText='No documents yet. Add notes the model can draw on: places, rules, history.'
      editor={(row, done) => <DocumentForm document={row} done={done} />}
      onDelete={(row) => void remove(row)}
    />
  );
}
