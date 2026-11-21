// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The play model's records (docs/DESIGN.md, The play model): a campaign's sessions, and its play
 * state (which chats are campaigns, who the person plays, where a fork came from). Served by
 * /v1/chat_session and /v1/campaign_play in both editions (sessionRecords.ts, BLL_AI_Session.py).
 */
import { z } from 'zod';
import { resource } from './records';

const versioned = { id: z.string(), created_at: z.string(), updated_at: z.string().nullable() };

export const sessionSchema = z.object({
  ...versioned,
  chat_id: z.string(),
  number: z.number().int(),
  title: z.string(),
  start_message_id: z.string(),
  summary: z.string(),
  ended_at: z.string().nullable(),
});
export type ChatSession = z.infer<typeof sessionSchema>;
export const chatSessions = resource<
  ChatSession,
  { chat_id: string; number: number; start_message_id: string; title?: string; summary?: string; ended_at?: string | null }
>('chat_session', 'chat_sessions', sessionSchema);

export const playSchema = z.object({
  ...versioned,
  chat_id: z.string(),
  playing_id: z.string().nullable(),
  forked_from_id: z.string().nullable(),
  forked_at_message_id: z.string().nullable(),
});
export type CampaignPlay = z.infer<typeof playSchema>;
export const campaignPlays = resource<
  CampaignPlay,
  { chat_id: string; playing_id?: string | null; forked_from_id?: string | null; forked_at_message_id?: string | null }
>('campaign_play', 'campaign_plays', playSchema);

/** A session's name: its title, else "Session n". */
export function sessionName(session: Pick<ChatSession, 'number' | 'title'>): string {
  return session.title.trim() === '' ? `Session ${session.number}` : session.title.trim();
}
