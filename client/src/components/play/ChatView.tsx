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
import { useHidden } from 'zephyrex/hooks/useWrites';
import {
  BookOpen,
  Clock3,
  Download,
  Ellipsis,
  GitFork,
  Image as ImageIcon,
  Pause,
  Play,
  ScanText,
  Settings2,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Badge } from 'zephyrex/ui/badge';
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
import {
  deviceLanguage,
  expressionFor,
  moveMessageUp,
  pictureOfScene,
  type InspectedPrompt,
  inspectPrompt,
  summarizeBranch,
  translateText,
} from '~/features/chat/inspectPrompt';
import { chatToJsonl, chatToText } from '~/features/import/stChat';
import { applyRegex, type RegexPlacement } from '~/features/chat/regex';
import { foldersOf } from '~/features/chat/library';
import { type Command, COMMAND_HELP } from '~/features/chat/commands';
import { speak, speechSupport, voiceOf } from '~/features/speech/voice';
import { DEFAULT_USER_NAME, splitReasoning } from '~/features/prompt/assemble';
import { expandMacros } from '~/features/prompt/macros';
import { useReply } from '~/features/chat/useReply';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import type { TextSize } from '~/features/settings/deviceSettings';
import { cn } from '~/lib/utils';
import { LIMITS, PICTURE, TABLE } from '~/contract';
import { hasNote, type ProposedNote, proposedNote } from '~/features/chat/proposedNote';
import { type ReplyStats, replyStats, timed } from '~/features/chat/replyStats';
import {
  type Character,
  type Chat,
  type ChatMessage,
  characters,
  chats,
  endpoints,
  lorebookEntries,
  lorebooks,
  messages,
  type Persona,
  personas,
  presets,
  quickReplies,
  regexScripts,
  campaigns,
  scenarios,
  characterExpressions,
  idOf,
} from '~/features/data/records';
import { initials } from '../characters/CharacterTile';
import { ChatSettings, type LoreSettingsValue } from './ChatSettings';
import { Composer } from './Composer';
import { ScenarioPlay } from '~/components/campaign/ScenarioPlay';
import { BranchTree } from './BranchTree';
import { ContextInspector } from './ContextInspector';
import { NextSpeaker } from './NextSpeaker';
import { NamesWithoutLore } from '~/components/lore/NamesWithoutLore';
import { namesWithoutLore } from '~/features/lore/namesWithoutLore';
import { writeProblem } from 'zephyrex';
import { Recap } from './Recap';
import { MessageItem, type MessageView } from './MessageItem';

