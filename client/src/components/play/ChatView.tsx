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
import { Download, Ellipsis, GitFork, Pause, Play, ScanText, Settings2, X } from 'lucide-react';
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
import { branchTo, latestLeaf, treeRows } from '~/features/chat/branch';
import type { ComposerChannel } from '~/features/chat/outgoing';
import { nextSpeaker, siblingsOf } from '~/features/chat/turns';
import { deviceLanguage, type InspectedPrompt, inspectPrompt, summarizeBranch, translateText } from '~/features/chat/inspectPrompt';
import { chatToJsonl, chatToText } from '~/features/import/stChat';
import { applyRegex, type RegexPlacement } from '~/features/chat/regex';
import { foldersOf } from '~/features/chat/library';
import { speak, speechSupport, voiceOf } from '~/features/speech/voice';
import { DEFAULT_USER_NAME } from '~/features/prompt/assemble';
import { expandMacros } from '~/features/prompt/macros';
import { useReply } from '~/features/chat/useReply';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import type { TextSize } from '~/features/settings/deviceSettings';
import { cn } from '~/lib/utils';
import { TABLE } from '~/contract';
import { type Character, type Chat, type ChatMessage, characters, chats, endpoints, lorebooks, messages, type Persona, personas, presets, quickReplies, regexScripts, campaigns } from '~/features/data/records';
import { initials } from '../characters/CharacterTile';
import { ChatSettings, type LoreSettingsValue } from './ChatSettings';
import { Composer } from './Composer';
import { BranchTree } from './BranchTree';
import { ContextInspector } from './ContextInspector';
import { NextSpeaker } from './NextSpeaker';
import { MessageItem, type MessageView } from './MessageItem';

