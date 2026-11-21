// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every chat, the newest first, with who is in it; tap one to carry on. Search by title, cast or
 * tag, and filter by folder (A12). The install shortcut "New chat" (`/play?new=1`) opens the picker
 * straight away.
 */
import { useHidden } from 'zephyrex/hooks/useWrites';
import { FileUp, MessageSquarePlus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, type ReactElement, useId, useMemo, useRef, useState } from 'react';
import { Badge } from 'zephyrex/ui/badge';
import { Input } from 'zephyrex/ui/input';
import { FolderChips } from '~/components/common/FolderChips';
import { chatMatches, type FolderFilter, foldersOf, inFolder, searchMessages } from '~/features/chat/library';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { useCast } from '~/features/data/cast';
import { characters, chats, endpoints, messages, idOf } from '~/features/data/records';
import { campaignPlays } from '~/features/data/playRecords';
import { chatFromJsonl } from '~/features/import/stChat';
import { writeImportedChat } from './importChat';
import { initials } from '../characters/CharacterTile';
import { FirstRun } from './FirstRun';
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

/**
 * `campaigns`: the person's campaigns (a chat with a play state, docs/DESIGN.md, The play model);
 * `sandbox`: one-on-one and group roleplay, SillyTavern's chats.
 */
export function ChatLibrary({ kind = 'sandbox' }: { kind?: 'campaigns' | 'sandbox' }): ReactElement {
  const allChats = chats.useList();
  const plays = campaignPlays.useList();
  const campaignIds = useMemo(() => new Set((plays.data ?? []).map((play) => play.chat_id)), [plays.data]);
  const list = {
    ...allChats,
    data:
      allChats.data === undefined || plays.data === undefined
        ? undefined
        : allChats.data.filter((chat) => campaignIds.has(chat.id) === (kind === 'campaigns')),
    error: allChats.error ?? plays.error,
    mutate: allChats.mutate,
  };
  const cast = useCast();
  const models = endpoints.useList();
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
  const hidden = useHidden(list.data ?? [], idOf);
  const castById = useMemo(() => new Map((cast.data ?? []).map((character) => [character.id, character])), [cast.data]);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<FolderFilter>({ kind: 'all' });
  const searchId = useId();
  const castNames = useMemo(
    () => new Map((cast.data ?? []).map((character) => [character.id, character.name])),
    [cast.data],
  );
  const folders = foldersOf(list.data ?? []);
  const all = hidden.shown;
  // Newest first, whatever order the back end answers in.
  // Inside messages too, once three characters are typed (A12): every message is read for it.
  const allMessages = messages.useList(undefined, query.trim().length >= 3);
  const found = searchMessages(allMessages.data ?? [], query);
  const shown = all
    .filter((chat) => inFolder(chat, folder) && chatMatches(chat, castNames, query))
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

  return (
    <div className='space-y-4'>
      {kind === 'campaigns' ? (
        <div className='flex flex-wrap gap-2'>
          <Button asChild className='h-11'>
            <Link href='/campaigns'>
              <MessageSquarePlus aria-hidden /> Start a campaign
            </Link>
          </Button>
        </div>
      ) : (
        <div className='flex flex-wrap gap-2'>
          <Button type='button' className='h-11' onClick={() => setPicking(true)}>
            <MessageSquarePlus aria-hidden /> New chat
          </Button>
          <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
            <FileUp aria-hidden /> Import chat
          </Button>
          <input
            ref={fileInput}
            type='file'
            accept='.jsonl,application/jsonl,application/x-ndjson'
            multiple
            hidden
            onChange={(event) => void importFiles(event)}
          />
        </div>
      )}
      {all.length > 0 && (
        <div className='grid gap-2'>
          <div className='relative'>
            <label htmlFor={searchId} className='sr-only'>
              Search chats
            </label>
            <Search
              className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
              aria-hidden
            />
            <Input
              id={searchId}
              type='search'
              value={query}
              placeholder='Search by title, character or tag'
              className='h-11 pl-9'
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <FolderChips folders={folders} value={folder} onChange={setFolder} />
        </div>
      )}
      {list.error !== undefined && <LoadProblem what='your chats' error={list.error} onRetry={() => list.mutate()} />}
      {list.data === undefined && list.error === undefined && <SkeletonRows rows={4} avatar />}
      {kind === 'campaigns' && list.data !== undefined && all.length === 0 && !hidden.pending && (
        <div className='grid gap-3 rounded-lg border p-4 text-muted-foreground'>
          <p>No campaigns yet. Pick a scenario and start one: you choose the party, and you can take any seat at any time.</p>
          <Button asChild className='h-11 w-full sm:w-auto'>
            <Link href='/campaigns'>Pick a scenario</Link>
          </Button>
        </div>
      )}
      {kind === 'sandbox' && list.data !== undefined && all.length === 0 && !hidden.pending && (
        <FirstRun
          hasModel={(models.data ?? []).length > 0}
          hasCharacter={(cast.data ?? []).length > 0}
          onNewChat={() => setPicking(true)}
        />
      )}
      {all.length > 0 && shown.length === 0 && found.length === 0 && (
        <p className='p-4 text-center text-muted-foreground'>No chat matches.</p>
      )}
      {found.length > 0 && (
        <section aria-labelledby='found-lines' className='grid gap-2'>
          <h2 id='found-lines' className='text-sm font-semibold'>
            In the chats
          </h2>
          <ul className='divide-y rounded-xl border empty:hidden'>
            {found.map((line) => (
              <li key={line.messageId}>
                <Link
                  href={`/play/${line.chatId}?at=${line.messageId}`}
                  className='block min-h-11 p-3 text-sm hover:bg-accent'
                >
                  <span className='block text-xs text-muted-foreground'>
                    {all.find((chat) => chat.id === line.chatId)?.title ?? 'A chat'}
                  </span>
                  <span className='[overflow-wrap:anywhere]'>{line.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className={shown.length === 0 ? 'hidden' : 'divide-y rounded-xl border'}>
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
              <span className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
                {lastActive(chat.updated_at)}
                {chat.folder !== '' && <span>· {chat.folder}</span>}
                {chat.tags.map((tag) => (
                  <Badge key={tag} variant='secondary' className='text-[0.7rem]'>
                    {tag}
                  </Badge>
                ))}
              </span>
            </Link>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='relative z-10 size-11'
              aria-label={`Delete ${chat.title}`}
              onClick={() => {
                hidden.hide([chat.id]);
                deferWithUndo(
                  `${chat.title} deleted`,
                  () => void remove(chat),
                  () => hidden.show([chat.id]),
                );
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <NewChat open={picking} onOpenChange={setPicking} campaignId={params.get('campaign')} />
    </div>
  );
}
