// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The play surface: one chat's branch as a column of turns, the reply being written as it streams,
 * and the composer pinned to the bottom. Out-of-character table talk is sent and kept like any
 * message but never asks for a reply and never reaches the model (docs/DESIGN.md).
 *
 * The chat is a tree: sending adds a child of the message shown last; a reply's alternatives are
 * swipes of one message; "Branch from here" makes the next message a new fork.
 */
import { Download, Ellipsis, ScanText, Settings2 } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'zephyrex/ui/dropdown-menu';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { useWakeLock } from '~/features/browser/useWakeLock';
import { branchTo, latestLeaf } from '~/features/chat/branch';
import type { ComposerChannel } from '~/features/chat/outgoing';
import { nextSpeaker, siblingsOf } from '~/features/chat/turns';
import { type InspectedPrompt, inspectPrompt, summarizeBranch } from '~/features/chat/inspectPrompt';
import { chatToJsonl, chatToText } from '~/features/import/stChat';
import { applyRegex, type RegexPlacement } from '~/features/chat/regex';
import { useReply } from '~/features/chat/useReply';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import { type Character, type Chat, type ChatMessage, characters, chats, endpoints, lorebooks, messages, type Persona, personas, presets, regexScripts } from '~/features/data/records';
import { initials } from '../characters/CharacterTile';
import { ChatSettings, type LoreSettingsValue } from './ChatSettings';
import { Composer } from './Composer';
import { ContextInspector } from './ContextInspector';
import { MessageItem, type MessageView } from './MessageItem';

const NARRATOR = 'Narrator';
const YOU = 'You';

/** What each turn of the branch shows: who said it, which alternative, and where it forks. */
export function messageViews(
  branch: readonly ChatMessage[],
  all: readonly ChatMessage[],
  cast: ReadonlyMap<string, Pick<Character, 'name' | 'avatar'>>,
  persona: Pick<Persona, 'name' | 'avatar'> | null,
): MessageView[] {
  return branch.map((message) => {
    const character = message.speaker_character_id === null ? undefined : cast.get(message.speaker_character_id);
    const speaker = message.role === 'user' ? (persona?.name ?? YOU) : message.role === 'character' ? (character?.name ?? NARRATOR) : NARRATOR;
    const avatar = message.role === 'user' ? (persona?.avatar ?? null) : (character?.avatar ?? null);
    const { siblings, index } = siblingsOf(all, message);
    return {
      id: message.id,
      role: message.role,
      channel: message.channel,
      speaker,
      avatar,
      text: message.swipes[message.swipe_index] ?? '',
      swipe: { index: message.swipe_index, count: message.swipes.length },
      fork: { index, count: siblings.length },
      bookmarked: message.bookmarked,
    };
  });
}