/** The chat's text size on this device (A49). */
const TEXT_SIZE_CLASS: Record<TextSize, string> = { small: 'text-sm', normal: 'text-base', large: 'text-lg', larger: 'text-xl' };
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
    // The table GM (a narrator on the gm channel) speaks as the GM, out of character.
    const speaker =
      message.role === 'user' ? (persona?.name ?? YOU) : message.role === 'character' ? (character?.name ?? NARRATOR) : message.channel === 'gm' ? TABLE.gm_name : NARRATOR;
    const avatar = message.role === 'user' ? (persona?.avatar ?? null) : (character?.avatar ?? null);
    const { siblings, index } = siblingsOf(all, message);
    return {
      id: message.id,
      role: message.role,
      channel: message.channel,
      speaker,
      avatar,
      text: message.swipes[message.swipe_index] ?? '',
      images: message.images,
      xCarded: message.x_carded,
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
  const chatList = chats.useList();
  const campaignList = campaigns.useList();
  const scriptList = regexScripts.useList();
  const scripts = scriptList.data ?? [];
  const quickList = quickReplies.useList();
  const { create, update, remove } = messages.useActions();
  const { update: updateChat } = chats.useActions();
  const reply = useReply();
  const [leafId, setLeafId] = useState<string | null>(null);
  const [writingAfter, setWritingAfter] = useState<{ parentId: string | null; speakerId: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
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
  const [canSpeak] = useState(() => speechSupport().speak);
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

  /** Who the person chose to speak next in a group (A10); null lets the cast's order decide. */
  const [picked, setPicked] = useState<string | null>(null);

  /** Streams the next reply after `parentId`, then keeps it as a new message. */
  const replyAfter = async (parentId: string | null, path: readonly ChatMessage[]) => {
    // The person's pick for the next turn (A10), else the cast's order; a pick is used once.
    const speakerId = picked !== null && chat.character_ids.includes(picked) ? picked : nextSpeaker(chat.character_ids, path, chat.muted_ids);
    setPicked(null);
    if (speakerId === null) return;
    setWritingAfter({ parentId, speakerId });
    const result = await reply.write({ chat_id: chat.id, leaf_id: parentId, speaker_id: speakerId });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    const saved = await create({ chat_id: chat.id, parent_id: parentId, role: 'character', speaker_character_id: speakerId, swipes: [stored(result.text, 'ai_output')] });
    if (settings.readAloud) readAloud(speakerId, saved.swipes[0] ?? '');
    setLeafId(saved.id);
  };

  /** Translations shown under messages (A43), by message; kept only while the chat is open. */
  const [translations, setTranslations] = useState<ReadonlyMap<string, { status: 'writing' } | { status: 'done'; text: string } | { status: 'failed'; reason: string }>>(new Map());
  const [language] = useState(() => deviceLanguage());
  const setTranslation = (id: string, value: { status: 'writing' } | { status: 'done'; text: string } | { status: 'failed'; reason: string } | null) =>
    setTranslations((current) => {
      const next = new Map(current);
      if (value === null) next.delete(id);
      else next.set(id, value);
      return next;
    });
  const translateMessage = async (id: string, text: string) => {
    setTranslation(id, { status: 'writing' });
    try {
      setTranslation(id, { status: 'done', text: await translateText(chat.id, text, language) });
    } catch (error) {
      setTranslation(id, { status: 'failed', reason: error instanceof Error ? error.message : 'The translation could not be written' });
    }
  };
  const translationOf = (id: string) => {
    const found = translations.get(id);
    return found?.status === 'done' ? { ...found, onHide: () => setTranslation(id, null) } : found;
  };

  /** Reads a character's line aloud in their voice (A29). */
  const readAloud = (characterId: string | null, text: string) => {
    speak(text, voiceOf(castById.get(characterId ?? '')?.extensions ?? {}));
  };

  /** Text as saved, after the regex scripts that change what is stored (A33). */
  const stored = (text: string, placement: RegexPlacement) => applyRegex(text, scripts, placement, 'stored');

  /** The table GM's answer to a question on the `gm` channel (A11, A20): out of character, never in the story. */
  const askGm = async (question: ChatMessage) => {
    setWritingAfter({ parentId: question.id, speakerId: '' });
    const result = await reply.write({ chat_id: chat.id, leaf_id: question.id, speaker_id: null, mode: 'table' });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    const saved = await create({ chat_id: chat.id, parent_id: question.id, role: 'narrator', channel: 'gm', swipes: [result.text.trim()] });
    setLeafId(saved.id);
  };

  const send = async (text: string, channel: ComposerChannel, images: string[] = []) => {
    const saved = await create({ chat_id: chat.id, parent_id: leaf, role: 'user', channel, swipes: [channel === 'ic' ? stored(text, 'user_input') : text], images });
    setLeafId(saved.id);
    if (channel === 'gm') await askGm(saved);
    // Paused (A25): the story waits; the line is kept for when the table resumes.
    else if (channel === 'ic' && !chat.paused) await replyAfter(saved.id, [...branch, saved]);
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
    const result = await reply.write({ chat_id: chat.id, leaf_id: leaf, speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids), mode: 'impersonate' });
    return result?.text ?? null;
  };

  /** A summary of the shown branch, for chat settings to fill in. */
  const summarize = async (): Promise<string | null> => {
    try {
      const summary = await summarizeBranch({ chat_id: chat.id, leaf_id: leaf, speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids) });
      if (summary.dropped > 0) notify('The oldest turns did not fit', `${summary.dropped} were left out of the summary.`);
      return summary.text;
    } catch (error) {
      notify('No summary', error instanceof Error ? error.message : undefined);
      return null;
    }
  };

  /**
   * The X-card (A25): the newest reply on the branch leaves the story at once, no questions asked.
   * Undo puts it back.
   */
  const xCardLatest = async () => {
    const latest = [...branch].reverse().find((message) => message.role === 'character' && !message.x_carded);
    if (latest === undefined) {
      notify('Nothing to X-card yet');
      return;
    }
    // At once, before anything else: the undo only offers the way back.
    const carded = await update(latest, { x_carded: true });
    deferWithUndo(
      'Reply X-carded',
      () => undefined,
      () => void update(carded, { x_carded: false }),
    );
  };

  const openInspector = async () => {
    setInspected('loading');
    try {
      setInspected(await inspectPrompt({ chat_id: chat.id, leaf_id: leaf, speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids) }));
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
    <div
      className='flex min-h-[calc(100svh-4rem)] flex-col bg-cover bg-fixed bg-center'
      // The chat's picture (A31) sits behind; the header and messages keep a solid background so
      // text never depends on the picture for contrast.
      style={chat.background === null ? undefined : { backgroundImage: `url(${JSON.stringify(chat.background)})` }}
    >
      <div className={cn('mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2', chat.background !== null && 'rounded-b-xl bg-background')}>
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
        <div className='flex flex-wrap justify-end gap-1'>
          <Button
            type='button'
            variant={chat.paused ? 'default' : 'ghost'}
            className='h-11'
            aria-pressed={chat.paused}
            onClick={() => void updateChat(chat, { paused: !chat.paused }).then(() => notify(chat.paused ? 'Resumed' : 'Paused', chat.paused ? undefined : 'No story turns until you resume. The GM still answers.'))}
          >
            {chat.paused ? <Play aria-hidden /> : <Pause aria-hidden />} {chat.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button type='button' variant='outline' className='h-11' onClick={() => void xCardLatest()} aria-label='X-card the latest reply'>
            <X aria-hidden /> X-card
          </Button>
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
              <DropdownMenuItem onSelect={() => setTreeOpen(true)}>
                <GitFork aria-hidden /> Every branch
              </DropdownMenuItem>
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
      <ol
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-3 pb-4',
          TEXT_SIZE_CLASS[settings.textSize],
          settings.chatLayout === 'document' && 'gap-3 font-serif',
          chat.background !== null && 'bg-background pt-3',
        )}
        aria-label='Chat'
        aria-live='polite'
      >
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
                layout={settings.chatLayout}
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
                onXCard={() => void update(message, { x_carded: !message.x_carded })}
                onContinue={message.role === 'character' && message.id === leaf && !writing ? () => void continueMessage(message) : undefined}
                onSpeak={canSpeak ? () => readAloud(message.speaker_character_id, shown.text) : undefined}
                onTranslate={chat.character_ids.length > 0 ? { label: `Translate into ${language}`, run: () => void translateMessage(message.id, shown.text) } : undefined}
                translation={translationOf(message.id)}
              />
            </li>
          );
        })}
        {writingAfter !== null && (
          <li>
            <MessageItem
              layout={settings.chatLayout}
              writing
              message={{
                id: 'writing',
                role: 'character',
                channel: 'ic',
                speaker: pending?.name ?? (writingAfter?.speakerId === '' ? TABLE.gm_name : NARRATOR),
                avatar: pending?.avatar ?? null,
                text: reply.state.status === 'writing' ? reply.state.text : '',
                swipe: { index: 0, count: 1 },
                fork: { index: 0, count: 1 },
                bookmarked: false,
                images: [],
              }}
            />
          </li>
        )}
      </ol>
      <div ref={end} />
      {chat.character_ids.length > 1 && (
        <NextSpeaker
          cast={chat.character_ids.flatMap((id) => {
            const character = castById.get(id);
            return character === undefined ? [] : [{ id, name: character.name }];
          })}
          picked={picked}
          upNext={nextSpeaker(chat.character_ids, branch, chat.muted_ids)}
          onPick={setPicked}
        />
      )}
      <Composer
        writing={writing}
        disabled={list.data === undefined}
        onSend={(text, channel, images) => void send(text, channel, images)}
        onStop={reply.stop}
        onImpersonate={chat.character_ids.length > 0 ? impersonate : undefined}
        quickReplies={(quickList.data ?? [])
          .filter((reply) => reply.enabled)
          .map((reply) => ({
            id: reply.id,
            label: reply.label,
            action: reply.action,
            channel: reply.channel,
            text: expandMacros(reply.message, {
              char: castById.get(nextSpeaker(chat.character_ids, branch, chat.muted_ids) ?? '')?.name ?? NARRATOR,
              user: persona?.name ?? DEFAULT_USER_NAME,
            }),
          }))}
      />
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side={mobile ? 'bottom' : 'right'} className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>Every branch</SheetTitle>
            <SheetDescription>Choose a message to show the branch through it.</SheetDescription>
          </SheetHeader>
          <div className='p-4'>
            <BranchTree
              rows={treeRows(all, new Set(branch.map((message) => message.id))).map((row) => ({
                id: row.message.id,
                speaker: treeOpen ? (messageViews([row.message], all, castById, persona)[0]?.speaker ?? NARRATOR) : NARRATOR,
                text: row.message.swipes[row.message.swipe_index] ?? '',
                depth: row.depth,
                onPath: row.onPath,
                leaf: row.leaf,
              }))}
              onPick={(id) => {
                setLeafId(latestLeaf(all, id)?.id ?? id);
                setTreeOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
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
          tags: chat.tags,
          folder: chat.folder,
          muted_ids: chat.muted_ids,
          background: chat.background,
          objectives: chat.objectives,
          content_rating: chat.content_rating,
          lines: chat.lines,
          veils: chat.veils,
          table_notes: chat.table_notes,
          campaign_id: chat.campaign_id,
        }}
        campaigns={(campaignList.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
        cast={chat.character_ids.flatMap((id) => {
          const character = castById.get(id);
          return character === undefined ? [] : [{ id, name: character.name }];
        })}
        folders={foldersOf(chatList.data ?? [])}
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
