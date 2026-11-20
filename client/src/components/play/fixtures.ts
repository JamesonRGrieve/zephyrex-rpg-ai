// SPDX-License-Identifier: AGPL-3.0-or-later
/** Sample messages for stories and tests. */
import type { MessageView } from './MessageItem';

export const ADA_REPLY: MessageView = {
  id: 'm-2',
  role: 'character',
  channel: 'ic',
  speaker: 'Ada Vance',
  avatar: null,
  text: '*wipes her hands on a rag* "Mind the coolant," she says. "It bites."',
  swipe: { index: 0, count: 2 },
  fork: { index: 0, count: 1 },
  bookmarked: false,
};

export const USER_LINE: MessageView = {
  ...ADA_REPLY,
  id: 'm-1',
  role: 'user',
  speaker: 'Sam',
  text: 'I hand her the spanner.',
  swipe: { index: 0, count: 1 },
  fork: { index: 1, count: 2 },
};

export const TABLE_TALK: MessageView = {
  ...USER_LINE,
  id: 'm-3',
  channel: 'ooc',
  text: 'Can we skip ahead to docking?',
  fork: { index: 0, count: 1 },
};
