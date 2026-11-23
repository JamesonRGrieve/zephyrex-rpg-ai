// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Dice a model wrote itself (Zephyrex RPG's live test, 2026-11-23: "Tam Quickfoot rolls Initiative:
 * [roll=1d20+6]"). Mechanics are never a model's: the stream says mechanics_problem and the client asks
 * again with forbid {reason: "mechanics", note}. The twin of ai_chat/Mechanics.py, held to
 * contract/mechanics-cases.json.
 */
import { REASONING } from '~/contract';
import { splitReasoning } from '~/features/prompt/assemble';

const PATTERNS: readonly RegExp[] = [
  // A roll macro: [roll=1d20+6], [roll: 2d6].
  /\[roll\s*[=:][^\]]*\]/giu,
  // "Tam Quickfoot rolls Initiative:": someone rolling a named test, then a result.
  /\b[A-Z][\w'’-]*(?: [A-Z][\w'’-]*){0,3} rolls? (?:for )?[A-Z][\w ]{0,30}:/gu,
  // Dice notation outside a macro: 1d20, 2d6+3.
  /(?<![\w=[])\d+d\d+(?:\s*[+-]\s*\d+)?\b/gu,
  // A rolled number: "rolls a 17", "rolled an 8".
  /\brol(?:ls|led) an? \d+\b/giu,
];

/** The spans of dice a model wrote itself, in the order the patterns find them; [] for none. */
export function inventedRolls(text: string): string[] {
  const thinks = REASONING.pairs.some(([opening]) => text.includes(opening as string));
  const answer = thinks ? splitReasoning(text).reply : text;
  const found: string[] = [];
  for (const pattern of PATTERNS) {
    for (const match of answer.matchAll(pattern)) {
      const span = match[0].trim();
      if (span !== '' && !found.includes(span)) found.push(span);
    }
  }
  return found;
}
