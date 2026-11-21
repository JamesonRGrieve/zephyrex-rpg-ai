// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Campaign, Scenario } from '~/features/data/records';

export const KESTREL: Campaign = {
  id: 'k1',
  created_at: '2026-11-20T00:00:00',
  updated_at: null,
  wiki_campaign_id: null,
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
  gm_style: 'Terse and cinematic. End each scene on a question to the players.',
};

export const SABOTAGE: Scenario = {
  id: 's1',
  created_at: '2026-11-20T00:00:00',
  updated_at: null,
  name: 'Sabotage',
  campaign_id: 'k1',
  premise: 'Someone is cutting the coolant line.',
  hook: 'The pump fails mid-jump.',
  stakes: 'The Kestrel cooks if it fails again.',
  situation: '',
  cast: [{ name: 'Reyes', agenda: 'to sell the ship', secret: 'she cut the line', disposition: 'friendly' }],
  places: ['the engine room', 'bay two'],
  clocks: [{ name: 'The pump fails', segments: 4, filled: 3, advances: 'a jump is made', when_full: 'the ship drifts' }],
  secrets: [
    {
      truth: 'Reyes cut the line.',
      clues: [
        { text: 'Cut marks', found: false },
        { text: 'Her gloves', found: false },
      ],
    },
  ],
  beats: [{ text: 'The buyer hails', done: false }],
  outcomes: ['Reyes is caught'],
};
