// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The play model (docs/DESIGN.md, The play model; the operator, 2026-11-21): a campaign is a save
 * state of a scenario, its story one tree of messages; sessions are its segments, "save points"
 * that compact the story into summaries; the person's seat hot-swaps to the GM or any character.
 *
 * Pure rules, twinned by server/extensions/ai_chat/Play.py and held to contract/play-cases.json:
 * - what a reply reads: the current session's lines only, earlier sessions by their summaries;
 * - who the person is: the character they play (their seat), else their persona;
 * - who the AI plays: the party, less the character the person plays.
 */
import cases from '../../../../contract/play-cases.json';

export interface SessionMark {
  number: number;
  /** The session's first message (its opening line). */
  start_message_id: string;
  /** What happened, once the session ended. */
  summary: string;
}

/**
 * Where the reply's history starts on a branch: at the latest session whose first message is on
 * the branch (so a rewind to an earlier session reads that session); 0 with none.
 */
export function sessionStartIndex(path: readonly { id: string }[], sessions: readonly SessionMark[]): number {
  const at = new Map(path.map((message, index) => [message.id, index]));
  let start = 0;
  let latest = -Infinity;
  for (const session of sessions) {
    const index = at.get(session.start_message_id);
    if (index !== undefined && session.number > latest) {
      latest = session.number;
      start = index;
    }
  }
  return start;
}

/** The story so far, as the reply reads it: the summaries of the sessions before the current one, in order. */
export function sessionsSummary(path: readonly { id: string }[], sessions: readonly SessionMark[]): string {
  const at = new Map(path.map((message, index) => [message.id, index]));
  const start = sessionStartIndex(path, sessions);
  return [...sessions]
    .filter((session) => {
      const index = at.get(session.start_message_id);
      return index !== undefined && index < start && session.summary.trim() !== '';
    })
    .sort((a, b) => a.number - b.number)
    .map((session) => `${cases.session_heading.replace('{n}', String(session.number))}\n${session.summary.trim()}`)
    .join('\n\n');
}

export interface PlayedCard {
  id: string;
  name: string;
  description: string;
}

/** Who the person is in the prompt: the character they play, when their seat is one; else their persona. */
export function playedPersona<P extends { name: string; description: string }>(
  playing: PlayedCard | null,
  persona: P | null,
): { name: string; description: string } | null {
  return playing === null ? persona : { name: playing.name, description: playing.description };
}

/** The characters the AI plays: the party, less the one the person plays. */
export function aiCast(party: readonly string[], playingId: string | null): string[] {
  return playingId === null ? [...party] : party.filter((id) => id !== playingId);
}
