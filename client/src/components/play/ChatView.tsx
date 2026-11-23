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
  Map as MapIcon,
  MessagesSquare,
  PanelRight,
  Download,
  Flag,
  GitFork,
  LoaderCircle,
  Image as ImageIcon,
  Pause,
  Play,
  ScanText,
  Settings2,
  RotateCw,
  Square,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Badge } from 'zephyrex/ui/badge';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { useWakeLock } from '~/features/browser/useWakeLock';
import { branchTo, latestLeaf, treeRows } from '~/features/chat/branch';
import type { ComposerChannel } from '~/features/chat/outgoing';
import { GM_TURN, roundTurns } from '~/features/chat/seat';
import { withoutSpeakerPrefix } from '~/features/chat/speakerPrefix';
import { nextSpeaker, siblingsOf, talkativenessOf } from '~/features/chat/turns';
import {
  deviceLanguage,
  expressionFor,
  moveMessageUp,
  drawPicture,
  pictureOfScene,
  searchWeb,
  type InspectedPrompt,
  inspectPrompt,
  summarizeBranch,
  checkCanon,
  translateText,
  genText,
  cutMessages,
  decideNextTurn,
} from '~/features/chat/inspectPrompt';
import { speakingStore, useSpeaking } from '~/features/speech/speaking';
import { ScriptPrompt } from './ScriptPrompt';
import { TalkingSprite } from './TalkingSprite';
import { illustrationPoints, type StoryLine, storyEpub, storyLines } from '~/features/export/epub';
import { runScript } from '~/features/chat/stscript';
import { toggled } from '~/features/chat/hide';
import { cutIndexes, deleteCount, messagesText } from '~/features/chat/scriptMessages';
import { sameVariables } from '~/features/chat/variables';
import { chatToJsonl, chatToText } from '~/features/import/stChat';
import { applyRegex, type RegexPlacement } from '~/features/chat/regex';
import { foldersOf } from '~/features/chat/library';
import { type Command, COMMAND_HELP, parseCommand } from '~/features/chat/commands';
import { type CharacterVoice, speak, speechSupport, stopSpeaking, voiceFrom, voiceOf } from '~/features/speech/voice';
import { voiceParts } from '~/features/speech/voiceActing';
import { hasVoiceModel, prefetchSpeech, speakOnServer, stopServerSpeech } from '~/features/speech/serverVoice';
import { DEFAULT_USER_NAME, splitReasoning } from '~/features/prompt/assemble';
import { expandMacros } from '~/features/prompt/macros';
import { useReply } from '~/features/chat/useReply';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import type { TextSize } from '~/features/settings/deviceSettings';
import { cn } from '~/lib/utils';
import { isSearchApi, LIMITS, PICTURE, TABLE } from '~/contract';
import { hasNote, type ProposedNote, proposedNote } from '~/features/chat/proposedNote';
import { type ReplyStats, replyStats, timed } from '~/features/chat/replyStats';
import {
  type Character,
  type Chat,
  type ChatMessage,
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
  chatSchema,
  connectionProfiles,
} from '~/features/data/records';
import { ChatSettings, type LoreSettingsValue } from './ChatSettings';
import { Composer } from './Composer';
import { ScenarioPlay } from '~/components/campaign/ScenarioPlay';
import { BranchTree } from './BranchTree';
import { ContextInspector } from './ContextInspector';
import { NextSpeaker } from './NextSpeaker';
import { NamesWithoutLore } from '~/components/lore/NamesWithoutLore';
import { namesWithoutLore } from '~/features/lore/namesWithoutLore';
import { useClient, writeProblem } from 'zephyrex';
import { sessionName } from '~/features/data/playRecords';
import { useCampaign } from './useCampaign';
import { useEndSession } from './useEndSession';
import type { CanonNoticeValue } from './CanonNotice';
import { PARTY_TAG, useCast } from '~/features/data/cast';
import { CanonOff } from './CanonNotice';
import { RollSheet } from './RollSheet';
import type { NarratorStyle } from '~/features/models/narratorStyle';
import { SheetPanel } from './SheetPanel';
import { type ActionGroup, type ChatAction, ContextSidebar, setContextActions, setContextPanel } from './ContextPanel';
import { SidebarContent } from 'zephyrex/components/appwrapper/src/SidebarContentManager';
import { useSidebar } from 'zephyrex/ui/sidebar';

/** One element for the right-hand sidebar, so its content is set once, not on every render. */
const CONTEXT_SIDEBAR = <ContextSidebar />;
import { MapView } from './MapView';
import { decideRoll, makeRoll } from '~/features/chat/rollStep';
import { completeText, metaBreak, narrateSegments, plainDashes, replayOf, seatCut } from '~/features/chat/voiceGuard';
import { aimAt, clarify, ensurePerson, mapStep, refreshStatusLine, worldTick } from '~/features/chat/mapStep';
import { type AuthoringStep, authorNpc, npcNeeded } from '~/features/chat/authorNpc';
import { fetchSpeechOptions } from '~/features/chat/speechOptions';
import { namesIn } from '~/features/chat/namesIn';
import { labelLines, readLabels } from '~/features/chat/labelLines';
import type { Revision } from './RevisionButton';
import useSWR from 'swr';
import { mutate as globalMutate } from 'swr';
import { createPortal } from 'react-dom';
import { APP_BAR_ACTIONS } from '~/components/common/AppPage';
import { SeatSwitch } from './SeatPicker';
import { type DecisionCall, readDecisionCall } from './DecisionCalls';
import { partsOfRuns } from '~/features/chat/reformatRuns';
import { EntityLinksProvider, type LinkedEntity } from './EntityLinks';
import { useSceneBackground } from './useSceneBackground';
import { useAutoReply } from './useAutoReply';
import type { GroupSettings } from '~/features/chat/groupSettings';
import { type Injection, injectionsText, withInjection, withoutInjection } from '~/features/chat/injections';
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
/** The most faces the top bar shows before "+n". */
const MAX_FACES = 4;
/** The pending turn is the narrator's (A20), not a character's. */
const NARRATOR_TURN = 'narrator';
/**
 * Schema-constrained turns (docs/DESIGN.md, Structured lines). Off for now (the hand-piloted run,
 * 2026-11-22): on prod the narrator echoed the person's line and a turn hit the proxy's 504 before its
 * first byte. The text path and its splitter run meanwhile; on again once the server streams items
 * as they decode.
 */
const STRUCTURED_TURNS = false;
/** The app bar's slot is there from the first render: nothing to listen for. */
const noSubscription = () => () => undefined;
const YOU = 'You';
/** The chat commands a script may run (the rest are STscript's own). */
const SCRIPT_ACTIONS: ReadonlySet<string> = new Set([
  'sys',
  // Audit gap 5: the chat's model asked for text a script pipes on, or keeps as a system line.
  'gen',
  'genraw',
  'sysgen',
  'comment',
  // Audit gap 5: the chat's injections, kept until flushed.
  'inject',
  'listinjects',
  'flushinject',
  'cut',
  'send',
  'trigger',
  'messages',
  'addswipe',
  'swipes-add',
  'swipes-count',
  'swipes-swipe',
  'del',
  'hide',
  'unhide',
  'sendas',
  'narrate',
  'continue',
  'xcard',
  'pause',
  'resume',
  'search',
]);
/** Global script variables: shared by every chat while the page is open. */
const SCRIPT_GLOBALS = new Map<string, string>();

/** The sprite label a talking head flips to while its line is read aloud (A54). */
const TALKING_LABEL = 'talking';

/** Each export's file type and ending. */
const EXPORT_FILES = {
  jsonl: { type: 'application/jsonl', ending: 'jsonl' },
  text: { type: 'text/plain', ending: 'txt' },
  epub: { type: 'application/epub+zip', ending: 'epub' },
} as const;

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
      hidden: message.hidden,
      swipe: { index: message.swipe_index, count: message.swipes.length },
      fork: { index, count: siblings.length },
      bookmarked: message.bookmarked,
    };
  });
}

/** At most this many decided turns follow one line before the table waits for the person. */
const DECIDE_ROUND_LIMIT = 4;
/** How many times the decision model is asked before the round falls back to the narrator. */
const DECIDE_TRIES = 3;
/** The play screen's views, as the app bar's tabs; a later view is one more entry. */
type PlayView = 'chat' | 'map';
const PLAY_VIEWS: readonly { id: PlayView; label: string; icon: typeof MessagesSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'map', label: 'Map', icon: MapIcon },
];

