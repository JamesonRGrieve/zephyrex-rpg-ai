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

/** The real Solenne frame, from the dh-campaign vault (the operator's phone view, 2026-11-21). */
export const SOLENNE: Campaign = {
  id: 'solenne',
  created_at: '2026-11-21T00:00:00',
  updated_at: null,
  wiki_campaign_id: null,
  name: 'Solenne',
  premise:
    "The acolytes are aboard The Errant Vector — small, equipped, unremarkable. No astropath choir. No Inquisitorial markings. They look like exactly what they are presenting as: minor officials on administrative business.\n\nThey are a few hours from warp exit into the Solenne system.\n\nTheir handler is transiting separately and will be out of contact for an estimated 3-6 weeks after the acolytes' departure from their previous posting. They were dispatched ahead.\n\nTheir mandate: locate a missing Administratum auditor on Solenne Minoris and complete his interrupted census review.\n\nThis is presented as administrative work. Boring. Safe. Good for new operatives.\n\n---",
  genre: 'Grimdark investigation (Warhammer 40,000: Dark Heresy 2e)',
  dials: {},
  themes: ['Investigation', 'Corruption hidden in plain sight', 'Duty and its price'],
  pillars: {},
  structure: 'sandbox',
  truths: [
    'The acolytes travel as minor Administratum officials aboard The Errant Vector.',
    'Their Handler is out of contact for an estimated three to six weeks.',
    'Their mandate: find a missing Administratum auditor on Solenne Minoris and finish his census review.',
  ],
  characters:
    'The acolytes (player characters):\n- Magnus Karlsson\n- A.Z.\n- Ibnad Abadib\n- Gus Veridan\n- Shade Lite\n- Tyr Knoch',
  resolution_mode: 'hybrid',
  gm_style:
    'Run it as a Dark Heresy investigation: tense, grounded and grim. Reveal the hidden through clues, witnesses and consequences, never by announcing it. NPCs have their own agendas and secrets (the lorebooks hold them); keep GM-only truths off the page until they are found.',
};

/** The real Dunmarch: The Kingsbarrow Gambit frame, from the dh-campaign vault (the operator's phone view, 2026-11-21). */
export const DUNMARCH: Campaign = {
  id: 'dunmarch',
  created_at: '2026-11-21T00:00:00',
  updated_at: null,
  wiki_campaign_id: null,
  name: 'Dunmarch: The Kingsbarrow Gambit',
  premise:
    'The Handler has bound the cell to a private, deniable errand: recover an artifact he has hunted, narrowed to one world, the feudal world Corvath Secundus. He gave them a data-slate, his pilot Ishmael Patoya, a warp shuttle and an armoury requisition. The order is singular and vague: "recover the artifact."',
  genre: 'Grimdark intrigue on a feudal world (Warhammer 40,000: Dark Heresy 2e)',
  dials: {},
  themes: ['Whom do you serve?', 'Subtlety among the unknowing', 'A choice made blind'],
  pillars: {},
  structure: 'sandbox',
  truths: [
    'Corvath Secundus is a feudal, low-tech world; open use of Imperial technology or witch-fire draws dangerous attention.',
    'The shuttle lands under a stealth field; the cell travels as strangers on the road.',
  ],
  characters:
    'The cell (player characters):\n- Magnus Karlsson\n- A.Z.\n- Ibnad Abadib\n- Gus Veridan\n- Shade Lite\n- Tyr Knoch',
  resolution_mode: 'hybrid',
  gm_style:
    "Play the feudal world straight, with fantasy-tavern tropes as the surface and the 41st millennium underneath. Subtlety is the test: reward cover and caution, punish loud technology. Keep the arc's secrets (the two relics, the wizard's patron) for the players to uncover.",
};
