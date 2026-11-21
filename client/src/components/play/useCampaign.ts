// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A chat as a campaign (docs/DESIGN.md, The play model; the operator, 2026-11-21). A chat with a
 * play state is a campaign: its story is the chat's message tree, its party the chat's cast.
 * - **The seat** hot-swaps at any time: the GM (null) or any character; a character from outside
 *   the party joins it while played. The chat's `seat` follows (`gm` or `player`).
 * - **Sessions** are the story's segments: ending one writes its summary, marks the next one's
 *   start with a "Session n" line, and opens it. Replies read the current session's lines and the
 *   earlier sessions by their summaries (features/chat/play, both editions).
 * - **Rewind** is the branch tree: going back to a line and playing on keeps the later lines as a
 *   branch. **Fork** copies the story up to a line into a new campaign of the same scenario.
 */
import { useMemo, useState } from 'react';
import { useClient } from 'zephyrex';
import { notify } from 'zephyrex/hooks/useToast';
import { aiCast, sessionStartIndex } from '~/features/chat/play';
import { summarizeBranch } from '~/features/chat/inspectPrompt';
import { type CampaignPlay, type ChatSession, campaignPlays, chatSessions, sessionName } from '~/features/data/playRecords';
import { type Chat, type ChatMessage, chatSchema, chats, messages } from '~/features/data/records';

export interface CampaignState {
  /** Whether this chat is a campaign (else a sandbox chat). */
  isCampaign: boolean;
  play: CampaignPlay | null;
  sessions: ChatSession[];
  /** The session the shown branch is in. */
  current: ChatSession | null;
  /** The character the person plays, or null for the GM's seat (or a sandbox chat). */
  playingId: string | null;
  /** The characters the AI plays. */
  aiIds: string[];
  setSeat: (playingId: string | null, isPartyMember?: (id: string) => boolean) => Promise<void>;
  ending: boolean;
  endSession: (leaf: ChatMessage | null) => Promise<string | null>;
  fork: (at: ChatMessage, path: readonly ChatMessage[]) => Promise<string | null>;
}

export function useCampaign(chat: Chat, branch: readonly ChatMessage[]): CampaignState {
  const plays = campaignPlays.useList({ chat_id: chat.id });
  const sessionList = chatSessions.useList({ chat_id: chat.id });
  const { update: updatePlay, create: createPlay } = campaignPlays.useActions();
  const { update: updateSession, create: createSession } = chatSessions.useActions();
  const { update: updateChat, create: createChat } = chats.useActions();
  const { create: createMessage } = messages.useActions();
  const [ending, setEnding] = useState(false);
  const client = useClient();

  const play = plays.data?.[0] ?? null;
  const sessions = useMemo(() => sessionList.data ?? [], [sessionList.data]);
  const startIndex = sessionStartIndex(branch, sessions);
  const current =
    sessions
      .filter((session) => branch[startIndex]?.id === session.start_message_id)
      .sort((a, b) => b.number - a.number)[0] ?? null;
  const playingId = play?.playing_id ?? null;

  /** The chat as saved now: a line written since this page read it moved its version on (If-Match). */
  const freshChat = async (): Promise<Chat> =>
    chatSchema.parse(Reflect.get(Object(await client.get(`/v1/chat/${chat.id}`)), 'chat'));

  /**
   * Takes a seat. An NPC taken over joins the party while played: when the seat moves off a
   * character who isn't a party member (`isPartyMember`, the PC tag), they leave it again.
   */
  const setSeat = async (next: string | null, isPartyMember: (id: string) => boolean = () => true) => {
    if (play === null) return;
    const previous = play.playing_id;
    await updatePlay(play, { playing_id: next });
    const current = await freshChat();
    const leaving = previous !== null && previous !== next && !isPartyMember(previous) ? previous : null;
    const kept = current.character_ids.filter((id) => id !== leaving);
    const joins = next !== null && !kept.includes(next);
    const cast = joins ? [...kept, next] : kept;
    // One write to the chat: the seat, and who is in the party now.
    await updateChat(current, {
      seat: next === null ? 'gm' : 'player',
      ...(cast.length === current.character_ids.length && !joins
        ? {}
        : { character_ids: cast, mode: cast.length > 1 ? ('group' as const) : ('character' as const) }),
    });
  };

  const endSession = async (leaf: ChatMessage | null): Promise<string | null> => {
    if (play === null || leaf === null) return null;
    setEnding(true);
    try {
      const number = current?.number ?? 1;
      const summary = await summarizeBranch({
        chat_id: chat.id,
        leaf_id: leaf.id,
        speaker_id: aiCast(chat.character_ids, playingId)[0] ?? null,
      }).catch(() => null);
      if (current !== null) {
        await updateSession(current, { summary: summary?.text ?? '', ended_at: new Date().toISOString() });
      }
      // The next session starts at a marker line: a save point the story picks up from.
      const marker = await createMessage({
        chat_id: chat.id,
        parent_id: leaf.id,
        role: 'system',
        channel: 'system',
        swipes: [sessionName({ number: number + 1, title: '' })],
      });
      await createSession({ chat_id: chat.id, number: number + 1, start_message_id: marker.id });
      notify(
        `${sessionName({ number, title: current?.title ?? '' })} ended`,
        summary === null ? 'No summary was written.' : 'Its summary carries the story on.',
      );
      return marker.id;
    } finally {
      setEnding(false);
    }
  };

  const fork = async (at: ChatMessage, path: readonly ChatMessage[]): Promise<string | null> => {
    const upTo = path.slice(0, path.findIndex((message) => message.id === at.id) + 1);
    if (upTo.length === 0) return null;
    const copy = await createChat({
      title: `${chat.title} (fork)`.slice(0, 200),
      character_ids: chat.character_ids,
      mode: chat.mode,
      seat: chat.seat,
      persona_id: chat.persona_id,
      campaign_id: chat.campaign_id,
      scenario_id: chat.scenario_id,
      lorebook_ids: chat.lorebook_ids,
      folder: chat.folder,
      summary: chat.summary,
      author_note: chat.author_note,
    });
    // The story up to the fork, line by line; each copy answers the one before it.
    const ids = new Map<string, string>();
    let parent: string | null = null;
    for (const message of upTo) {
      const made: ChatMessage = await createMessage({
        chat_id: copy.id,
        parent_id: parent,
        role: message.role,
        channel: message.channel,
        speaker_character_id: message.speaker_character_id,
        swipes: message.swipes,
        swipe_index: message.swipe_index,
      });
      ids.set(message.id, made.id);
      parent = made.id;
    }
    await createPlay({ chat_id: copy.id, playing_id: playingId, forked_from_id: chat.id, forked_at_message_id: at.id });
    // Its sessions are those that began on the copied story; a story with none starts Session 1.
    const kept = sessions.filter((session) => ids.has(session.start_message_id));
    for (const session of kept) {
      await createSession({
        chat_id: copy.id,
        number: session.number,
        start_message_id: ids.get(session.start_message_id) ?? '',
        title: session.title,
        summary: session.summary,
        ended_at: session.ended_at,
      });
    }
    if (kept.length === 0)
      await createSession({ chat_id: copy.id, number: 1, start_message_id: ids.get(upTo[0]?.id ?? '') ?? '' });
    return copy.id;
  };

  return {
    isCampaign: play !== null,
    play,
    sessions,
    current,
    playingId,
    aiIds: aiCast(chat.character_ids, playingId),
    setSeat,
    ending,
    endSession,
    fork,
  };
}
