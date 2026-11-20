// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Campaign } from '~/features/data/records';

export const KESTREL: Campaign = {
  id: 'k1',
  created_at: '2026-11-20T00:00:00',
  updated_at: null,
  name: 'The Kestrel',
  premise: 'Smugglers on a dying freighter, one job from freedom.',
  genre: 'Space opera',
  dials: { grim_hopeful: -1, grounded_fantastic: 2 },
  themes: ['loyalty', 'the cost of freedom'],
  pillars: { exploration: 3, social: 2 },
  structure: 'episodic',
  truths: ['The Guild owns every port.', 'Jump drives fail without warning.'],
  characters: 'Sam owes Ada a life debt.',
  resolution_mode: 'narrative',
};
