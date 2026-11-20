// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '~/features/data/records';
import { messageViews } from './ChatView';

const STAMP = '2026-11-20T00:00:00.000000';
const message = (id: string, parent: string | null, extra: Partial<ChatMessage>): ChatMessage => ({
  id,
  created_at: STAMP,
  updated_at: STAMP,
  chat_id: 'chat',
  parent_id: parent,
  role: 'user',
  channel: 'ic',
  speaker_character_id: null,
  swipes: ['text'],
  swipe_index: 0,
  bookmarked: false,
  ...extra,
});

describe('messageViews', () => {
  const greeting = message('g', null, { role: 'character', speaker_character_id: 'ada', swipes: ['Hi', 'Hello'], swipe_index: 1 });
  const mine = message('u1', 'g', { swipes: ['I wave.'] });
  const other = message('u2', 'g', { channel: 'ooc', swipes: ['brb'] });
  const cast = new Map([['ada', { name: 'Ada', avatar: null }]]);

  it('names the speakers, shows the chosen swipe and counts the fork', () => {
    const views = messageViews([greeting, mine], [greeting, mine, other], cast, { name: 'Sam', avatar: null });
    expect(views.map((view) => [view.speaker, view.text, view.swipe, view.fork])).toEqual([
      ['Ada', 'Hello', { index: 1, count: 2 }, { index: 0, count: 1 }],
      ['Sam', 'I wave.', { index: 0, count: 1 }, { index: 0, count: 2 }],
    ]);
  });

  it('calls the person "You" without a persona, and an unknown voice the narrator', () => {
    const lost = message('x', null, { role: 'character', speaker_character_id: 'gone' });
    expect(messageViews([mine, lost], [mine, lost], cast, null).map((view) => view.speaker)).toEqual(['You', 'Narrator']);
  });
});
