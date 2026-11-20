// SPDX-License-Identifier: AGPL-3.0-or-later
/** Sample World Info for stories and tests. */
import { LORE } from '~/contract';
import type { EntryFields } from '~/features/import/stLorebook';

export const BLANK_ENTRY: EntryFields = {
  comment: '',
  keys: [],
  secondary_keys: [],
  selective_logic: 'and_any',
  content: '',
  enabled: true,
  constant: false,
  position: 'after_char',
  depth: LORE.defaults.depth,
  role: 'system',
  order: LORE.defaults.order,
  probability: LORE.defaults.probability,
  group: '',
  group_weight: LORE.defaults.group_weight,
  prioritize: false,
  sticky: 0,
  cooldown: 0,
  delay: 0,
  exclude_recursion: false,
  prevent_recursion: false,
  delay_until_recursion: false,
  case_sensitive: null,
  match_whole_words: null,
  character_names: [],
  character_exclude: false,
};

export const SPANNER_ENTRY: EntryFields = {
  ...BLANK_ENTRY,
  comment: 'Cursed spanners',
  keys: ['spanner', '/wrench(es)?/i'],
  content: 'Every spanner aboard the Kestrel is cursed: it slips at the worst moment.',
  sticky: 2,
};