/** The chat's text size on this device (A49). */
const TEXT_SIZE_CLASS: Record<TextSize, string> = {
  small: 'text-sm',
  normal: 'text-base',
  large: 'text-lg',
  larger: 'text-xl',
};
/** The campaign's resolution mode (A63–A66), named in the header. */
const MODE_LABELS = { narrative: 'Narrative', mechanical: 'Rules as written', hybrid: 'Hybrid' } as const;
const MODE_HINTS = {
  narrative: 'the story decides; rolls only at real stakes',
  mechanical: 'the rules decide every action they cover',
  hybrid: 'rules for some scenes, story for others',
} as const;
const NARRATOR = 'Narrator';
/** The pending turn is the narrator's (A20), not a character's. */
const NARRATOR_TURN = 'narrator';
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
      message.role === 'user'
        ? (persona?.name ?? YOU)
        : message.role === 'character'
          ? (character?.name ?? NARRATOR)
          : message.channel === 'gm'
            ? TABLE.gm_name
            : NARRATOR;
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
  const scenarioList = scenarios.useList();
  const spriteList = characterExpressions.useList();
  const sprites = spriteList.data ?? [];
  const [stage, setStage] = useState<{ characterId: string; label: string } | null>(null);
  const staged =
    stage === null
      ? undefined
      : sprites.find((sprite) => sprite.character_id === stage.characterId && sprite.label === stage.label);
  const campaign = campaignList.data?.find((one) => one.id === chat.campaign_id);
  const running = scenarioList.data?.find((one) => one.id === chat.scenario_id);
  const { update: updateScenario } = scenarios.useActions();
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const entryList = lorebookEntries.useList(undefined, namesOpen);
  const { create: createEntry } = lorebookEntries.useActions();
  const scriptList = regexScripts.useList();
  const scripts = scriptList.data ?? [];
  const quickList = quickReplies.useList();
  const { create, update, remove } = messages.useActions();
  const { update: updateChat } = chats.useActions();
  const reply = useReply();
  // A link to a message (`?at=`, from the library's search) opens the branch through it.
  const params = useSearchParams();
  const [leafId, setLeafId] = useState<string | null>(() => params.get('at'));
  const [writingAfter, setWritingAfter] = useState<{ parentId: string | null; speakerId: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [inspected, setInspected] = useState<InspectedPrompt | 'loading' | null>(null);
  const mobile = useIsMobile();
  const hidden = useHidden(list.data ?? [], idOf);
  const end = useRef<HTMLDivElement>(null);

  // Oldest first, whatever order the back end answers in: the tree's latest leaf is the last child.
  const all = useMemo(() => [...hidden.shown].sort((a, b) => a.created_at.localeCompare(b.created_at)), [hidden.shown]);
  const leaf =
    leafId !== null && all.some((message) => message.id === leafId)
      ? (latestLeaf(all, leafId)?.id ?? leafId)
      : (latestLeaf(all)?.id ?? null);
  const branch = useMemo(() => (leaf === null ? [] : branchTo(all, leaf)), [all, leaf]);
  const castById = useMemo(() => new Map((cast.data ?? []).map((character) => [character.id, character])), [cast.data]);
  // The cast's names, for natural order (A52): a member the last story line names speaks next.
  const castNames = new Map(chat.character_ids.map((id) => [id, castById.get(id)?.name ?? '']));
  const persona = useMemo(() => {
    const found = personaList.data ?? [];
    return found.find((one) => one.id === chat.persona_id) ?? found.find((one) => one.is_default) ?? null;
  }, [personaList.data, chat.persona_id]);
  const { settings } = useDeviceSettings();
  const [canSpeak] = useState(() => speechSupport().speak);
  const [recapHidden, setRecapHidden] = useState(false);
  const views = messageViews(branch, all, castById, persona).filter(
    (view) => settings.showTableTalk || (view.channel !== 'ooc' && view.channel !== 'gm'),
  );
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
    const speakerId =
      picked !== null && chat.character_ids.includes(picked)
        ? picked
        : nextSpeaker(chat.character_ids, path, chat.muted_ids, castNames);
    setPicked(null);
    if (speakerId === null) return;
    setWritingAfter({ parentId, speakerId });
    const result = await timedWrite({ chat_id: chat.id, leaf_id: parentId, speaker_id: speakerId });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    const saved = await create({
      chat_id: chat.id,
      parent_id: parentId,
      role: 'character',
      speaker_character_id: speakerId,
      swipes: [stored(result.text, 'ai_output')],
    });
    if (settings.readAloud) readAloud(speakerId, saved.swipes[0] ?? '');
    setLeafId(saved.id);
    noteCost(saved.id, result);
    void showExpression(speakerId, saved.swipes[0] ?? '');
    autoTranslate(saved.id, saved.swipes[0] ?? '');
  };

  /** The speaker's sprite for how the line feels (A4), when they have sprites and this device shows them. */
  const showExpression = async (characterId: string, text: string) => {
    if (!settings.showExpressions || !sprites.some((sprite) => sprite.character_id === characterId)) return;
    const label = await expressionFor(chat.id, characterId, text).catch(() => null);
    setStage(label === null ? null : { characterId, label });
  };

  /** Translations shown under messages (A43), by message; kept only while the chat is open. */
  const [translations, setTranslations] = useState<
    ReadonlyMap<string, { status: 'writing' } | { status: 'done'; text: string } | { status: 'failed'; reason: string }>
  >(new Map());
  const [language] = useState(() => deviceLanguage());
  const setTranslation = (
    id: string,
    value: { status: 'writing' } | { status: 'done'; text: string } | { status: 'failed'; reason: string } | null,
  ) =>
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
      setTranslation(id, {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'The translation could not be written',
      });
    }
  };
  /** Every new reply translated as it is written, when this device asks for it (A43): the reply, not its reasoning. */
  const [repliesWritten, setRepliesWritten] = useState(0);
  const autoTranslate = (id: string, text: string) => {
    // Each reply written also runs the after-reply quick reply (A38).
    setRepliesWritten((count) => count + 1);
    const reply = splitReasoning(text).reply;
    if (settings.autoTranslate && reply.trim() !== '') void translateMessage(id, reply);
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

  /** A note the GM proposed (A11), kept once a player adds it; never added by the GM itself. */
  const addNote = async (note: ProposedNote) => {
    if (hasNote(chat.table_notes, note)) return;
    if (chat.table_notes.length >= LIMITS.table_notes) {
      notify('Table notes are full', 'Remove one in Chat settings first.');
      return;
    }
    await updateChat(chat, { table_notes: [...chat.table_notes, note] });
    notify('Added to the table notes');
  };

  /** A slash command from the composer (A37): each one something the chat already does. */
  const runCommand = async (command: Command) => {
    switch (command.name) {
      case 'sys': {
        const saved = await create({
          chat_id: chat.id,
          parent_id: leaf,
          role: 'narrator',
          channel: 'ic',
          swipes: [command.text],
        });
        setLeafId(saved.id);
        return;
      }
      case 'sendas': {
        const id = chat.character_ids.find(
          (one) => castById.get(one)?.name.toLowerCase() === command.character.toLowerCase(),
        );
        if (id === undefined) {
          notify(`${command.character} is not in this chat`);
          return;
        }
        const saved = await create({
          chat_id: chat.id,
          parent_id: leaf,
          role: 'character',
          speaker_character_id: id,
          swipes: [stored(command.text, 'ai_output')],
        });
        setLeafId(saved.id);
        return;
      }
      case 'narrate':
        await narrate();
        return;
      case 'continue': {
        const last = branch.at(-1);
        if (last?.role === 'character') await continueMessage(last);
        else notify('Nothing to continue', 'The last line is not a character’s.');
        return;
      }
      case 'impersonate':
        // The composer fills its own box for /impersonate; reached only without a cast.
        notify('Nobody to write as', 'Add a character to the chat first.');
        return;
      case 'xcard':
        await xCardLatest();
        return;
      case 'pause':
      case 'resume':
        if (chat.paused !== (command.name === 'pause')) await updateChat(chat, { paused: command.name === 'pause' });
        notify(command.name === 'pause' ? 'Paused' : 'Resumed');
        return;
      case 'help':
        notify('Commands', COMMAND_HELP.map(([usage, what]) => `${usage}: ${what}`).join('\n'));
        return;
    }
  };

  /** What each reply written in this visit cost (AP5), by message id. */
  const [replyCost, setReplyCost] = useState<ReadonlyMap<string, ReplyStats>>(new Map());
  const timedWrite = async (request: Parameters<typeof reply.write>[0]) => {
    const { value, seconds } = await timed(() => reply.write(request));
    return value === null ? null : { ...value, seconds };
  };
  const noteCost = (id: string, written: { text: string; seconds: number }) =>
    setReplyCost((current) => new Map(current).set(id, replyStats(written.text, written.seconds)));

  /** The narrator (A20): the GM tells what happens next, as a narrator turn in the story. */
  const narrate = async () => {
    if (chat.paused) {
      notify('The game is paused', 'Resume to go on with the story.');
      return;
    }
    setWritingAfter({ parentId: leaf, speakerId: NARRATOR_TURN });
    const result = await timedWrite({ chat_id: chat.id, leaf_id: leaf, speaker_id: null, mode: 'narrate' });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    const saved = await create({
      chat_id: chat.id,
      parent_id: leaf,
      role: 'narrator',
      channel: 'ic',
      swipes: [stored(result.text, 'ai_output')],
    });
    if (settings.readAloud) readAloud(null, saved.swipes[0] ?? '');
    setLeafId(saved.id);
    noteCost(saved.id, result);
    autoTranslate(saved.id, saved.swipes[0] ?? '');
  };

  /** A picture of the scene so far (A30), kept in the chat as a system line: never in the story. */
  const [drawing, setDrawing] = useState(false);
  const drawScene = async () => {
    setDrawing(true);
    try {
      const drawn = await pictureOfScene(chat.id, leaf);
      const saved = await create({
        chat_id: chat.id,
        parent_id: leaf,
        role: 'system',
        channel: 'system',
        swipes: [PICTURE.caption],
        images: [drawn.image],
      });
      setLeafId(saved.id);
    } catch (error) {
      notify('No picture', error instanceof Error ? error.message : undefined);
    } finally {
      setDrawing(false);
    }
  };

  /** The table GM's answer to a question on the `gm` channel (A11, A20): out of character, never in the story. */
  const askGm = async (question: ChatMessage) => {
    setWritingAfter({ parentId: question.id, speakerId: '' });
    const result = await timedWrite({ chat_id: chat.id, leaf_id: question.id, speaker_id: null, mode: 'table' });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    const saved = await create({
      chat_id: chat.id,
      parent_id: question.id,
      role: 'narrator',
      channel: 'gm',
      swipes: [result.text.trim()],
    });
    setLeafId(saved.id);
    noteCost(saved.id, result);
  };

  const send = async (text: string, channel: ComposerChannel, images: string[] = []) => {
    const saved = await create({
      chat_id: chat.id,
      parent_id: leaf,
      role: 'user',
      channel,
      swipes: [channel === 'ic' ? stored(text, 'user_input') : text],
      images,
    });
    setLeafId(saved.id);
    if (channel === 'gm') await askGm(saved);
    // Paused (A25): the story waits; the line is kept for when the table resumes.
    else if (channel === 'ic' && !chat.paused) await replyAfter(saved.id, [...branch, saved]);
  };

  /** Another alternative for a reply; with `endpointId`, from that model (AP4), to compare them side by side. */
  const regenerate = async (message: ChatMessage, endpointId?: string) => {
    if (message.speaker_character_id === null) return;
    setWritingAfter({ parentId: message.parent_id, speakerId: message.speaker_character_id });
    const result = await timedWrite({
      chat_id: chat.id,
      leaf_id: message.parent_id,
      speaker_id: message.speaker_character_id,
      ...(endpointId === undefined ? {} : { endpoint_id: endpointId }),
    });
    setWritingAfter(null);
    if (result === null || result.text.trim() === '') return;
    await update(message, {
      swipes: [...message.swipes, stored(result.text, 'ai_output')],
      swipe_index: message.swipes.length,
    });
    noteCost(message.id, result);
  };

  /** Carries on the shown alternative of a character's message, where it stopped. */
  const continueMessage = async (message: ChatMessage) => {
    if (message.speaker_character_id === null) return;
    setWritingAfter({ parentId: message.id, speakerId: message.speaker_character_id });
    const result = await timedWrite({
      chat_id: chat.id,
      leaf_id: message.id,
      speaker_id: message.speaker_character_id,
      mode: 'continue',
    });
    setWritingAfter(null);
    if (result === null || result.text === '') return;
    await update(message, {
      swipes: message.swipes.map((text, index) =>
        index === message.swipe_index ? stored(`${text}${result.text}`, 'ai_output') : text,
      ),
    });
    noteCost(message.id, result);
  };

  /** The person's own next line, written by the model, for the composer. */
  const impersonate = async (): Promise<string | null> => {
    const result = await reply.write({
      chat_id: chat.id,
      leaf_id: leaf,
      speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames),
      mode: 'impersonate',
    });
    return result?.text ?? null;
  };

  /** A summary of the shown branch, for chat settings to fill in. */
  const summarize = async (): Promise<string | null> => {
    try {
      const summary = await summarizeBranch({
        chat_id: chat.id,
        leaf_id: leaf,
        speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames),
      });
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
      setInspected(
        await inspectPrompt({
          chat_id: chat.id,
          leaf_id: leaf,
          speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames),
        }),
      );
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
        ? chatToJsonl(
            {
              characterName: castById.get(chat.character_ids[0] ?? '')?.name ?? '',
              userName: persona?.name ?? YOU,
              createdAt: chat.created_at,
            },
            named,
          )
        : chatToText(named);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'jsonl' ? 'application/jsonl' : 'text/plain' }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${chat.title.replace(/[^\w.-]+/g, '_')}.${format === 'jsonl' ? 'jsonl' : 'txt'}`,
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  const fork = (message: ChatMessage, step: -1 | 1) => {
    const { siblings, index } = siblingsOf(all, message);
    const target = siblings[index + step];
    if (target !== undefined) setLeafId(latestLeaf(all, target.id)?.id ?? target.id);
  };

  /** Moves a message up its branch (A9), where the message above has no other reply. */
  const moveUp = async (message: ChatMessage) => {
    try {
      await moveMessageUp(message.id);
      await list.mutate();
    } catch (error) {
      notify('Not moved', error instanceof Error ? error.message : undefined);
    }
  };
  /** The only reply under `id`, if it has exactly one. */
  const onlyReply = (id: string) => {
    const replies = all.filter((one) => one.parent_id === id);
    return replies.length === 1 ? replies[0] : undefined;
  };

  const deleteMessage = (message: ChatMessage) => {
    hidden.hide([message.id]);
    setLeafId(message.parent_id);
    deferWithUndo(
      'Message deleted',
      () => void remove(message),
      () => hidden.show([message.id]),
    );
  };

  if (list.error !== undefined) return <LoadProblem what='this chat' error={list.error} onRetry={() => list.mutate()} />;

  const pending = writingAfter === null ? undefined : castById.get(writingAfter.speakerId);
  const options = <T extends { id: string; name: string }>(rows: readonly T[] | undefined) =>
    (rows ?? []).map(({ id, name }) => ({ id, name }));

  return (
    <div
      className='flex min-h-[calc(100svh-4rem)] flex-col bg-cover bg-fixed bg-center'
      // The chat's picture (A31) sits behind; the header and messages keep a solid background so
      // text never depends on the picture for contrast.
      style={chat.background === null ? undefined : { backgroundImage: `url(${JSON.stringify(chat.background)})` }}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2',
          chat.background !== null && 'rounded-b-xl bg-background',
        )}
      >
        {campaign?.resolution_mode != null && (
          // The mode in force, always in view (A66).
          <Badge variant='outline' className='shrink-0' title={`${campaign.name}: ${MODE_HINTS[campaign.resolution_mode]}`}>
            {MODE_LABELS[campaign.resolution_mode]}
          </Badge>
        )}
        <ul className='flex min-w-0 -space-x-2' aria-label='In this chat'>
          {chat.character_ids.map((id) => {
            const character = castById.get(id);
            return (
              <li key={id}>
                <Avatar className='size-9 border-2 border-background'>
                  {character?.avatar !== undefined && character.avatar !== null && (
                    <AvatarImage src={character.avatar} alt='' />
                  )}
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
            onClick={() =>
              void updateChat(chat, { paused: !chat.paused }).then(() =>
                notify(
                  chat.paused ? 'Resumed' : 'Paused',
                  chat.paused ? undefined : 'No story turns until you resume. The GM still answers.',
                ),
              )
            }
          >
            {chat.paused ? <Play aria-hidden /> : <Pause aria-hidden />} {chat.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            type='button'
            variant='outline'
            className='h-11'
            onClick={() => void xCardLatest()}
            aria-label='X-card the latest reply'
          >
            <X aria-hidden /> X-card
          </Button>
          {running !== undefined && (
            <Button type='button' variant='ghost' className='h-11' onClick={() => setScenarioOpen(true)}>
              <Clock3 aria-hidden /> Scenario
            </Button>
          )}
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
              <DropdownMenuItem disabled={drawing || chat.character_ids.length === 0} onSelect={() => void drawScene()}>
                <ImageIcon aria-hidden /> {drawing ? 'Drawing the scene…' : 'Picture of the scene'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNamesOpen(true)}>
                <BookOpen aria-hidden /> Names without lore
              </DropdownMenuItem>
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
      {!recapHidden && (
        // "Previously…" (AP2): the rolling summary at the top when the session starts.
        <div className='mx-auto w-full max-w-3xl px-3 pb-3'>
          <Recap
            summary={chat.summary}
            onRead={canSpeak ? () => readAloud(null, chat.summary) : undefined}
            onHide={() => setRecapHidden(true)}
          />
        </div>
      )}
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
        {list.data !== undefined && views.length === 0 && writingAfter === null && !hidden.pending && (
          <li className='rounded-xl border border-dashed p-6 text-center text-muted-foreground'>Say something to begin.</li>
        )}
        {views.map((view) => {
          const message = byId(view.id);
          if (message === undefined) return null;
          // Display-only regex scripts (A33) change how a message looks here, never what is saved.
          const placement: RegexPlacement | null =
            message.role === 'user' ? 'user_input' : message.role === 'character' ? 'ai_output' : null;
          const depth = branch.length - 1 - branch.findIndex((one) => one.id === message.id);
          const regexed =
            placement === null ? view : { ...view, text: applyRegex(view.text, scripts, placement, 'display', depth) };
          // A note the table GM proposes (A11) is shown apart, for a player to add; the answer without it.
          const proposal = message.channel === 'gm' && message.role === 'narrator' ? proposedNote(regexed.text) : null;
          const shown = proposal === null ? regexed : { ...regexed, text: proposal.rest };
          return (
            <li key={view.id}>
              <MessageItem
                layout={settings.chatLayout}
                message={shown}
                cost={replyCost.get(message.id)}
                proposal={
                  proposal === null
                    ? undefined
                    : {
                        label: TABLE.note_labels[proposal.note.kind],
                        text: proposal.note.text,
                        added: hasNote(chat.table_notes, proposal.note),
                        onAdd: () => void addNote(proposal.note),
                      }
                }
                onSwipe={(step) => void update(message, { swipe_index: message.swipe_index + step })}
                onRegenerate={message.role === 'character' && !writing ? () => void regenerate(message) : undefined}
                onRegenerateWith={
                  message.role === 'character' && !writing && (endpointList.data ?? []).length > 1
                    ? {
                        models: (endpointList.data ?? []).map((one) => ({ id: one.id, name: one.name })),
                        run: (endpointId) => void regenerate(message, endpointId),
                      }
                    : undefined
                }
                onFork={(step) => fork(message, step)}
                onEdit={(text) =>
                  void update(message, {
                    swipes: message.swipes.map((old, index) => (index === message.swipe_index ? text : old)),
                  })
                }
                onBookmark={() => void update(message, { bookmarked: !message.bookmarked })}
                onMoveUp={
                  message.parent_id !== null && onlyReply(message.parent_id) !== undefined && !writing
                    ? () => void moveUp(message)
                    : undefined
                }
                onMoveDown={(() => {
                  const below = onlyReply(message.id);
                  return below !== undefined && !writing ? () => void moveUp(below) : undefined;
                })()}
                onBranch={() => {
                  setLeafId(message.id);
                  notify('Branching from here', 'Your next message starts a new branch.');
                }}
                onDelete={() => deleteMessage(message)}
                onXCard={() => void update(message, { x_carded: !message.x_carded })}
                onContinue={
                  message.role === 'character' && message.id === leaf && !writing
                    ? () => void continueMessage(message)
                    : undefined
                }
                onSpeak={canSpeak ? () => readAloud(message.speaker_character_id, shown.text) : undefined}
                onTranslate={
                  chat.character_ids.length > 0
                    ? { label: `Translate into ${language}`, run: () => void translateMessage(message.id, shown.text) }
                    : undefined
                }
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
                role: writingAfter?.speakerId === NARRATOR_TURN ? 'narrator' : 'character',
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
      {staged !== undefined && settings.showExpressions && (
        // The stage (A4): the latest speaker, as their line feels.
        <figure className='mx-auto flex w-full max-w-3xl items-end justify-center px-3'>
          <img
            src={staged.image}
            alt={`${castById.get(staged.character_id)?.name ?? 'The speaker'}, ${staged.label}`}
            className='max-h-48 rounded-lg object-contain'
          />
        </figure>
      )}
      {chat.character_ids.length > 1 && (
        <NextSpeaker
          cast={chat.character_ids.flatMap((id) => {
            const character = castById.get(id);
            return character === undefined ? [] : [{ id, name: character.name }];
          })}
          picked={picked}
          upNext={nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames)}
          onPick={setPicked}
        />
      )}
      <Composer
        writing={writing}
        disabled={list.data === undefined}
        onSend={(text, channel, images) => void send(text, channel, images)}
        onStop={reply.stop}
        onImpersonate={chat.character_ids.length > 0 ? impersonate : undefined}
        onNarrate={chat.character_ids.length > 0 ? () => void narrate() : undefined}
        onCommand={(command) => void runCommand(command)}
        castNames={chat.character_ids.flatMap((id) => castById.get(id)?.name ?? [])}
        repliesWritten={repliesWritten}
        quickReplies={(quickList.data ?? [])
          .filter((reply) => reply.enabled)
          .map((reply) => ({
            id: reply.id,
            label: reply.label,
            action: reply.action,
            channel: reply.channel,
            autoRun: reply.auto_run,
            text: expandMacros(reply.message, {
              char: castById.get(nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames) ?? '')?.name ?? NARRATOR,
              user: persona?.name ?? DEFAULT_USER_NAME,
            }),
          }))}
      />
      <Sheet open={namesOpen} onOpenChange={setNamesOpen}>
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'
        >
          <SheetHeader>
            <SheetTitle>Names without lore</SheetTitle>
            <SheetDescription>Names this story keeps using that nothing describes yet.</SheetDescription>
          </SheetHeader>
          <div className='p-4'>
            {namesOpen && (
              <NamesWithoutLore
                names={namesWithoutLore(
                  branch
                    .filter((one) => one.channel === 'ic' && !one.x_carded)
                    .map((one) => one.swipes[one.swipe_index] ?? ''),
                  [
                    ...chat.character_ids.flatMap((id) => castById.get(id)?.name ?? []),
                    ...(persona === null ? [] : [persona.name]),
                    ...(entryList.data ?? []).flatMap((entry) => entry.keys),
                  ],
                )}
                books={[...(lorebookList.data ?? [])].sort(
                  (a, b) => Number(chat.lorebook_ids.includes(b.id)) - Number(chat.lorebook_ids.includes(a.id)),
                )}
                onAdd={(name, bookId) =>
                  writeProblem(createEntry({ lorebook_id: bookId, keys: [name], comment: name }), 'Not saved')
                }
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={scenarioOpen && running !== undefined} onOpenChange={setScenarioOpen}>
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'
        >
          <SheetHeader>
            <SheetTitle>{running?.name ?? 'Scenario'}</SheetTitle>
            <SheetDescription>The state in play. The GM reads it every turn.</SheetDescription>
          </SheetHeader>
          <div className='p-4'>
            {running !== undefined && (
              <ScenarioPlay
                scenario={running}
                onChange={(next) =>
                  void updateScenario(running, next).catch((error: unknown) =>
                    notify('Not saved', error instanceof Error ? error.message : undefined),
                  )
                }
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'
        >
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
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'
        >
          <SheetHeader>
            <SheetTitle>Context</SheetTitle>
            <SheetDescription>What the model would read for the next reply.</SheetDescription>
          </SheetHeader>
          <div className='p-4'>
            {inspected === 'loading' ? (
              <SkeletonRows rows={5} />
            ) : (
              inspected !== null && <ContextInspector prompt={inspected} />
            )}
          </div>
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
          scenario_id: chat.scenario_id,
        }}
        scenarios={(scenarioList.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
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