function ChatSurface({ chat }: { chat: Chat }): ReactElement {
  const list = messages.useList({ chat_id: chat.id });
  const cast = characters.useList();
  const personaList = personas.useList();
  const presetList = presets.useList();
  const endpointList = endpoints.useList();
  const lorebookList = lorebooks.useList();
  const scriptList = regexScripts.useList();
  const scripts = scriptList.data ?? [];
  const { create, update, remove } = messages.useActions();
  const { update: updateChat } = chats.useActions();
  const reply = useReply();
  const [leafId, setLeafId] = useState<string | null>(null);
  const [writingAfter, setWritingAfter] = useState<{ parentId: string | null; speakerId: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspected, setInspected] = useState<InspectedPrompt | 'loading' | null>(null);
  const mobile = useIsMobile();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const end = useRef<HTMLDivElement>(null);

  // Oldest first, whatever order the back end answers in: the tree's latest leaf is the last child.
  const all = useMemo(
    () => [...(list.data ?? [])].filter((message) => !hidden.has(message.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [list.data, hidden],
  );
  const leaf = leafId !== null && all.some((message) => message.id === leafId) ? leafId : (latestLeaf(all)?.id ?? null);
  const branch = useMemo(() => (leaf === null ? [] : branchTo(all, leaf)), [all, leaf]);
  const castById = useMemo(() => new Map((cast.data ?? []).map((character) => [character.id, character])), [cast.data]);
  const persona = useMemo(() => {
    const found = personaList.data ?? [];
    return found.find((one) => one.id === chat.persona_id) ?? found.find((one) => one.is_default) ?? null;
  }, [personaList.data, chat.persona_id]);
  const { settings } = useDeviceSettings();
  const views = messageViews(branch, all, castById, persona).filter((view) => settings.showTableTalk || (view.channel !== 'ooc' && view.channel !== 'gm'));
  const writing = reply.state.status === 'writing';

  useWakeLock(writing);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [views.length, reply.state]);
  useEffect(() => {
    if (reply.state.status === 'failed') notify('No reply', reply.state.detail);
  }, [reply.state]);

  const byId = (id: string) => all.find((message) => message.id === id);

  /** Streams the next reply after `parentId`, then keeps it as a new message. */
  const replyAfter = async (parentId: string | null, path: readonly ChatMessage[]) => {
    const speakerId = nextSpeaker(chat.character_ids, path);
    if (speakerId === null) return;
    setWritingAfter({ parentId, speakerId });
    const result = await reply.write({ chat_id: chat.id, leaf_id: parentId, speaker_id: speakerId });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    const saved = await create({ chat_id: chat.id, parent_id: parentId, role: 'character', speaker_character_id: speakerId, swipes: [stored(result.text, 'ai_output')] });
    setLeafId(saved.id);
  };

  /** Text as saved, after the regex scripts that change what is stored (A33). */
  const stored = (text: string, placement: RegexPlacement) => applyRegex(text, scripts, placement, 'stored');

  const send = async (text: string, channel: ComposerChannel) => {
    const saved = await create({ chat_id: chat.id, parent_id: leaf, role: 'user', channel, swipes: [channel === 'ic' ? stored(text, 'user_input') : text] });
    setLeafId(saved.id);
    if (channel === 'ic') await replyAfter(saved.id, [...branch, saved]);
  };

  const regenerate = async (message: ChatMessage) => {
    if (message.speaker_character_id === null) return;
    setWritingAfter({ parentId: message.parent_id, speakerId: message.speaker_character_id });
    const result = await reply.write({ chat_id: chat.id, leaf_id: message.parent_id, speaker_id: message.speaker_character_id });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    await update(message, { swipes: [...message.swipes, stored(result.text, 'ai_output')], swipe_index: message.swipes.length });
  };

  /** Carries on the shown alternative of a character's message, where it stopped. */
  const continueMessage = async (message: ChatMessage) => {
    if (message.speaker_character_id === null) return;
    setWritingAfter({ parentId: message.id, speakerId: message.speaker_character_id });
    const result = await reply.write({ chat_id: chat.id, leaf_id: message.id, speaker_id: message.speaker_character_id, mode: 'continue' });
    setWritingAfter(null);
    if (result === null || result.text === '') return;
    await update(message, { swipes: message.swipes.map((text, index) => (index === message.swipe_index ? stored(`${text}${result.text}`, 'ai_output') : text)) });
  };

  /** The person's own next line, written by the model, for the composer. */
  const impersonate = async (): Promise<string | null> => {
    const result = await reply.write({ chat_id: chat.id, leaf_id: leaf, speaker_id: nextSpeaker(chat.character_ids, branch), mode: 'impersonate' });
    return result?.text ?? null;
  };

  /** A summary of the shown branch, for chat settings to fill in. */
  const summarize = async (): Promise<string | null> => {
    try {
      const summary = await summarizeBranch({ chat_id: chat.id, leaf_id: leaf, speaker_id: nextSpeaker(chat.character_ids, branch) });
      if (summary.dropped > 0) notify('The oldest turns did not fit', `${summary.dropped} were left out of the summary.`);
      return summary.text;
    } catch (error) {
      notify('No summary', error instanceof Error ? error.message : undefined);
      return null;
    }
  };

  const openInspector = async () => {
    setInspected('loading');
    try {
      setInspected(await inspectPrompt({ chat_id: chat.id, leaf_id: leaf, speaker_id: nextSpeaker(chat.character_ids, branch) }));
    } catch (error) {
      setInspected(null);
      notify('The prompt could not be read', error instanceof Error ? error.message : undefined);
    }
  };

  /** The shown branch as a file: SillyTavern's JSONL, or plain text. */
  const exportBranch = (format: 'jsonl' | 'text') => {
    // Every turn of the branch, table talk included, whatever this device shows.
    const speakers = messageViews(branch, all, castById, persona);
    const named = branch.map((message, index) => ({ ...message, name: speakers[index]?.speaker ?? NARRATOR }));
    const content =
      format === 'jsonl'
        ? chatToJsonl({ characterName: castById.get(chat.character_ids[0] ?? '')?.name ?? '', userName: persona?.name ?? YOU, createdAt: chat.created_at }, named)
        : chatToText(named);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'jsonl' ? 'application/jsonl' : 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${chat.title.replace(/[^\w.-]+/g, '_')}.${format === 'jsonl' ? 'jsonl' : 'txt'}` });
    link.click();
    URL.revokeObjectURL(url);
  };

  const fork = (message: ChatMessage, step: -1 | 1) => {
    const { siblings, index } = siblingsOf(all, message);
    const target = siblings[index + step];
    if (target !== undefined) setLeafId(latestLeaf(all, target.id)?.id ?? target.id);
  };

  const deleteMessage = (message: ChatMessage) => {
    setHidden(new Set([...hidden, message.id]));
    setLeafId(message.parent_id);
    deferWithUndo(
      'Message deleted',
      () => void remove(message),
      () => setHidden(new Set([...hidden].filter((id) => id !== message.id))),
    );
  };

  if (list.error !== undefined) return <LoadProblem what='this chat' error={list.error} onRetry={() => list.mutate()} />;

  const pending = writingAfter === null ? undefined : castById.get(writingAfter.speakerId);
  const options = <T extends { id: string; name: string }>(rows: readonly T[] | undefined) => (rows ?? []).map(({ id, name }) => ({ id, name }));

  return (
    <div className='flex min-h-[calc(100svh-4rem)] flex-col'>
      <div className='mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2'>
        <ul className='flex min-w-0 -space-x-2' aria-label='In this chat'>
          {chat.character_ids.map((id) => {
            const character = castById.get(id);
            return (
              <li key={id}>
                <Avatar className='size-9 border-2 border-background'>
                  {character?.avatar !== undefined && character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
                  <AvatarFallback>{initials(character?.name ?? '?')}</AvatarFallback>
                </Avatar>
                <span className='sr-only'>{character?.name ?? 'A character'}</span>
              </li>
            );
          })}
        </ul>
        <div className='flex gap-1'>
          <Button type='button' variant='ghost' className='h-11' onClick={() => void openInspector()}>
            <ScanText aria-hidden /> Context
          </Button>
          <Button type='button' variant='ghost' className='h-11' onClick={() => setSettingsOpen(true)}>
            <Settings2 aria-hidden /> Chat settings
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type='button' variant='ghost' size='icon' className='size-11' aria-label='More for this chat'>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onSelect={() => exportBranch('jsonl')}>
                <Download aria-hidden /> Export for SillyTavern
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportBranch('text')}>
                <Download aria-hidden /> Export as text
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ol className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-3 pb-4' aria-label='Chat' aria-live='polite'>
        {list.data === undefined && <SkeletonRows rows={4} avatar />}
        {list.data !== undefined && views.length === 0 && writingAfter === null && (
          <li className='rounded-xl border border-dashed p-6 text-center text-muted-foreground'>Say something to begin.</li>
        )}
        {views.map((view) => {
          const message = byId(view.id);
          if (message === undefined) return null;
          // Display-only regex scripts (A33) change how a message looks here, never what is saved.
          const placement: RegexPlacement | null = message.role === 'user' ? 'user_input' : message.role === 'character' ? 'ai_output' : null;
          const depth = branch.length - 1 - branch.findIndex((one) => one.id === message.id);
          const shown = placement === null ? view : { ...view, text: applyRegex(view.text, scripts, placement, 'display', depth) };
          return (
            <li key={view.id}>
              <MessageItem
                message={shown}
                onSwipe={(step) => void update(message, { swipe_index: message.swipe_index + step })}
                onRegenerate={message.role === 'character' && !writing ? () => void regenerate(message) : undefined}
                onFork={(step) => fork(message, step)}
                onEdit={(text) => void update(message, { swipes: message.swipes.map((old, index) => (index === message.swipe_index ? text : old)) })}
                onBookmark={() => void update(message, { bookmarked: !message.bookmarked })}
                onBranch={() => {
                  setLeafId(message.id);
                  notify('Branching from here', 'Your next message starts a new branch.');
                }}
                onDelete={() => deleteMessage(message)}
                onContinue={message.role === 'character' && message.id === leaf && !writing ? () => void continueMessage(message) : undefined}
              />
            </li>
          );
        })}
        {writingAfter !== null && (
          <li>
            <MessageItem
              writing
              message={{
                id: 'writing',
                role: 'character',
                channel: 'ic',
                speaker: pending?.name ?? NARRATOR,
                avatar: pending?.avatar ?? null,
                text: reply.state.status === 'writing' ? reply.state.text : '',
                swipe: { index: 0, count: 1 },
                fork: { index: 0, count: 1 },
                bookmarked: false,
              }}
            />
          </li>
        )}
      </ol>
      <div ref={end} />
      <Composer
        writing={writing}
        disabled={list.data === undefined}
        onSend={(text, channel) => void send(text, channel)}
        onStop={reply.stop}
        onImpersonate={chat.character_ids.length > 0 ? impersonate : undefined}
      />
      <Sheet open={inspected !== null} onOpenChange={(open) => !open && setInspected(null)}>
        <SheetContent side={mobile ? 'bottom' : 'right'} className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>Context</SheetTitle>
            <SheetDescription>What the model would read for the next reply.</SheetDescription>
          </SheetHeader>
          <div className='p-4'>{inspected === 'loading' ? <SkeletonRows rows={5} /> : inspected !== null && <ContextInspector prompt={inspected} />}</div>
        </SheetContent>
      </Sheet>
      <ChatSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        value={{
          title: chat.title,
          persona_id: chat.persona_id,
          preset_id: chat.preset_id,
          endpoint_id: chat.endpoint_id,
          author_note: chat.author_note,
          lorebook_ids: chat.lorebook_ids,
          lore_settings: chat.lore_settings as LoreSettingsValue,
          system_prompt: chat.system_prompt,
          summary: chat.summary,
        }}
        onSummarize={summarize}
        personas={options(personaList.data)}
        presets={options(presetList.data)}
        endpoints={options(endpointList.data)}
        lorebooks={options(lorebookList.data)}
        onSave={(next) => void updateChat(chat, next)}
      />
    </div>
  );
}

export function ChatView({ id }: { id: string }): ReactElement {
  const chat = chats.useOne(id);
  if (chat.error !== undefined) return <LoadProblem what='this chat' error={chat.error} onRetry={() => chat.mutate()} />;
  if (chat.data === undefined) return <SkeletonRows rows={4} avatar />;
  return <ChatSurface chat={chat.data} />;
}