function ChatSurface({ chat }: { chat: Chat }): ReactElement {
  const list = messages.useList({ chat_id: chat.id });
  // A campaign's cast is its own people, never every person in the wiki nor the old cards (the operator,
  // 2026-11-23: in a D&D tavern the hooded woman's lines were credited to Ma Delvin, a Night Hag and a 40k
  // Master of Ordnance, because unnamed dialogue was matched against ~1,100 people of every scenario).
  const cast = useCast(chat.campaign_id ?? null, { cards: chat.campaign_id == null });
  const personaList = personas.useList();
  const presetList = presets.useList();
  const endpointList = endpoints.useList();
  // Models only: search sources (A42) are endpoints too, but never asked for a reply.
  const modelList = (endpointList.data ?? []).filter((one) => !isSearchApi(one.api));
  const lorebookList = lorebooks.useList();
  const chatList = chats.useList();
  const campaignList = campaigns.useList();
  const scenarioList = scenarios.useList();
  const spriteList = characterExpressions.useList();
  const sprites = spriteList.data ?? [];
  // Who is being read aloud (A54): the stage shows them talking.
  const speaking = useSpeaking();
  const [stage, setStage] = useState<{ characterId: string; label: string } | null>(null);
  const staged =
    stage === null
      ? undefined
      : sprites.find((sprite) => sprite.character_id === stage.characterId && sprite.label === stage.label);
  const campaign = campaignList.data?.find((one) => one.id === chat.campaign_id);
  const running = scenarioList.data?.find((one) => one.id === chat.scenario_id);
  const { update: updateScenario } = scenarios.useActions();
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [rollOpen, setRollOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toggleSidebar: toggleContext } = useSidebar('right');
  const [view, setView] = useState<PlayView>('chat');
  const [namesOpen, setNamesOpen] = useState(false);
  const entryList = lorebookEntries.useList(undefined, namesOpen);
  const { create: createEntry } = lorebookEntries.useActions();
  const scriptList = regexScripts.useList();
  const scripts = scriptList.data ?? [];
  const quickList = quickReplies.useList();
  const { create, update, remove } = messages.useActions();
  const { update: updateChat } = chats.useActions();
  const client = useClient();
  const reply = useReply();
  // A link to a message (`?at=`, from the library's search) opens the branch through it.
  const params = useSearchParams();
  const router = useRouter();
  const [leafId, setLeafId] = useState<string | null>(() => params.get('at'));
  const [writingAfter, setWritingAfter] = useState<{ parentId: string | null; speakerId: string } | null>(null);
  // A seat change being saved (the play model): auto-reply waits for it.
  const [seatSaving, setSeatSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const endSession = useEndSession(chat);
  const [inspected, setInspected] = useState<InspectedPrompt | 'loading' | null>(null);
  const mobile = useIsMobile();
  const hidden = useHidden(list.data ?? [], idOf);
  const end = useRef<HTMLDivElement>(null);
  // This chat's script variables (A37): kept with the chat (its `variables`, which {{getvar}} and
  // {{setvar}} in prompts read and write too), loaded when the chat opens, saved after a script.
  const scriptLocals = useRef(new Map<string, string>(Object.entries(chat.variables)));
  // Another chat, or this chat's variables as last saved (a reply's {{setvar}} writes them too).
  useEffect(() => {
    scriptLocals.current = new Map(Object.entries(chat.variables));
  }, [chat.id, chat.variables]);
  // A script asking the person (/input, /buttons), answered through ScriptPrompt.
  const [lastRoll, setLastRoll] = useState<unknown>(null);

  // An NPC being authored for the story (features/chat/authorNpc.ts), shown as a card in the chat.
  const [authoring, setAuthoring] = useState<{ name: string; step: AuthoringStep } | null>(null);
  const [asking, setAsking] = useState<{
    prompt: string;
    options: readonly string[] | null;
    asker?: string;
    other?: boolean;
    resolve: (answer: string | null) => void;
  } | null>(null);

  // Oldest first, whatever order the back end answers in: the tree's latest leaf is the last child.
  const all = useMemo(() => [...hidden.shown].sort((a, b) => a.created_at.localeCompare(b.created_at)), [hidden.shown]);
  const leaf =
    leafId !== null && all.some((message) => message.id === leafId)
      ? (latestLeaf(all, leafId)?.id ?? leafId)
      : (latestLeaf(all)?.id ?? null);
  const branch = useMemo(() => (leaf === null ? [] : branchTo(all, leaf)), [all, leaf]);
  // A campaign (docs/DESIGN.md, The play model): its seat, sessions, rewind and fork.
  const play = useCampaign(chat, branch);
  // How the seat may speak here and to whom beyond the room (speech_options: setting-dependent).
  const speechOptions = useSWR(
    // Once per seat, not per line or per focus (the server builds it from the sheet: never cheap).
    play.isCampaign && play.playingId !== null ? ['rpg-ai', 'speech-options', chat.id, play.playingId] : null,
    () => fetchSpeechOptions(chat.id, play.playingId ?? ''),
    { revalidateOnFocus: false, revalidateIfStale: false },
  ); // Saved model-and-preset pairs (gap 8), offered in chat settings.
  const profileList = connectionProfiles.useList();
  // Canon notices (docs/DESIGN.md, Canon warnings): the person's line as they write it, and each AI line,
  // which a warning corrects (the operator, 2026-11-22: "Canon warnings should still fire on AI lines,
  // and should be used to correct the AI"): written once more with the problem named; only a line still
  // off canon after that shows its notice.
  const [canonNotices, setCanonNotices] = useState<ReadonlyMap<string, CanonNoticeValue>>(new Map());
  const checkLine = useCallback(
    (text: string, speaker: string, signal?: AbortSignal) =>
      checkCanon({ chat_id: chat.id, text, speaker }, signal).then((verdict) =>
        verdict === null || !verdict.checked
          ? null
          : { level: verdict.level, reason: verdict.reason, fact: verdict.fact, line: text },
      ),
    [chat.id],
  );
  // The background follows the scene (A31): the story's lines, as the scene's location reads them.
  const sceneLines = useMemo(
    () =>
      branch
        .filter((message) => !message.x_carded)
        .map((message) => ({
          text: message.swipes[message.swipe_index] ?? '',
          channel: message.channel === 'ic' || message.channel === 'roll' ? 'story' : 'table',
        })),
    [branch],
  );
  const background = useSceneBackground(chat, sceneLines);
  const castById = useMemo(() => new Map((cast.data ?? []).map((character) => [character.id, character])), [cast.data]);
  // The cast's names, for natural order (A52): a member the last story line names speaks next.
  const castNames = new Map(chat.character_ids.map((id) => [id, castById.get(id)?.name ?? '']));
  // Whom the narrator may voice (the operator, 2026-11-21: NPC speech was left in the narration):
  // the party, then every other person of the campaign, each line credited to its speaker.
  const voicedCast = [
    ...chat.character_ids.flatMap((id) => castById.get(id) ?? []),
    ...(cast.data ?? []).filter((one) => !chat.character_ids.includes(one.id)),
  ]
    .filter((one) => one.id !== play.playingId)
    .map((one) => ({ id: one.id, name: one.name, line: one.folder }));
  const everyName = (cast.data ?? []).map((one) => one.name);
  // The campaign's people, places and items, for names as links into the drawer (shares the Context
  // panel's read).
  const worldList = useSWR(chat.campaign_id ? ['rpg-ai', 'panel-entities', chat.campaign_id] : null, async () => {
    const page = await client.get('/v1/world_entity', { campaign_id: chat.campaign_id ?? '', limit: '200' });
    const rows = Reflect.get(Object(page), 'world_entities');
    return Array.isArray(rows) ? rows : [];
  });
  // Feedback on messages for manual review (ai_chat's message_feedback): offered once its read answers.
  const feedbackList = useSWR(
    ['rpg-ai', 'message-feedback', chat.id],
    async () => {
      const page = await client.get('/v1/message_feedback', { chat_id: chat.id });
      const rows = Reflect.get(Object(page), 'message_feedbacks');
      return Array.isArray(rows) ? rows : [];
    },
    { shouldRetryOnError: false },
  );
  const feedbackGiven = useMemo(() => {
    const given = new Map<string, 'good' | 'bad'>();
    for (const row of feedbackList.data ?? []) {
      const id = Reflect.get(Object(row), 'message_id');
      const verdict = Reflect.get(Object(row), 'verdict');
      if (typeof id === 'string' && (verdict === 'good' || verdict === 'bad')) given.set(id, verdict);
    }
    return given;
  }, [feedbackList.data]);
  const feedbackOn = feedbackList.data !== undefined && feedbackList.error === undefined;
  const sendFeedback = async (messageId: string, verdict: 'good' | 'bad', reason: string, note: string) => {
    try {
      await client.post('/v1/message_feedback', {
        message_feedback: {
          message_id: messageId,
          verdict,
          ...(reason === '' ? {} : { reason }),
          ...(note === '' ? {} : { note }),
        },
      });
      notify(verdict === 'bad' ? 'Flagged for review' : 'Marked good');
      void feedbackList.mutate();
    } catch (error) {
      notify('Feedback not saved', error instanceof Error ? error.message : undefined);
    }
  };
  const linkable = useMemo(
    () =>
      (worldList.data ?? []).flatMap((row): LinkedEntity[] => {
        const id = Reflect.get(Object(row), 'id');
        const name = Reflect.get(Object(row), 'name');
        const kind = Reflect.get(Object(row), 'kind');
        return typeof id === 'string' &&
          typeof name === 'string' &&
          (kind === 'person' || kind === 'location' || kind === 'item')
          ? [{ id, name, kind }]
          : [];
      }),
    [worldList.data],
  );
  // Each member's talkativeness (gap 7): with no one named, who speaks up next in a group.
  const castTalk = new Map(chat.character_ids.map((id) => [id, talkativenessOf(castById.get(id)?.extensions)]));
  // A group's turn order and allow-self (audit gap 6).
  const groupModes = chat.group_settings as GroupSettings;
  const turnOptions = { order: groupModes.order, allowSelf: groupModes.allow_self };
  const persona = useMemo(() => {
    const found = personaList.data ?? [];
    return found.find((one) => one.id === chat.persona_id) ?? found.find((one) => one.is_default) ?? null;
  }, [personaList.data, chat.persona_id]);
  const { settings } = useDeviceSettings();
  const [browserSpeaks] = useState(() => speechSupport().speak);
  // Read aloud by this device, or by a model set to speak (A29).
  const canSpeak = browserSpeaks || hasVoiceModel(endpointList.data);
  const [recapHidden, setRecapHidden] = useState(false);
  const views = messageViews(branch, all, castById, persona).filter(
    (view) => settings.showTableTalk || (view.channel !== 'ooc' && view.channel !== 'gm'),
  );
  const writing = reply.state.status === 'writing';

  useWakeLock(writing);
  // Follow the story only while the person is at its end (the operator, 2026-11-21: "It also keeps
  // trying to auto scroll all over the place"): reading back up is never pulled down.
  const following = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      following.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (following.current) end.current?.scrollIntoView({ block: 'end' });
  }, [views.length, reply.state]);
  useEffect(() => {
    if (reply.state.status === 'failed') notify('No reply', reply.state.detail);
  }, [reply.state]);

  const byId = (id: string) => all.find((message) => message.id === id);

  /** Who the person chose to speak next in a group (A10); null lets the cast's order decide. */
  const [picked, setPicked] = useState<string | null>(null);

  /** Streams the next reply after `parentId`, then keeps it as a new message. */
  const replyAfter = async (parentId: string | null, path: readonly ChatMessage[], chosen?: string) => {
    // A round's own pick (the seat), else the person's pick for the next turn (A10), else the
    // cast's order; a pick is used once.
    const speakerId =
      chosen ??
      (picked !== null && chat.character_ids.includes(picked)
        ? picked
        : nextSpeaker(chat.character_ids, path, chat.muted_ids, castNames, castTalk, turnOptions));
    setPicked(null);
    if (speakerId === null) return null;
    setWritingAfter({ parentId, speakerId });
    const result = await storyWrite({
      chat_id: chat.id,
      leaf_id: parentId,
      speaker_id: speakerId,
      structured: STRUCTURED_TURNS,
    });
    setWritingAfter(null);
    if (result?.saved !== undefined) return takeSaved(result);
    if (result === null || result.text.trim() === '') return null;
    const saved = await create({
      chat_id: chat.id,
      parent_id: parentId,
      role: 'character',
      speaker_character_id: speakerId,
      // A group reply that opens with its own "Name:" loses it, as in SillyTavern.
      swipes: [thought(result, stored(withoutSpeakerPrefix(result.text, castById.get(speakerId)?.name ?? ''), 'ai_output'))],
      revision: (Reflect.get(result, 'revision') as Revision | null | undefined) ?? null,
    });
    labelSaved(saved.id);
    const replyCanon = Reflect.get(result, 'canon') as CanonNoticeValue | null | undefined;
    if (replyCanon) setCanonNotices((current) => new Map(current).set(saved.id, replyCanon));
    setLeafId(saved.id);
    noteCost(saved.id, result);
    void showExpression(speakerId, saved.swipes[0] ?? '');
    autoTranslate(saved.id, saved.swipes[0] ?? '');
    return saved;
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

  /**
   * Reads `text` in `voice` (A29): by the model set to speak when the person has one (server voices),
   * else by this device; a server failure says why and falls back to the device. `done` runs once
   * the line has ended, however it ended.
   */
  const speakLine = (text: string, voice: CharacterVoice, done: () => void) => {
    if (!hasVoiceModel(endpointList.data)) {
      if (!speak(text, voice, done)) done();
      return;
    }
    speakOnServer(text, voice, done)
      .then((spoke) => {
        if (!spoke) done();
      })
      .catch((error: unknown) => {
        notify('Not read aloud', error instanceof Error ? error.message : undefined);
        if (!speak(text, voice, done)) done();
      });
  };

  // Each reading gets a number; a part of an older one never starts once a newer one has.
  const reading = useRef(0);

  /**
   * Reads a line aloud, voice-acted (the operator, 2026-11-20): narration in the narrator's voice
   * (this device's setting), and each quote in the voice of whoever is named beside it, a character
   * in the chat or an NPC of the running scenario. A quote with no one named is the speaker's own:
   * the character whose reply it is, or the narrator for the GM's lines.
   */
  /** A line's parts as read aloud, and each part's voice. */
  const voicePlan = (characterId: string | null, text: string) => {
    const npcs = running?.cast ?? [];
    const members = chat.character_ids.flatMap((id) => castById.get(id) ?? []);
    const own = characterId === null ? null : (castById.get(characterId)?.name ?? null);
    const parts = voiceParts(text, [...members.map((one) => one.name), ...npcs.map((npc) => npc.name)], own);
    const voiceFor = (name: string | null): CharacterVoice => {
      if (name === null) return settings.narratorVoice;
      const member = members.find((one) => one.name === name);
      // A campaign's people are wiki persons: their own voice (tts_voice) is read by the server.
      if (member !== undefined)
        return chat.campaign_id ? { ...voiceOf(member.extensions), speakerId: member.id } : voiceOf(member.extensions);
      const npc = npcs.find((one) => one.name === name);
      return npc?.voice === undefined ? settings.narratorVoice : voiceFrom(npc.voice);
    };
    return { parts, voiceFor };
  };
  /** Every part's audio made now, so a tap plays it without a wait (the server's voices only). */
  const prepareAloud = (characterId: string | null, text: string) => {
    if (!hasVoiceModel(endpointList.data)) return;
    const { parts, voiceFor } = voicePlan(characterId, text);
    for (const part of parts) prefetchSpeech(part.text, voiceFor(part.speaker));
  };

  const readAloud = (characterId: string | null, text: string, onDone?: () => void) => {
    reading.current += 1;
    const run = reading.current;
    // The stage shows the speaker talking while the line is read (A54).
    const speaker = characterId ?? '';
    const finished = () => {
      if (reading.current !== run) return;
      speakingStore.end(speaker);
      onDone?.();
    };
    speakingStore.start(speaker);
    const { parts, voiceFor } = voicePlan(characterId, text);
    const next = (index: number) => {
      const part = parts[index];
      if (reading.current !== run) return;
      if (part === undefined) {
        finished();
        return;
      }
      // The next part's audio is fetched while this one plays.
      const following = parts[index + 1];
      if (following !== undefined && hasVoiceModel(endpointList.data))
        prefetchSpeech(following.text, voiceFor(following.speaker));
      speakLine(part.text, voiceFor(part.speaker), () => next(index + 1));
    };
    next(0);
  };

  /**
   * Reading on from a message to the end of the story (the operator, 2026-11-23: "an option to play a single
   * message or play through to the end"): each story line in turn, in its speaker's voice.
   */
  const readThrough = (fromId: string) => {
    const start = branch.findIndex((one) => one.id === fromId);
    const lines = branch
      .slice(start === -1 ? 0 : start)
      .filter((one) => one.channel === 'ic' && !one.x_carded && !one.hidden);
    const step = (index: number) => {
      const line = lines[index];
      if (line === undefined) return;
      readAloud(line.speaker_character_id, line.swipes[line.swipe_index ?? 0] ?? '', () => step(index + 1));
    };
    step(0);
  };
  /**
   * Voice as each reply is final (the operator, 2026-11-23: "pregenerate voice clips as soon as the canonical
   * text is ready and/or autoplay"): with nothing being written, each story reply not yet handled is prepared,
   * and with autoplay read in turn. What the chat held when it opened is never played.
   */
  const voicedIds = useRef<Set<string> | null>(null);
  const autoplayQueue = useRef<{ characterId: string | null; text: string }[]>([]);
  const autoplaying = useRef(false);
  const playQueued = () => {
    const line = autoplayQueue.current.shift();
    if (line === undefined) {
      autoplaying.current = false;
      return;
    }
    autoplaying.current = true;
    readAloud(line.characterId, line.text, playQueued);
  };
  useEffect(() => {
    const story = branch.filter((one) => one.channel === 'ic' && one.role !== 'user' && !one.x_carded && !one.hidden);
    if (voicedIds.current === null) {
      voicedIds.current = new Set(story.map((one) => one.id));
      return;
    }
    if (writing || settings.voiceMode === 'off') return;
    for (const line of story) {
      if (voicedIds.current.has(line.id)) continue;
      voicedIds.current.add(line.id);
      const text = line.swipes[line.swipe_index ?? 0] ?? '';
      if (text.trim() === '') continue;
      if (settings.voiceMode === 'prepare') prepareAloud(line.speaker_character_id, text);
      else {
        prepareAloud(line.speaker_character_id, text);
        autoplayQueue.current.push({ characterId: line.speaker_character_id, text });
      }
    }
    if (settings.voiceMode === 'autoplay' && !autoplaying.current) playQueued();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the story or the writing changes; the handlers read the latest state.
  }, [branch, writing, settings.voiceMode]);

  /** Stops whatever is being read (the operator, 2026-11-23: "There's no stop button for the voice"). */
  const stopReading = () => {
    reading.current += 1;
    autoplayQueue.current = [];
    autoplaying.current = false;
    stopSpeaking();
    stopServerSpeech();
    const now = speakingStore.snapshot();
    if (now !== null) speakingStore.end(now);
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
  /**
   * An STscript line (A37), run by the interpreter: its lines go on one after another from the
   * branch's end (each new line the parent of the next), and the other commands run as typed.
   * Variables last while the chat is open; global ones while the page is.
   */
  const runUserScript = async (script: string, setInput?: (text: string) => void) => {
    // The branch as the script changes it: React's state is a step behind within one run.
    let parent = leaf;
    // The chat as this script last saved it: each /inject or /flushinject builds on the one before.
    let scriptChat = chat;
    let path: ChatMessage[] = [...branch];
    const addLine = async (fields: Omit<Parameters<typeof create>[0], 'chat_id' | 'parent_id'>) => {
      const saved = await create({ ...fields, chat_id: chat.id, parent_id: parent });
      parent = saved.id;
      path = [...path, saved];
      setLeafId(saved.id);
    };
    const speakerName = (message: ChatMessage) =>
      message.role === 'user'
        ? (persona?.name ?? DEFAULT_USER_NAME)
        : message.role === 'character'
          ? (castById.get(message.speaker_character_id ?? '')?.name ?? NARRATOR)
          : NARRATOR;
    const lastReply = () => {
      const last = path.at(-1);
      if (last === undefined || last.role !== 'character') throw new Error('The last line is not a reply');
      return last;
    };
    const names = {
      char: castById.get(chat.character_ids[0] ?? '')?.name ?? NARRATOR,
      user: persona?.name ?? DEFAULT_USER_NAME,
    };
    const result = await runScript(script, {
      actions: SCRIPT_ACTIONS,
      locals: scriptLocals.current,
      globals: SCRIPT_GLOBALS,
      macros: (text) => expandMacros(text, names),
      echo: (text) => notify(text),
      setInput,
      ask: (prompt, options) => new Promise((resolve) => setAsking({ prompt, options, resolve })),
      act: async ({ name, text, args }) => {
        if (name === 'sys') {
          await addLine({ role: 'narrator', channel: 'ic', swipes: [text] });
          return undefined;
        }
        // /gen and /genraw pipe the model's answer on; /sysgen keeps it as a narrator line (audit gap 5).
        if (name === 'gen' || name === 'genraw' || name === 'sysgen') {
          const answer = await genText({
            chat_id: chat.id,
            leaf_id: parent,
            speaker_id: nextSpeaker(chat.character_ids, path, chat.muted_ids, castNames, castTalk, turnOptions),
            prompt: text,
            raw: name === 'genraw',
          });
          if (name !== 'sysgen') return answer;
          await addLine({ role: 'narrator', channel: 'ic', swipes: [answer] });
          return undefined;
        }
        // The chat's injections (audit gap 5): set, listed and flushed, kept with the chat.
        if (name === 'inject' || name === 'flushinject') {
          const current = scriptChat.injections as unknown as Injection[];
          const next = name === 'inject' ? withInjection(current, args, text) : withoutInjection(current, args.id ?? text);
          scriptChat = await updateChat(scriptChat, { injections: next as unknown as Record<string, unknown>[] });
          return undefined;
        }
        // /cut (audit gap 5): the lines named leave the chat; the ones after them carry on without them.
        if (name === 'cut') {
          const doomed = new Set(cutIndexes(text, path.length).map((index) => (path[index] as ChatMessage).id));
          if (doomed.size === 0) return undefined;
          await cutMessages([...doomed]);
          path = path.filter((message) => !doomed.has(message.id));
          parent = path.at(-1)?.id ?? null;
          setLeafId(parent);
          await list.mutate();
          return undefined;
        }
        if (name === 'listinjects') return injectionsText(scriptChat.injections as unknown as Injection[]);
        // A comment (audit gap 5): kept in the chat as a system line the model never reads.
        if (name === 'comment') {
          await addLine({ role: 'system', channel: 'system', swipes: [text] });
          return undefined;
        }
        // The chat's own lines and replies, as SillyTavern's message commands do them (A37).
        if (name === 'send') {
          await addLine({ role: 'user', channel: 'ic', swipes: [stored(text, 'user_input')] });
          return undefined;
        }
        if (name === 'trigger') {
          const saved = await replyAfter(parent, path);
          if (saved !== null) {
            parent = saved.id;
            path = [...path, saved];
          }
          return undefined;
        }
        if (name === 'messages') {
          const lines = path.map((message) => ({
            name: speakerName(message),
            text: message.swipes[message.swipe_index] ?? '',
          }));
          return messagesText(lines, text, args.names !== 'off');
        }
        if (name === 'addswipe' || name === 'swipes-add') {
          const last = lastReply();
          const saved = await update(last, { swipes: [...last.swipes, text], swipe_index: last.swipes.length });
          path = [...path.slice(0, -1), saved];
          return undefined;
        }
        if (name === 'swipes-count') return String(lastReply().swipes.length);
        if (name === 'swipes-swipe') {
          const last = lastReply();
          const saved = await update(last, { swipe_index: (last.swipe_index + 1) % last.swipes.length });
          path = [...path.slice(0, -1), saved];
          return undefined;
        }
        if (name === 'hide' || name === 'unhide') {
          // As SillyTavern's: the lines a range names stay on screen, out of (or back in) the prompt.
          const hidden = name === 'hide';
          for (const message of toggled(path, text, hidden)) {
            const saved = await update(message, { hidden });
            path = path.map((one) => (one.id === saved.id ? saved : one));
          }
          return undefined;
        }
        if (name === 'del') {
          const count = deleteCount(text, path.length);
          for (const message of path.slice(path.length - count).reverse()) await remove(message);
          path = path.slice(0, path.length - count);
          parent = path.at(-1)?.id ?? null;
          setLeafId(parent);
          return undefined;
        }
        if (name === 'sendas') {
          const parsed = parseCommand(`/sendas ${args.name === undefined ? text : `"${args.name}" ${text}`}`, [
            ...castNames.values(),
          ]);
          const character = parsed !== null && !('unknown' in parsed) && parsed.name === 'sendas' ? parsed : null;
          const id = chat.character_ids.find(
            (one) => castById.get(one)?.name.toLowerCase() === character?.character.toLowerCase(),
          );
          if (character === null || id === undefined) throw new Error(`/sendas: no one by that name in this chat`);
          await addLine({
            role: 'character',
            channel: 'ic',
            speaker_character_id: id,
            swipes: [stored(character.text, 'ai_output')],
          });
          return undefined;
        }
        // In a script, /search hands its block on as the pipe, as SillyTavern's /websearch does.
        if (name === 'search') return (await searchWeb(text)).context;
        const command = parseCommand(`/${name}`);
        if (command !== null && !('unknown' in command)) await runCommand(command);
        return undefined;
      },
    }).catch((error: unknown) => ({ pipe: '', stopped: error instanceof Error ? error.message : 'The script failed' }));
    if (result.stopped !== null) notify('The script stopped', result.stopped);
    // What /setvar changed is kept with the chat, so the next visit (and the prompt's {{getvar}}) sees it.
    const variables = Object.fromEntries(scriptLocals.current);
    if (!sameVariables(variables, chat.variables)) {
      // The chat as saved now: a line the script added moved its version on (If-Match).
      const current = async () => chatSchema.parse(Reflect.get(Object(await client.get(`/v1/chat/${chat.id}`)), 'chat'));
      const failed = await writeProblem(
        current().then((latest) => updateChat(latest, { variables })),
        'The script variables were not saved',
      );
      if (failed !== null) notify('The script variables were not saved', failed);
    }
  };

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
      case 'search': {
        // A42: the results are kept as a system line in the story, read by the next reply.
        const found = await searchWeb(command.query).catch((error: unknown) => {
          notify('No search', error instanceof Error ? error.message : undefined);
          return null;
        });
        if (found === null) return;
        if (found.context === '') {
          notify('Nothing found', `No results for “${command.query}”.`);
          return;
        }
        const saved = await create({
          chat_id: chat.id,
          parent_id: leaf,
          role: 'system',
          channel: 'ic',
          swipes: [found.context],
        });
        setLeafId(saved.id);
        return;
      }
      case 'help':
        notify('Commands', COMMAND_HELP.map(([usage, what]) => `${usage}: ${what}`).join('\n'));
        return;
    }
  };

  /** What each reply written in this visit cost (AP5), by message id. */
  const [replyCost, setReplyCost] = useState<ReadonlyMap<string, ReplyStats>>(new Map());
  /**
   * The round in play (the operator, 2026-11-22: "my lines were auto regenerated and ignored. A 2/2 was
   * created that discarded them"): the person's line starts a new one, stopping the one under way, and
   * whatever the old one still produces is dropped, never saved under the leaf it began from (which
   * made a sibling of the person's line and moved the view to it).
   */
  const roundRef = useRef(0);
  /** The decision model labels a saved story line (who acts, speech or action, its icon), then it re-renders. */
  const labelSaved = (id: string) =>
    void labelLines(chat.id, id).then((labelled) => {
      if (labelled) void list.mutate();
    });
  /**
   * The step the round is on (the operator, 2026-11-22: "my last message didn't seem to trigger a
   * response. Can we get a progress indicator for the decision model calls etc?"): shown under the
   * story while the table thinks, so a quiet round says where it is.
   */
  const [roundStep, setRoundStep] = useState<string | null>(null);
  // The decision models' calls, kept, grouped under the message each was about (GET /v1/decision_call);
  // read again when a turn ends, and while one runs.
  const decisionList = useSWR(
    ['rpg-ai', 'decision-calls', chat.id],
    async () => {
      const page = await client.get('/v1/decision_call', { chat_id: chat.id });
      const rows = Reflect.get(Object(page), 'decision_calls');
      return Array.isArray(rows) ? rows : [];
    },
    { shouldRetryOnError: false, refreshInterval: writing || roundStep !== null ? 2000 : 0 },
  );
  const decisionsByMessage = useMemo(() => {
    const by = new Map<string, DecisionCall[]>();
    for (const row of decisionList.data ?? []) {
      const call = readDecisionCall(row);
      if (call === null || call.messageId === null) continue;
      by.set(call.messageId, [...(by.get(call.messageId) ?? []), call]);
    }
    return by;
  }, [decisionList.data]);
  const during = async <T,>(label: string, work: Promise<T>): Promise<T> => {
    setRoundStep(label);
    try {
      return await work;
    } finally {
      setRoundStep((now) => (now === label ? null : now));
    }
  };
  const timedWrite = async (request: Parameters<typeof reply.write>[0]) => {
    const mine = roundRef.current;
    const { value, seconds } = await timed(() => reply.write(request));
    if (roundRef.current !== mine) return null;
    return value === null ? null : { ...value, seconds };
  };
  /**
   * A story reply, kept whole and in character (the operator, 2026-11-21): a reply that steps out of
   * the story ("I apologize… let me continue") is written once more with that span forbidden, and every
   * reply is cut back to its last complete sentence, so a cut-off never reaches the story.
   */
  // The chat's controls live in the app bar (the operator, 2026-11-21: "A lot of it should be in the
  // app bar. The scenario name isn't important in-game"); without one, a sticky bar of their own.
  const appBar = useSyncExternalStore(
    noSubscription,
    () => document.getElementById(APP_BAR_ACTIONS),
    () => null,
  );
  const inAppBar = (controls: ReactElement) =>
    appBar !== null ? (
      createPortal(<div className='flex min-w-0 flex-nowrap items-center justify-end gap-0.5'>{controls}</div>, appBar)
    ) : (
      <div className='sticky top-12 z-20 mx-auto flex w-full max-w-3xl flex-wrap items-center justify-end gap-1 bg-background/95 px-3 py-2 backdrop-blur'>
        {controls}
      </div>
    );
  // The right-hand sidebar's context, from this chat (components/play/ContextPanel.tsx).
  const contextCast = chat.character_ids.flatMap((id) => {
    const member = castById.get(id);
    return member === undefined ? [] : [{ id, name: member.name, line: member.folder }];
  });
  const contextRecent = branch.slice(-8).map((message) => ({
    speaker_id: message.speaker_character_id,
    text: message.swipes[message.swipe_index ?? 0] ?? '',
  }));
  const contextKey = JSON.stringify([chat.campaign_id, contextCast, play.playingId, contextRecent, lastRoll]);
  useEffect(() => {
    setContextPanel({
      campaignId: chat.campaign_id ?? null,
      cast: contextCast,
      seatId: play.playingId,
      recent: contextRecent,
      lastRoll,
    });
    // Only when what it shows changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);
  useEffect(() => () => setContextPanel(null), []);
  // The seat changes from beside Say and Do, in the bottom drawer (the operator, 2026-11-22).
  const seatSwitch = play.isCampaign ? (
    <SeatSwitch
      seat={play.playingId}
      party={chat.character_ids.flatMap((id) => {
        const character = castById.get(id);
        return character === undefined
          ? []
          : [
              {
                id,
                name: character.name,
                avatar: character.avatar,
                pc: character.tags.includes(PARTY_TAG),
                line: character.folder,
              },
            ];
      })}
      everyone={(cast.data ?? []).map((character) => ({
        id: character.id,
        name: character.name,
        avatar: character.avatar,
        pc: character.tags.includes(PARTY_TAG),
        line: character.folder,
      }))}
      onChange={(next) => {
        setSeatSaving(true);
        void play
          .setSeat(next, (id) => castById.get(id)?.tags.includes(PARTY_TAG) ?? false)
          .catch((error: unknown) => notify('The seat was not changed', error instanceof Error ? error.message : undefined))
          .finally(() => setSeatSaving(false));
      }}
    />
  ) : null;
  const streamText = reply.state.status === 'writing' ? reply.state.text : '';
  // The AI never writes the person's character (the operator, 2026-11-21: "it just did an entire
  // novel including both acting and speaking for my character"): the moment a line opens with the
  // seat's name, the reply stops there; what came before is kept, and the save cuts at the seat.
  const streamSeat = play.playingId === null ? '' : (castById.get(play.playingId)?.name ?? '');
  useEffect(() => {
    if (streamText === '' || streamSeat === '') return;
    const first = streamSeat.split(/\s+/)[0] ?? '';
    const forms = first.length >= 3 && first !== streamSeat ? [streamSeat, first] : [streamSeat];
    // Only the seat's own turn stops it: a structured line in their name (`Name:`, `Name (to …)`,
    // `Name (at …)`) or a roleplay action (`*Name …`). Prose that happens to them ("Tessaly is thrown
    // against the bulkhead") goes on (the operator, 2026-11-21: "Things need to still happen to my
    // character, just not by my character"); the save's check cuts what they'd do themselves.
    const opens = (line: string) =>
      forms.some(
        (form) =>
          line.startsWith(`*${form} `) ||
          [':', ' (to ', ' (at ', ' (vox', ' (voxcast'].some((next) => line.startsWith(`${form}${next}`)),
      );
    const lines = streamText
      .split('\n')
      .slice(1)
      .map((line) => line.trim());
    if (lines.some(opens)) reply.stop();
  }, [streamText, streamSeat, reply]);
  const streamItems = reply.state.status === 'writing' ? (reply.state.items ?? []) : [];
  const streamParts: { speaker_id: string | null; text: string; name?: string }[] = (() => {
    // A structured stream (schema-constrained): each item is shown under its speaker as it comes.
    if (streamItems.length > 0) {
      const runs: { speaker_id: string | null; text: string; name?: string }[] = [];
      for (const item of streamItems) {
        const who = item.kind === 'say' || item.kind === 'do' ? (item.speaker ?? null) : null;
        const line =
          item.kind === 'location'
            ? `[location: ${item.text}]`
            : item.kind === 'say'
              ? `${who ?? ''} (${item.manner !== null && item.manner !== 'speak' ? `${item.manner} ` : ''}to ${item.target ?? 'everyone'}): "${item.text}"`
              : item.kind === 'do'
                ? `${who ?? ''} ${item.text}`
                : item.text;
        const last = runs.at(-1);
        if (last !== undefined && (last.name ?? null) === who) last.text += `\n${line}`;
        else runs.push({ speaker_id: item.speaker_id, text: line, ...(who === null ? {} : { name: who }) });
      }
      return runs;
    }
    if (writingAfter?.speakerId !== NARRATOR_TURN || streamText === '')
      return [{ speaker_id: null as string | null, text: streamText }];
    const seatName = play.playingId === null ? '' : (castById.get(play.playingId)?.name ?? '');
    const castList = voicedCast;
    const parts = narrateSegments(streamText, castList, seatName).filter((part) => part.text.trim() !== '');
    return parts.length === 0 ? [{ speaker_id: null, text: streamText }] : parts;
  })();
  /**
   * After the narrator's turn the map follows the story, and every 6 rounds the world ticks
   * (docs/DESIGN.md, The world moves): both through the server, both quiet when nothing changed.
   */
  const rounds = useRef(0);
  /**
   * The map follows the story, then a change of place is a banner (the operator, 2026-11-21: "It got
   * the location change wrong again, it cited the old location"): the banner names where the map step
   * put the person's character, never the narrator's wording. Saved after the line as the new leaf,
   * so the round goes on from it. Returns the banner, or null.
   */
  const followOnMap = async (leaf: string): Promise<ChatMessage | null> => {
    const mine = roundRef.current;
    const change = await during('Following the story on the map', mapStep(chat.id, leaf));
    let banner: ChatMessage | null = null;
    // The banner marks a scene change in the VTT only (a new map or level), never a move within a scene
    // (the operator, 2026-11-23); a server that doesn't say falls back to a change of place. Its subtitle
    // is where that place is, fully qualified (up to the planet or system in 40k, the region in D&D).
    const shows = change !== null && (change.sceneChanged ?? change.seatMoved);
    if (roundRef.current === mine && shows && change.seatPlace !== null) {
      const within = change.seatChain.join(', ');
      banner = await create({
        chat_id: chat.id,
        parent_id: leaf,
        role: 'narrator',
        channel: 'ic',
        swipes: [stored(`[location: ${change.seatPlace}${within === '' ? '' : ` | ${within}`}]`, 'ai_output')],
      });
      setLeafId(banner.id);
    }
    rounds.current += 1;
    const arrivals =
      rounds.current % 6 === 0 ? await during('The world moves on', worldTick(chat.id, leaf, 10, 'rounds')) : [];
    // The campaign's status line (its one-liner in the campaign list) every 10 rounds.
    if (rounds.current % 10 === 0) void refreshStatusLine(chat.id, leaf);
    if (change !== null || arrivals.length > 0)
      // The map and the Context panel read the scene and its tokens: read them again.
      void globalMutate((key) => typeof key === 'string' && /scene|token/.test(key));
    return banner;
    // Quiet (the operator, 2026-11-21: "Why is it putting a title with the location on every
    // response"): the map and the Context panel show where everyone is; the story says who arrives.
  };
  /**
   * A structured turn the server already split and saved (docs/DESIGN.md, Structured lines): the
   * list is read again and the last of its messages is the new leaf. Null when nothing was saved.
   */
  const takeSaved = async (result: {
    saved?: readonly { id: string; speaker_character_id: string | null; text: string }[];
  }) => {
    const lines = result.saved ?? [];
    if (lines.length === 0) return null;
    const fresh = await list.mutate();
    const last = lines.at(-1);
    const saved = (fresh ?? []).find((one) => one.id === last?.id) ?? null;
    if (last !== undefined) setLeafId(last.id);
    const banner = play.isCampaign && last !== undefined ? await followOnMap(last.id) : null;
    return banner ?? saved;
  };
  /**
   * A story reply without the model's thinking (the local RC run, 2026-11-22: a thinking model's
   * "<think>Thinking Process…", never closed, was saved and shown as the character's line): only what
   * follows the reasoning is the story; a reply that is all reasoning counts as empty.
   */
  /** A saved line with the model's thinking kept before it (shown folded; the prompt strips it). */
  const thought = (written: object, text: string): string => {
    const reasoning = Reflect.get(written, 'reasoning');
    return typeof reasoning === 'string' && reasoning.trim() !== '' ? `<think>${reasoning.trim()}</think>\n\n${text}` : text;
  };
  const storyPart = async (request: Parameters<typeof reply.write>[0]) => {
    const written = await timedWrite(request);
    if (written === null || written.saved !== undefined) return written;
    const { reasoning, reply: told } = splitReasoning(written.text);
    return { ...written, text: told, raw: written.text, reasoning };
  };
  const storyWrite = async (request: Parameters<typeof reply.write>[0]) => {
    let result = await storyPart(request);
    if (result === null) return null;
    // The server split, checked and saved it: nothing to redo here.
    if (result.saved !== undefined) return result;
    // The first answer and why it was written again, kept on the saved line (the operator, 2026-11-22: "a
    // small icon beside the final output that will open the original response and reasoning").
    let revision: Revision | null = null;
    const revise = (kind: Revision['kind'], reason: string) => {
      if (revision === null && result !== null)
        revision = { original: (Reflect.get(result, 'raw') as string | undefined) ?? result.text, reason, kind };
    };
    // An empty answer (a soft refusal, a stream that ended with nothing) never vanishes silently
    // (the operator, 2026-11-21: "I also didn't get a response"): one more try, then a notice.
    if (completeText(result.text).trim() === '') {
      const again = await storyPart({ ...request, forbid: { names: [], span: '' } });
      if (again !== null) result = again;
    }
    // A replay of what was just told (the model copying its last round) is written once more with
    // that span forbidden (the operator's 23:19 transcript).
    // The whole story so far: replayOf keeps its own window (the last 6000 characters).
    const recentStory = branch
      .filter((message) => message.channel === 'ic')
      .map((message) => message.swipes[message.swipe_index ?? 0] ?? '');
    const replayed = replayOf(result.text, recentStory);
    if (replayed !== null) {
      revise('meta', 'It retold what had already been told.');
      const again = await storyPart({
        ...request,
        forbid: { names: [], span: replayed.span, spans: replayed.spans },
      });
      if (again !== null) result = again;
    }
    const broke = metaBreak(result.text);
    if (broke !== null) {
      revise('meta', 'It stepped out of the story.');
      const again = await storyPart({ ...request, forbid: { names: [], span: broke.span } });
      if (again !== null) result = again;
    }
    // Narration keeps what happens to the person's character and cuts at the first thing it would
    // have them do by choice, say, think or feel (the operator, 2026-11-21).
    const seat = play.playingId === null ? '' : (castById.get(play.playingId)?.name ?? '');
    let kept = request.mode === 'narrate' && seat !== '' ? seatCut(result.text, seat) : result.text;
    // A narration that opened with the seat's own doing was cut to nothing (the operator, 2026-11-22: "My
    // next response started generating something then disappeared"): written once more with that opening
    // forbidden, telling what they perceive and what happens around them.
    let cutAway = false;
    if (request.mode === 'narrate' && seat !== '' && completeText(kept).trim() === '' && result.text.trim() !== '') {
      revise('voice', `It narrated what ${seat} chose to do.`);
      const opening = result.text.trim().split(/(?<=[.!?…])\s/)[0] ?? result.text.trim();
      const again = await storyPart({ ...request, forbid: { names: [seat], span: opening } });
      if (again !== null) {
        result = again;
        kept = seatCut(again.text, seat);
      }
      cutAway = completeText(kept).trim() === '';
    }
    const whole = plainDashes(completeText(kept));
    if (whole.trim() === '') {
      notify(
        'The model gave no reply',
        cutAway
          ? `It only narrated ${seat}’s own choices, twice. Say or do what ${seat} does next, or narrate it as the GM.`
          : 'It answered with nothing twice: often a refusal under the chat’s content rating. Try again, or rephrase.',
      );
      return null;
    }
    // Canon: an AI line is checked and its notice shown; it is never rewritten for it (the operator,
    // 2026-11-22: "disable the auto rewrites of canon violations. It's a canon violation because of what I
    // did. If I want a rewrite I will trigger one").
    const speakerName =
      request.speaker_id === null || request.speaker_id === undefined
        ? 'The GM'
        : (castById.get(request.speaker_id)?.name ?? 'A character');
    const notice = chat.canon_checks !== false ? await checkLine(whole, speakerName).catch(() => null) : null;
    if (notice !== null && notice.level !== 'none') return { ...result, text: whole, canon: notice, revision };
    return { ...result, text: whole, canon: null as CanonNoticeValue | null, revision };
  };
  const noteCost = (id: string, written: { text: string; seconds: number }) =>
    setReplyCost((current) => new Map(current).set(id, replyStats(written.text, written.seconds)));

  /** The narrator (A20): the GM tells what happens next, as a narrator turn in the story. */
  const narrate = async () => {
    if (chat.paused) {
      notify('The game is paused', 'Resume to go on with the story.');
      return;
    }
    await narrateAfter(leaf);
  };

  /** The GM's narration after `parentId`, kept as a narrator turn; null when nothing was written. */
  const narrateAfter = async (parentId: string | null, wide = false): Promise<ChatMessage | null> => {
    setWritingAfter({ parentId, speakerId: NARRATOR_TURN });
    const result = await storyWrite({
      chat_id: chat.id,
      leaf_id: parentId,
      speaker_id: null,
      mode: 'narrate',
      structured: STRUCTURED_TURNS,
      // Wide: the narrator may give the party and the people present their moments (no decision came).
      ...(wide ? { narrate_wide: true } : {}),
    });
    setWritingAfter(null);
    if (result?.saved !== undefined) return takeSaved(result);
    if (result === null || result.text.trim() === '') return null;
    // The narrator may give other characters a moment in their own voice, as interludes (the
    // operator, 2026-11-21): each part is saved as its own line, credited to whoever speaks it. The
    // person's own character is never voiced; their name ends the narration there.
    const seatName = play.playingId === null ? '' : (castById.get(play.playingId)?.name ?? '');
    const castList = voicedCast;
    // The reformat model's runs when it sorted the prose (the operator, 2026-11-23: a second small model
    // formats the narration into lines, its speakers only people present); the reader's split otherwise.
    const parts =
      result.runs !== undefined
        ? partsOfRuns(result.runs, castList)
        : narrateSegments(result.text, castList, seatName).filter((part) => part.text.trim() !== '');
    let parent = parentId;
    let saved: ChatMessage | null = null;
    // A line is saved only as someone in the chat's cast (the server refuses anyone else, and the
    // round died on it: the hand-piloted run's 422). The campaign's people who speak here for the
    // first time join it, in one update. (A new unnamed speaker is added by ensure_person itself.)
    const newcomers = [
      ...new Set(
        parts.flatMap((part) =>
          part.speaker_id !== null && !chat.character_ids.includes(part.speaker_id) ? [part.speaker_id] : [],
        ),
      ),
    ];
    if (newcomers.length > 0) {
      // Read the chat afresh: within a round the one this page holds is already stale (the run's 412,
      // "The record was changed since it was read").
      const fresh = chatSchema.parse(Reflect.get(Object(await client.get(`/v1/chat/${chat.id}`)), 'chat'));
      const missing = newcomers.filter((id) => !fresh.character_ids.includes(id));
      if (missing.length > 0) await updateChat(fresh, { character_ids: [...fresh.character_ids, ...missing] });
    }
    for (const [index, found] of (parts.length > 0 ? parts : [{ speaker_id: null, text: result.text }]).entries()) {
      // Someone the campaign doesn't know yet (an unnamed barkeep) becomes a person of it the first
      // time they speak, and their lines are theirs (the operator, 2026-11-21).
      const named = Reflect.get(found, 'speaker_name');
      const part =
        found.speaker_id === null && typeof named === 'string' && named !== ''
          ? await ensurePerson(chat.id, named, found.text).then((id) =>
              id === null ? { ...found, text: `${named}: ${found.text}` } : { ...found, speaker_id: id },
            )
          : found;
      if (part !== found && part.speaker_id !== null)
        // The new person joins the cast: read the cast again for their name.
        void globalMutate((key) => JSON.stringify(key ?? '').match(/person|cast|world_entity|chat/) !== null);
      const line: ChatMessage = await create({
        chat_id: chat.id,
        parent_id: parent,
        ...(part.speaker_id === null
          ? { role: 'narrator' as const }
          : { role: 'character' as const, speaker_character_id: part.speaker_id }),
        channel: 'ic',
        // The model's thinking rides with the first line, folded when shown, never read back as story.
        swipes: [index === 0 ? thought(result, stored(part.text, 'ai_output')) : stored(part.text, 'ai_output')],
        // The first line of a rewritten narration carries what it replaced.
        revision: index === 0 ? ((Reflect.get(result, 'revision') as Revision | null | undefined) ?? null) : null,
      });
      labelSaved(line.id);
      if (index === 0) noteCost(line.id, result);
      autoTranslate(line.id, line.swipes[0] ?? '');
      parent = line.id;
      saved = line;
    }
    if (saved !== null) {
      setLeafId(saved.id);
      const narrationCanon = Reflect.get(result, 'canon') as CanonNoticeValue | null | undefined;
      if (narrationCanon) {
        const noted = saved.id;
        setCanonNotices((current) => new Map(current).set(noted, narrationCanon));
      }
      const banner = play.isCampaign ? await followOnMap(saved.id) : null;
      if (banner !== null) saved = banner;
    }
    return saved;
  }; // A campaign whose records say nothing of how it starts opens with the narrator's own opening (the
  // operator, 2026-11-22, of a cross-reference shown as the opening: "Completely unacceptable"): the
  // start screen asks for it once (?open=1), after the location banner.
  const opened = useRef(false);
  const openWanted = params.get('open') === '1';
  useEffect(() => {
    if (!openWanted || opened.current || list.data === undefined || branch.length !== 1 || writing) return;
    opened.current = true;
    router.replace(`/play/${chat.id}`);
    void narrateAfter(branch[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWanted, list.data, branch.length, writing]);

  /**
   * What follows the person's story line. A plain chat (no seat): one reply. At a table (the seat):
   * the round, as features/chat/seat decides it: the party members who speak up, each after the
   * last, then the AI GM's narration when the person sits as a player.
   */
  const playRound = async (start: ChatMessage, path: readonly ChatMessage[]) => {
    const mine = roundRef.current;
    const superseded = () => roundRef.current !== mine;
    if (chat.seat === null) {
      await replyAfter(start.id, path);
      return;
    }
    // The decision model runs the table (the operator, 2026-11-21): after each line it picks who
    // speaks next, the AI GM interjecting, or a pause for the person, by their seat. Undecided (no
    // decide model, or no usable answer) falls back to the order below.
    if (groupModes.order === 'decide') {
      const aiIds = new Set(play.isCampaign ? play.aiIds : chat.character_ids);
      let current = [...path];
      let parent: ChatMessage = start;
      // After a character's line, the decision model decides whether a roll is called for; the VTT
      // rolls it, the result is a roll line, and the narrator narrates it (never changing it).
      // The person's own turn always gets the narrator's account of what happens (the operator,
      // 2026-11-21: "no required narrator description"), rolled for or not.
      const rollAfter = async (
        line: ChatMessage,
        narrateAnyway = false,
        // The roll already asked for, alongside the GM's question (one wait, not two).
        prefetched?: Promise<Awaited<ReturnType<typeof decideRoll>>>,
      ): Promise<boolean> => {
        const actor = line.speaker_character_id;
        if (line.role !== 'character' || actor === null) return true;
        const roll = await during('Deciding whether this needs a roll', prefetched ?? decideRoll(chat.id, line.id, actor));
        if (roll === null) {
          if (!narrateAnyway) return true;
          const told = await narrateAfter(line.id);
          if (told === null) return false;
          parent = told;
          current = [...current, told];
          return true;
        }
        let text: string;
        try {
          text = await makeRoll(roll, castById.get(actor)?.name ?? 'The character', setLastRoll);
        } catch (error) {
          notify('The roll was not made', error instanceof Error ? error.message : undefined);
          return true;
        }
        if (superseded()) return false;
        const rolled = await create({
          chat_id: chat.id,
          parent_id: line.id,
          role: 'system',
          channel: 'roll',
          swipes: [text],
        });
        setLeafId(rolled.id);
        current = [...current, rolled];
        const told = await narrateAfter(rolled.id);
        if (told === null) {
          parent = rolled;
          return false;
        }
        parent = told;
        current = [...current, told];
        return true;
      };
      // The GM asks when the person's line is truly ambiguous (which one they punch); the pick
      // rewrites their line before anything reads it.
      // The GM's question and the roll are asked at once (each makes no model call when nothing
      // applies); a question's answer changes the line, so its roll is asked again after.
      const rollAsked =
        start.role === 'character' && start.speaker_character_id !== null
          ? decideRoll(chat.id, start.id, start.speaker_character_id)
          : undefined;
      // A figure the line approaches who isn't a person yet (the barkeeper) is authored first.
      const npcAsked = play.isCampaign ? npcNeeded(chat.id, start.id) : Promise.resolve(null);
      const question = play.isCampaign ? await during('Reading your line', clarify(chat.id, start.id)) : null;
      if (question !== null) {
        // A line that names one of the choices settles it without asking (the operator, 2026-11-22: "How
        // was this ambiguous?" of "Stares at the barkeep" with The Barkeep among the choices).
        const named = question.options.filter((one) => namesIn(start.swipes[start.swipe_index ?? 0] ?? '', one.label));
        const picked =
          named.length === 1
            ? (named[0]?.label ?? null)
            : await new Promise<string | null>((resolve) =>
                setAsking({
                  prompt: question.question,
                  options: question.options.map((one) => one.label),
                  asker: 'The GM',
                  other: true,
                  resolve,
                }),
              );
        // A typed answer (something else: the hearth) is aimed at as written.
        const chosen =
          question.options.find((one) => one.label === picked) ??
          (picked !== null && picked !== '' ? { label: picked } : undefined);
        if (chosen !== undefined) {
          // The pick names the target: each of the person's actions that named none is aimed at it.
          const seatName = play.playingId === null ? '' : (castById.get(play.playingId)?.name ?? '');
          const index = start.swipe_index ?? 0;
          const aimed = aimAt(start.swipes[index] ?? '', seatName, chosen.label);
          const swipes = start.swipes.map((old, at) => (at === index ? aimed : old));
          await update(start, { swipes });
          current = current.map((one) => (one.id === start.id ? { ...one, swipes } : one));
        }
      }
      const npc = await during('Checking who you meet', npcAsked);
      if (npc !== null) {
        setAuthoring({ name: npc.name, step: { label: `Authoring new NPC (${npc.name})`, done: 0, total: 1 } });
        const made = await authorNpc(chat.id, start.id, npc, (step) => setAuthoring({ name: npc.name, step }));
        setAuthoring(null);
        if (made === null) notify(`${npc.name} was not authored`, 'The story goes on without them.');
        // They join the cast (the server adds them to the chat): read the cast and the chat again.
        else await globalMutate((key) => JSON.stringify(key ?? '').match(/person|cast|world_entity|chat/) !== null);
      }
      if (superseded()) return;
      if (!(await rollAfter(start, true, question === null ? rollAsked : undefined))) return;
      let undecided = false;
      for (let step = 0; step < DECIDE_ROUND_LIMIT; step += 1) {
        if (superseded()) return;
        // The decision model gets three tries when it chokes (the operator, 2026-11-22).
        let next = await during('Deciding who acts next', decideNextTurn(chat.id, parent.id));
        for (let attempt = 1; attempt < DECIDE_TRIES && !next.decided && !superseded(); attempt += 1)
          next = await during('Deciding who acts next', decideNextTurn(chat.id, parent.id));
        if (superseded()) return;
        if (!next.decided) {
          undecided = true;
          break;
        }
        const usable = next.kind === 'character' && next.character_id !== null && aiIds.has(next.character_id);
        // The person's own line always gets an answer: a pause (or a pick outside the AI party)
        // straight after it becomes the AI GM's narration. Later in the round, it ends the round.
        if (!usable && next.kind !== 'gm') {
          if (parent !== start) return;
        }
        const saved =
          usable && next.character_id !== null
            ? await replyAfter(parent.id, current, next.character_id)
            : await narrateAfter(parent.id);
        if (saved === null) return;
        parent = saved;
        current = [...current, saved];
        if (!(await rollAfter(saved))) return;
      }
      if (!undecided) return;
      // Still no pick after three tries: the narrator carries the moment, prompted wide enough to give the
      // party and the people present their reactions (the operator, 2026-11-22: "then fall back to the
      // narrator being prompted wider to allow it to fill in"), never the person's own character.
      if (superseded()) return;
      await narrateAfter(parent.id, true);
      return;
    }
    const turns = roundTurns({
      seat: chat.seat,
      // In a campaign, the AI plays the party less the character the person plays.
      characterIds: play.isCampaign ? play.aiIds : chat.character_ids,
      branch: path,
      muted: chat.muted_ids,
      names: castNames,
      talkativeness: castTalk,
    });
    let current = [...path];
    let parent: ChatMessage = start;
    for (const turn of turns) {
      if (superseded()) return;
      const saved = turn === GM_TURN ? await narrateAfter(parent.id) : await replyAfter(parent.id, current, turn);
      // A turn that wrote nothing (stopped, or failed) ends the round there.
      if (saved === null) return;
      parent = saved;
      current = [...current, saved];
    }
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
    // Never nothing back (the operator, 2026-11-22: "Do out of game messages not trigger an out of game GM
    // response? Wtf? I got nothing back"): a refused or empty answer says so.
    if (result === null || result.text.trim() === '') {
      notify('The GM didn’t answer', 'The question is kept; ask again in a moment.');
      return;
    }
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

  /** A VTT roll's result, on the `roll` channel: a mechanical fact the story reads. */
  const addRoll = async (line: string) => {
    const saved = await create({ chat_id: chat.id, parent_id: leaf, role: 'system', channel: 'roll', swipes: [line] });
    setLeafId(saved.id);
  };

  const send = async (text: string, channel: ComposerChannel, images: string[] = []) => {
    if (channel === 'ic') {
      // A new round: the one under way stops, and what it still writes is dropped.
      roundRef.current += 1;
      if (writing) reply.stop();
    }
    const saved = await create({
      chat_id: chat.id,
      parent_id: leaf,
      // In the GM's seat, the person's story line is the GM's narration; the AI party reads it so.
      // In a character's seat (a campaign), it is that character's line: shown and read as theirs.
      ...(channel === 'ic' && play.isCampaign && play.playingId !== null
        ? { role: 'character' as const, speaker_character_id: play.playingId }
        : { role: chat.seat === 'gm' && channel === 'ic' ? ('narrator' as const) : ('user' as const) }),
      channel,
      swipes: [channel === 'ic' ? stored(text, 'user_input') : text],
      images,
    });
    setLeafId(saved.id);
    if (channel === 'gm') await askGm(saved);
    // Paused (A25): the story waits; the line is kept for when the table resumes.
    else if (channel === 'ic' && !chat.paused) await playRound(saved, [...branch, saved]);
  };

  /**
   * Edit, fork and regenerate (the operator, 2026-11-23): the edited line becomes a new alternative beside the
   * old one, and play runs on from it: the round for the person's own line, the GM's narration after any other.
   */
  const editFork = async (message: ChatMessage, text: string) => {
    roundRef.current += 1;
    if (writing) reply.stop();
    const copy = await create({
      chat_id: chat.id,
      parent_id: message.parent_id,
      role: message.role,
      channel: message.channel,
      ...(message.speaker_character_id === null ? {} : { speaker_character_id: message.speaker_character_id }),
      swipes: [text],
    });
    setLeafId(copy.id);
    const at = branch.findIndex((one) => one.id === message.id);
    const own =
      message.role === 'user' ||
      (play.isCampaign && message.speaker_character_id !== null && message.speaker_character_id === play.playingId);
    if (own) await playRound(copy, [...(at === -1 ? branch : branch.slice(0, at)), copy]);
    else if (message.channel === 'ic') await narrateAfter(copy.id);
  };

  /** Another alternative for a reply; with `endpointId`, from that model (AP4), to compare them side by side. */
  const regenerate = async (message: ChatMessage, endpointId?: string) => {
    // The person's own line is never rewritten by the model (the operator, 2026-11-22: "The regenerate
    // button is also not working... I can't get a response"; the server refused to voice the seat's
    // character): regenerating it answers it, the round running again from it.
    const own =
      message.role === 'user' ||
      (play.isCampaign && message.speaker_character_id !== null && message.speaker_character_id === play.playingId);
    if (own) {
      // A fork (the operator, 2026-11-22: "It also didnt trigger a fork and stacked up under existing
      // messages"): the line is resubmitted as a new alternative beside the old one, and the round runs
      // from it; the old branch stays, a page of the branch arrows away.
      const at = branch.findIndex((one) => one.id === message.id);
      roundRef.current += 1;
      if (writing) reply.stop();
      setRoundStep('Sending your line again');
      const copy = await create({
        chat_id: chat.id,
        parent_id: message.parent_id,
        role: message.role,
        channel: message.channel,
        ...(message.speaker_character_id === null ? {} : { speaker_character_id: message.speaker_character_id }),
        swipes: [message.swipes[message.swipe_index ?? 0] ?? ''],
      });
      setLeafId(copy.id);
      await playRound(copy, [...(at === -1 ? branch : branch.slice(0, at)), copy]);
      setRoundStep(null);
      return;
    }
    // A narration gets another telling, as a further swipe.
    if (message.speaker_character_id === null) {
      setWritingAfter({ parentId: message.parent_id, speakerId: NARRATOR_TURN });
      const told = await storyWrite({
        chat_id: chat.id,
        leaf_id: message.parent_id,
        speaker_id: null,
        mode: 'narrate',
        ...(endpointId === undefined ? {} : { endpoint_id: endpointId }),
      });
      setWritingAfter(null);
      if (told === null || told.text.trim() === '') return;
      await update(message, {
        swipes: [...message.swipes, stored(told.text, 'ai_output')],
        swipe_index: message.swipes.length,
      });
      noteCost(message.id, told);
      return;
    }
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
      swipes: [
        ...message.swipes,
        stored(withoutSpeakerPrefix(result.text, castById.get(message.speaker_character_id)?.name ?? ''), 'ai_output'),
      ],
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
      speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames, castTalk, turnOptions),
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
        speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames, castTalk, turnOptions),
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
          speaker_id: nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames, castTalk, turnOptions),
        }),
      );
    } catch (error) {
      setInspected(null);
      notify('The prompt could not be read', error instanceof Error ? error.message : undefined);
    }
  };

  /**
   * The shown branch as a file: SillyTavern's JSONL or plain text (every turn, table talk
   * included), or an illustrated EPUB of the story alone (AP10).
   */
  const exportBranch = async (format: 'jsonl' | 'text' | 'epub', illustrate = false) => {
    const speakers = messageViews(branch, all, castById, persona);
    const named = branch.map((message, index) => ({ ...message, name: speakers[index]?.speaker ?? NARRATOR }));
    const nameOf = new Map(named.map((message) => [message.id, message.name]));
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
        : format === 'text'
          ? chatToText(named)
          : storyEpub({
              title: chat.title,
              identifier: `urn:rpg-ai:chat:${chat.id}:${leaf ?? 'start'}`,
              language: navigator.language,
              modified: new Date().toISOString(),
              lines: await bookLines(
                storyLines(branch, (message) => nameOf.get(message.id) ?? NARRATOR),
                illustrate,
              ),
            });
    download(content, format);
  };

  /**
   * The book's lines; illustrated (AP10), each long run without a picture gets one drawn of the
   * scene up to its last line. Drawn for the book only: the chat keeps nothing. A picture that
   * can't be drawn is left out, and the book is made without it.
   */
  const bookLines = async (lines: StoryLine[], illustrate: boolean): Promise<StoryLine[]> => {
    if (!illustrate) return lines;
    const points = illustrationPoints(lines);
    const drawn = [...lines];
    // One at a time, chained: an image model is slow, and each picture follows the story so far.
    await points.reduce(async (previous, index, done) => {
      await previous;
      const line = drawn[index];
      if (line?.id === undefined) return;
      notify('Drawing pictures for the book', `${done + 1} of ${points.length}`);
      const picture = await drawPicture({ kind: 'scene', chat_id: chat.id, leaf_id: line.id }).catch(() => null);
      if (picture !== null) drawn[index] = { ...line, images: [picture.image] };
    }, Promise.resolve());
    return drawn;
  };

  const download = (content: string | Uint8Array<ArrayBuffer>, format: keyof typeof EXPORT_FILES) => {
    const file = EXPORT_FILES[format];
    const url = URL.createObjectURL(new Blob([content], { type: file.type }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${chat.title.replace(/[^\w.-]+/g, '_')}.${file.ending}`,
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

  // Auto-reply (audit gap 6): a quiet group's next member speaks by itself, never over a reply
  // being written, a seat change being saved, or a paused table.
  useAutoReply({
    seconds: chat.character_ids.length > 1 ? (groupModes.auto_seconds ?? 0) : 0,
    ready: !writing && writingAfter === null && !seatSaving && !chat.paused && list.data !== undefined,
    quietKey: leaf ?? '',
    onTurn: () => void replyAfter(leaf, branch),
  });

  // What the ⋯ menu held is in the right pop-out (the operator, 2026-11-22: "Everything in the ... can
  // move to the right pop out"), grouped as it was.
  const chatActions: ActionGroup[] = [
    {
      label: 'Play',
      actions: (
        [
          {
            label: chat.paused ? 'Resume' : 'Pause',
            icon: chat.paused ? Play : Pause,
            run: () =>
              void updateChat(chat, { paused: !chat.paused }).then(() =>
                notify(
                  chat.paused ? 'Resumed' : 'Paused',
                  chat.paused ? undefined : 'No story turns until you resume. The GM still answers.',
                ),
              ),
          },
          play.isCampaign
            ? {
                label: play.ending ? 'Ending the session…' : 'End session',
                icon: Flag,
                disabled: play.ending || endSession.ending,
                run: () =>
                  void play.endSession(branch.at(-1) ?? null).then((marker) => {
                    if (marker !== null) setLeafId(marker);
                    if (endSession.available) void endSession.end();
                    if (marker !== null) void refreshStatusLine(chat.id, marker);
                  }),
              }
            : endSession.available
              ? {
                  label: endSession.ending ? 'Writing the session report…' : 'End session',
                  icon: Flag,
                  disabled: endSession.ending,
                  run: () => void endSession.end(),
                }
              : null,
          { label: 'Chat settings', icon: Settings2, run: () => setSettingsOpen(true) },
        ] as (ChatAction | null)[]
      ).filter((one): one is ChatAction => one !== null),
    },
    {
      label: 'Scene and story',
      actions: (
        [
          {
            label: drawing ? 'Drawing the scene…' : 'Picture of the scene',
            icon: ImageIcon,
            disabled: drawing || chat.character_ids.length === 0,
            run: () => void drawScene(),
          },
          running !== undefined ? { label: 'Scenario', icon: Clock3, run: () => setScenarioOpen(true) } : null,
          { label: 'Every branch', icon: GitFork, run: () => setTreeOpen(true) },
          { label: 'Names without lore', icon: BookOpen, run: () => setNamesOpen(true) },
        ] as (ChatAction | null)[]
      ).filter((one): one is ChatAction => one !== null),
    },
    {
      label: 'Export',
      actions: [
        { label: 'For SillyTavern', icon: Download, run: () => void exportBranch('jsonl') },
        { label: 'As text', icon: Download, run: () => void exportBranch('text') },
        { label: 'As a book (EPUB)', icon: BookOpen, run: () => void exportBranch('epub') },
        { label: 'As an illustrated book', icon: BookOpen, run: () => void exportBranch('epub', true) },
      ],
    },
    {
      label: 'Tools',
      actions: [
        { label: 'Inspect the prompt', icon: ScanText, run: () => void openInspector() },
        { label: 'Reload the app', icon: RotateCw, run: () => window.location.reload() },
      ],
    },
  ];
  useEffect(() => setContextActions(chatActions));
  useEffect(() => () => setContextActions(null), []);
  // Only a chat that never loaded shows the problem (the operator, 2026-11-22: "When I switch tabs and come
  // back to chat in progress I get a NetworkError"): coming back re-reads the chat before a phone's network
  // is up, and that failed re-read replaced the chat, round and all. The chat stays; SWR tries again.
  if (list.error !== undefined && list.data === undefined)
    return <LoadProblem what='this chat' error={list.error} onRetry={() => list.mutate()} />;

  const pending = writingAfter === null ? undefined : castById.get(writingAfter.speakerId);
  const options = <T extends { id: string; name: string }>(rows: readonly T[] | undefined) =>
    (rows ?? []).map(({ id, name }) => ({ id, name }));

  return (
    <CanonOff.Provider
      value={
        chat.canon_checks === false
          ? null
          : () =>
              void updateChat(chat, { canon_checks: false }).then(() =>
                notify('Canon warnings are off for this campaign', 'Turn them back on in the chat settings.'),
              )
      }
    >
      <div
        // The window's height less the bar (3rem) and AppPage's padding (2.5rem): no scroll on a short chat.
        className='flex min-h-[calc(100svh-5.5rem)] flex-col bg-cover bg-fixed bg-center'
        // The chat's picture (A31) sits behind; the header and messages keep a solid background so
        // text never depends on the picture for contrast.
        style={background === null ? undefined : { backgroundImage: `url(${JSON.stringify(background)})` }}
      >
        {inAppBar(
          <>
            {campaign?.resolution_mode != null && (
              // The mode in force, always in view (A66).
              <Badge
                variant='outline'
                className='shrink-0 max-sm:hidden'
                title={`${campaign.name}: ${MODE_HINTS[campaign.resolution_mode]}`}
              >
                {MODE_LABELS[campaign.resolution_mode]}
              </Badge>
            )}
            {/* Wraps inside the screen on a phone: never wider than the bar (the audit's 780 px phone). */}
            <div className='flex min-w-0 flex-nowrap items-center justify-end gap-1'>
              {play.isCampaign && (
                // The app bar is the play screen's views as tabs (the operator, 2026-11-22: "The app bar becomes
                // tabbed views. Chat, Map, and any other views we add later").
                <div role='tablist' aria-label='Views' className='mr-auto flex items-center gap-1 rounded-lg bg-muted p-1'>
                  {PLAY_VIEWS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type='button'
                      role='tab'
                      aria-selected={view === id}
                      aria-label={label}
                      onClick={() => setView(id)}
                      className={cn(
                        'flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors',
                        view === id && 'bg-background text-foreground shadow-sm',
                      )}
                    >
                      <Icon aria-hidden className='size-4' />
                      <span className='max-sm:sr-only'>{label}</span>
                    </button>
                  ))}
                </div>
              )}
              {play.isCampaign && (
                // Every piece of context lives in the right-hand panel (the operator, 2026-11-21); its button is
                // the rightmost in the bar, beside the panel it opens (the operator, 2026-11-22).
                <Button
                  type='button'
                  variant='ghost'
                  className='h-11 max-sm:w-11 max-sm:px-0'
                  aria-label='Context'
                  onClick={toggleContext}
                >
                  <PanelRight aria-hidden className='size-4' />
                  <span className='max-sm:sr-only'>Context</span>
                </Button>
              )}
            </div>
          </>,
        )}
        {endSession.problem !== null && (
          <p role='alert' className='mx-auto w-full max-w-3xl px-3 pb-3 text-sm text-destructive'>
            {endSession.problem}
          </p>
        )}
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
        {view === 'map' && <MapView campaignId={chat.campaign_id ?? null} gm={chat.seat === 'gm'} />}
        <EntityLinksProvider campaignId={chat.campaign_id ?? null} entities={linkable}>
          <ol
            className={cn(
              'mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-3 pb-4',
              view === 'map' && 'hidden',
              TEXT_SIZE_CLASS[settings.textSize],
              settings.chatLayout === 'document' && 'gap-3 font-serif',
              background !== null && 'bg-background pt-3',
            )}
            aria-label='Chat'
            aria-live='polite'
          >
            {list.data === undefined && <SkeletonRows rows={4} avatar />}
            {list.data !== undefined && views.length === 0 && writingAfter === null && !hidden.pending && (
              <li className='rounded-xl border border-dashed p-6 text-center text-muted-foreground'>
                Say something to begin.
              </li>
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
                    names={everyName}
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
                    onRegenerate={
                      message.role === 'character' && !writing && roundStep === null
                        ? () => void regenerate(message)
                        : undefined
                    }
                    onRegenerateWith={
                      message.role === 'character' && !writing && modelList.length > 1
                        ? {
                            models: modelList.map((one) => ({ id: one.id, name: one.name })),
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
                    onEditFork={!writing && roundStep === null ? (text) => void editFork(message, text) : undefined}
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
                      notify(
                        play.isCampaign ? 'Rewound to here' : 'Branching from here',
                        play.isCampaign
                          ? 'The story goes on from this line; what came after stays as a branch.'
                          : 'Your next message starts a new branch.',
                      );
                    }}
                    branchLabel={play.isCampaign ? 'Rewind to here' : undefined}
                    onForkCampaign={
                      play.isCampaign
                        ? () =>
                            void play
                              .fork(message, branch)
                              .then((id) => {
                                if (id !== null) {
                                  notify('Forked', 'A new campaign goes on from that line.');
                                  router.push(`/play/${id}`);
                                }
                              })
                              .catch((error: unknown) =>
                                notify(
                                  'The campaign was not forked',
                                  error instanceof Error ? error.message : String(error),
                                ),
                              )
                        : undefined
                    }
                    onDelete={() => deleteMessage(message)}
                    onXCard={(reason) => {
                      void update(message, { x_carded: !message.x_carded });
                      // A reason given is kept for the GM as a table note, so the story stays away from it.
                      if (!message.x_carded && reason !== '')
                        void addNote({ kind: 'tone', text: `X-card: keep away from ${reason}` });
                    }}
                    onHide={() => void update(message, { hidden: !message.hidden })}
                    onContinue={
                      message.role === 'character' && message.id === leaf && !writing
                        ? () => void continueMessage(message)
                        : undefined
                    }
                    onSpeak={canSpeak ? () => readAloud(message.speaker_character_id, shown.text) : undefined}
                    onSpeakFrom={canSpeak ? () => readThrough(message.id) : undefined}
                    onFeedback={
                      feedbackOn && message.role !== 'user'
                        ? {
                            given: feedbackGiven.get(message.id) ?? null,
                            send: (verdict, reason, note) => void sendFeedback(message.id, verdict, reason, note),
                          }
                        : undefined
                    }
                    translation={translationOf(message.id)}
                    canon={canonNotices.get(message.id)}
                    revision={message.revision ?? null}
                    labels={readLabels(Reflect.get(message, 'line_labels'))}
                    decisions={decisionsByMessage.get(message.id)}
                  />
                </li>
              );
            })}
            {writingAfter !== null && (
              // The narrator's stream splits as it comes (the operator, 2026-11-21: "As soon as the model
              // types the character's name it should transition to them typing"): each part shows under
              // whoever it belongs to, the last one writing.
              <>
                {streamParts.map((part, index) => {
                  const member = part.speaker_id === null ? null : castById.get(part.speaker_id);
                  const last = index === streamParts.length - 1;
                  return (
                    // Stream parts have no identity beyond their place in the stream.
                    <li key={index}>
                      <MessageItem
                        layout={settings.chatLayout}
                        names={everyName}
                        writing={last}
                        message={{
                          id: `writing-${index}`,
                          role:
                            member == null && part.name === undefined
                              ? writingAfter?.speakerId === NARRATOR_TURN
                                ? 'narrator'
                                : 'character'
                              : 'character',
                          channel: 'ic',
                          speaker:
                            member?.name ??
                            part.name ??
                            pending?.name ??
                            (writingAfter?.speakerId === '' ? TABLE.gm_name : NARRATOR),
                          avatar:
                            member?.avatar ?? (member == null && part.name === undefined ? (pending?.avatar ?? null) : null),
                          text: part.text,
                          swipe: { index: 0, count: 1 },
                          fork: { index: 0, count: 1 },
                          bookmarked: false,
                          images: [],
                        }}
                      />
                    </li>
                  );
                })}
              </>
            )}
            {roundStep !== null && authoring === null && !writing && (
              <li>
                <p role='status' className='flex items-center gap-2 px-1 text-sm text-muted-foreground'>
                  <LoaderCircle aria-hidden className='size-4 animate-spin' /> {roundStep}…
                </p>
              </li>
            )}
            {authoring !== null && (
              // The GM authoring an NPC the story needs, before the round goes on.
              <li>
                <div role='status' className='grid gap-2 rounded-lg border border-dashed px-3 py-3 text-sm'>
                  <span className='font-medium'>Authoring new NPC ({authoring.name})</span>
                  <div
                    role='progressbar'
                    aria-label={`Authoring ${authoring.name}`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(1, authoring.step.total)}
                    aria-valuenow={authoring.step.done}
                    className='h-2 overflow-hidden rounded-full bg-muted'
                  >
                    <div
                      className='h-full rounded-full bg-primary transition-[width] duration-500'
                      style={{
                        width: `${Math.max(8, Math.round((authoring.step.done / Math.max(1, authoring.step.total)) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className='text-xs text-muted-foreground'>{authoring.step.label}…</span>
                </div>
              </li>
            )}
          </ol>
        </EntityLinksProvider>
        <div ref={end} />
        {speaking !== null && (
          // While anything is read aloud, a way to stop it.
          <div className='sticky bottom-2 z-10 mx-auto flex w-full max-w-3xl justify-end px-3'>
            <Button type='button' variant='secondary' className='h-11 gap-2 shadow-md' onClick={stopReading}>
              <Square aria-hidden className='size-4' /> Stop reading
            </Button>
          </div>
        )}
        {asking !== null && (
          <ScriptPrompt
            prompt={asking.prompt}
            options={asking.options}
            asker={asking.asker}
            other={asking.other}
            onAnswer={(answer) => {
              asking.resolve(answer);
              setAsking(null);
            }}
          />
        )}
        {staged !== undefined && settings.showExpressions && (
          // The stage (A4): the latest speaker, as their line feels.
          <figure className='mx-auto flex w-full max-w-3xl items-end justify-center px-3'>
            <TalkingSprite
              image={staged.image}
              talkingImage={
                sprites.find((sprite) => sprite.character_id === staged.character_id && sprite.label === TALKING_LABEL)
                  ?.image ?? null
              }
              speaking={speaking === staged.character_id}
              alt={`${castById.get(staged.character_id)?.name ?? 'The speaker'}, ${staged.label}`}
            />
          </figure>
        )}
        {/* The decision model picks who speaks (the operator, 2026-11-21: the turn bar is obsolete); the
          bar stays only for the manual orders chosen in the chat's settings. */}
        {chat.character_ids.length > 1 && groupModes.order !== 'decide' && (
          <NextSpeaker
            cast={chat.character_ids.flatMap((id) => {
              const character = castById.get(id);
              return character === undefined ? [] : [{ id, name: character.name }];
            })}
            picked={picked}
            upNext={nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames, castTalk, turnOptions)}
            onPick={setPicked}
          />
        )}
        <Composer
          seatSwitch={seatSwitch}
          speechOptions={speechOptions.data ?? undefined}
          queue={
            // Every chat's turn is queued Say, Do and Out of game items (the operator, 2026-11-21: the
            // Story / Table talk / Ask the GM switch is gone). Outside a campaign the person speaks as
            // their persona.
            {
              me: play.isCampaign
                ? play.playingId === null
                  ? null
                  : { id: play.playingId, name: castById.get(play.playingId)?.name ?? 'You' }
                : { id: 'persona', name: persona?.name ?? 'You' },
              speakers: chat.character_ids.flatMap((id) => {
                const member = castById.get(id);
                return member === undefined ? [] : [{ id, name: member.name }];
              }),
              present: [
                ...chat.character_ids.flatMap((id) => {
                  const member = castById.get(id);
                  return member === undefined || id === play.playingId ? [] : [{ id, name: member.name }];
                }),
                // Who else the story has in view: anyone of the campaign's people named in the last
                // few lines (a hostile, an NPC), so a Do or Say can be aimed at them.
                ...(cast.data ?? [])
                  .filter((one) => !chat.character_ids.includes(one.id) && one.id !== play.playingId)
                  .filter((one) => {
                    const first = one.name.split(/\s+/)[0] ?? one.name;
                    return branch
                      .slice(-8)
                      .some((message) =>
                        (message.swipes[message.swipe_index ?? 0] ?? '').includes(first.length >= 3 ? first : one.name),
                      );
                  })
                  .slice(0, 12)
                  .map((one) => ({ id: one.id, name: one.name })),
              ],
            }
          }
          onCheckCanon={(text, signal) =>
            checkLine(
              text,
              play.playingId === null
                ? chat.seat === 'gm'
                  ? 'The GM'
                  : (persona?.name ?? 'The player')
                : (castById.get(play.playingId)?.name ?? 'The player'),
              signal,
            )
          }
          writing={writing}
          // Not before the seat's character is known: a line would be saved as "You" (the run's first line).
          disabled={list.data === undefined || (play.isCampaign && play.playingId !== null && !castById.has(play.playingId))}
          onSend={(text, channel, images) => void send(text, channel, images)}
          onStop={reply.stop}
          onImpersonate={chat.character_ids.length > 0 ? impersonate : undefined}
          onNarrate={chat.character_ids.length > 0 ? () => void narrate() : undefined}
          onCommand={(command) => void runCommand(command)}
          onScript={(script, setInput) => void runUserScript(script, setInput)}
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
                char:
                  castById.get(
                    nextSpeaker(chat.character_ids, branch, chat.muted_ids, castNames, castTalk, turnOptions) ?? '',
                  )?.name ?? NARRATOR,
                user: persona?.name ?? DEFAULT_USER_NAME,
              }),
            }))}
        />
        {/* The context lives in the app wrapper's right-hand sidebar (the framework's pop-out from the
            right, as the navigation is from the left). */}
        <SidebarContent title='Context'>{CONTEXT_SIDEBAR}</SidebarContent>
        <SheetPanel
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          cast={chat.character_ids.flatMap((id) => {
            const character = castById.get(id);
            return character === undefined ? [] : [{ id, name: character.name }];
          })}
          initial={play.playingId}
        />
        <RollSheet
          open={rollOpen}
          onOpenChange={setRollOpen}
          rollers={chat.character_ids.flatMap((id) => {
            const character = castById.get(id);
            return character === undefined ? [] : [{ id, name: character.name }];
          })}
          initial={play.playingId}
          onRolled={(line) =>
            void addRoll(line).catch((error: unknown) =>
              notify('The roll was not recorded', error instanceof Error ? error.message : undefined),
            )
          }
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
                  speaker: treeOpen
                    ? (messageViews([row.message], all, castById, persona)[0]?.speaker ?? NARRATOR)
                    : NARRATOR,
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
          campaign={play.isCampaign}
          profiles={profileList.data ?? []}
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
            canon_checks: chat.canon_checks !== false,
            narrator_style: chat.narrator_style as NarratorStyle,
            seat: chat.seat,
            lines: chat.lines,
            veils: chat.veils,
            table_notes: chat.table_notes,
            campaign_id: chat.campaign_id,
            scenario_id: chat.scenario_id,
            group_settings: chat.group_settings as GroupSettings,
          }}
          scenarios={(scenarioList.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
          campaigns={(campaignList.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
          cast={chat.character_ids.flatMap((id) => {
            const character = castById.get(id);
            return character === undefined ? [] : [{ id, name: character.name }];
          })}
          folders={foldersOf(chatList.data ?? [])}
          onSummarize={summarize}
          drawBackground={() => drawPicture({ kind: 'background', chat_id: chat.id, leaf_id: leaf })}
          personas={options(personaList.data)}
          presets={options(presetList.data)}
          endpoints={options(modelList)}
          lorebooks={options(lorebookList.data)}
          onSave={(next) => void updateChat(chat, next)}
        />
      </div>
    </CanonOff.Provider>
  );
}

export function ChatView({ id }: { id: string }): ReactElement {
  const chat = chats.useOne(id);
  if (chat.error !== undefined && chat.data === undefined)
    return <LoadProblem what='this chat' error={chat.error} onRetry={() => chat.mutate()} />;
  if (chat.data === undefined) return <SkeletonRows rows={4} avatar />;
  return <ChatSurface chat={chat.data} />;
}
