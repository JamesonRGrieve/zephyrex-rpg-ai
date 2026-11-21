// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What kind of action a Do line is, for its icon (the operator, 2026-11-21: "Can the decision model
 * decide on the action icons?"). A free word match first; the decision model's category, when the
 * roll decision gives one, wins over it.
 */
export const ACTION_KINDS = ['attack', 'move', 'tech', 'social', 'search', 'stealth', 'psychic', 'use', 'other'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

const WORDS: [ActionKind, RegExp][] = [
  [
    'attack',
    /\b(attack|punch|kick|stab|slash|shoot|fire[sd]?|strike|swing|hit|shove|tackle|grapple|throw[sn]?|charge[sd]?)/i,
  ],
  ['tech', /\b(hack|slice|splice|program|repair|rewire|bypass|cogitator|data-?slate|auspex|servo|machine spirit|override)/i],
  ['psychic', /\b(psychic|psyker|warp|mind|telepath|divin|sense[sd]? the)/i],
  ['stealth', /\b(sneak|hide|hides|creep|slip[sp]? past|conceal|shadow)/i],
  ['search', /\b(search|inspect|examine|look[sn]? (?:at|for|around)|study|check[sn]?|scan[sn]?|read[sn]?)/i],
  ['social', /\b(persuade|convince|intimidate|threaten|bluff|lie[sd]?|charm|bargain|plead|salute|bow[sn]?|nod[sn]?)/i],
  [
    'move',
    /\b(walk|run|ran|climb|jump|leap|dash|sprint|enter|leave[sn]?|head[sn]?|step[sn]?|go(?:es)? |follow|cross|retreat|flee|dive[sn]?|duck[sn]?|crawl)/i,
  ],
  [
    'use',
    /\b(use[sn]?|draw[sn]?|reload|open[sn]?|close[sn]?|pick[sn]? up|grab[sn]?|take[sn]?|give[sn]?|drink[sn]?|eat[sn]?|light[sn]?)/i,
  ],
];

export function actionKind(text: string): ActionKind {
  return WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other';
}
