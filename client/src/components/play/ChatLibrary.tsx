// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every chat, the newest first, with who is in it; tap one to carry on. The install shortcut
 * "New chat" (`/play?new=1`) opens the picker straight away.
 */
import { FileUp, MessageSquarePlus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, type ReactElement, useMemo, useRef, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { characters, chats, messages } from '~/features/data/records';
import { chatFromJsonl } from '~/features/import/stChat';
import { writeImportedChat } from './importChat';
import { initials } from '../characters/CharacterTile';
import { NewChat } from './NewChat';

/** "Today 14:05", "Yesterday", or the date: when a chat was last written in. */
export function lastActive(stamp: string | null, now: Date = new Date()): string {
  if (stamp === null) return '';
  const when = new Date(`${stamp.replace(/\d{3}$/, '')}Z`);
  if (Number.isNaN(when.getTime())) return '';
  const day = (date: Date) => date.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(when) === day(now)) return `Today ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (day(when) === day(yesterday)) return 'Yesterday';
  return when.toLocaleDateString();
}

export function ChatLibrary(): ReactElement {
  const list = chats.useList();
  const cast = characters.useList();
  const { remove, create: createChat } = chats.useActions();
  const { create: createCharacter } = characters.useActions();
  const { create: createMessage } = messages.useActions();
  const fileInput = useRef<HTMLInputElement>(null);

  /** SillyTavern chats: each matched to the character of that name, who is made if there is none. */
  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const imported = chatFromJsonl(await file.text());
        const name = imported.characterName || 'Imported character';
        const existing = (cast.data ?? []).find((character) => character.name.toLowerCase() === name.toLowerCase());
        const character = existing ?? (await createCharacter({ name }));
        return writeImportedChat(imported, character.id, { createChat, createMessage });
      }),
    );
    const done = results.filter((result) => result.status === 'fulfilled').length;
    if (done > 0) notify(done === 1 ? 'Chat imported' : `${done} chats imported`);
    if (done < files.length) notify('Some files were not imported', 'Each must be a SillyTavern chat (.jsonl).');
  };
  const params = useSearchParams();
  const [picking, setPicking] = useState(params.get('new') === '1');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const castById = useMemo(() => new Map((cast.data ?? []).map((character) => [character.id, character])), [cast.data]);
  // Newest first, whatever order the back end answers in.
  const shown = [...(list.data ?? [])].filter((chat) => !hidden.has(chat.id)).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' className='h-11' onClick={() => setPicking(true)}>
          <MessageSquarePlus aria-hidden /> New chat
        </Button>
        <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> Import chat
        </Button>
        <input ref={fileInput} type='file' accept='.jsonl,application/jsonl,application/x-ndjson' multiple hidden onChange={(event) => void importFiles(event)} />
      </div>
      {list.error !== undefined && <LoadProblem what='your chats' error={list.error} onRetry={() => list.mutate()} />}
      {list.data === undefined && list.error === undefined && <SkeletonRows rows={4} avatar />}
      {list.data !== undefined && shown.length === 0 && (
        <p className='rounded-xl border border-dashed p-8 text-center text-muted-foreground'>No chats yet. Start one with a character.</p>
      )}
      <ul className='divide-y rounded-xl border'>
        {shown.map((chat) => (
          <li key={chat.id} className='relative flex items-center gap-3 p-3'>
            <div className='flex -space-x-3'>
              {chat.character_ids.slice(0, 3).map((id) => {
                const character = castById.get(id);
                return (
                  <Avatar key={id} className='size-11 border-2 border-background'>
                    {character !== undefined && character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
                    <AvatarFallback>{initials(character?.name ?? '?')}</AvatarFallback>
                  </Avatar>
                );
              })}
            </div>
            <Link href={`/play/${chat.id}`} className='min-w-0 flex-1 after:absolute after:inset-0'>
              <span className='block truncate font-medium'>{chat.title}</span>
              <span className='block text-xs text-muted-foreground'>{lastActive(chat.updated_at)}</span>
            </Link>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='relative z-10 size-11'
              aria-label={`Delete ${chat.title}`}
              onClick={() => {
                setHidden(new Set([...hidden, chat.id]));
                deferWithUndo(`${chat.title} deleted`, () => void remove(chat), () => setHidden(new Set([...hidden].filter((id) => id !== chat.id))));
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <NewChat open={picking} onOpenChange={setPicking} />
    </div>
  );
}
