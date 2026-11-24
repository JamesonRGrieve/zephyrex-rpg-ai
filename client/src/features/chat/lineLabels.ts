// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Each line of a saved story message labelled by the decision model (the operator, 2026-11-22: "Actions
 * still not always marked properly... A second tankard follows the first should be a throw action"):
 * its kind (say, do, narrate, or drop for a stray aside), its actor (someone present, or the narrator),
 * and its icon (one of the contract's action kinds, or none). One decide call per message, one set of
 * questions per line. Pure, and held to contract/line-labels-cases.json with ai_chat/LineLabels.py.
 */
import { ACTION_KINDS, LINE_LABELS, PLAYER_LINES, REASONING } from '~/contract';
import { splitReasoning } from '~/features/prompt/assemble';

export interface LineLabel {
  index: number;
  text: string;
  kind: (typeof LINE_LABELS.kinds)[number];
  actor_id: string | null;
  actor_name: string | null;
  /** Whom it's said to or done at, someone present; null for no one. */
  target_name: string | null;
  /** How a say line is said (speak, whisper, shout, vox, voxcast); null otherwise. */
  manner: string | null;
  icon: string | null;
}

/** A say line's manner from its own form (`Name (to X, whispers): …`, `(vox to X)`), else speak. */
function mannerOf(line: string): string {
  const paren = /^[^(:"“]{1,60}\(([^)]*)\)\s*:/u.exec(line)?.[1]?.toLowerCase() ?? '';
  if (/\bvoxcast\b/u.test(paren)) return 'voxcast';
  if (/\bvox\b/u.test(paren)) return 'vox';
  if (paren.includes(PLAYER_LINES.manner_words.whisper)) return 'whisper';
  if (paren.includes(PLAYER_LINES.manner_words.shout)) return 'shout';
  return 'speak';
}

/** A message's lines: each non-blank line, trimmed, at most max_lines. */
export function messageLines(text: string): string[] {
  // Its thinking (shown folded, never story) is left out.
  const thinks = REASONING.pairs.some(([opening]) => text.includes(opening as string));
  return (thinks ? splitReasoning(text).reply : text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, LINE_LABELS.max_lines);
}

/** The decide questions for a message's lines, and the state the model reads (the two lines before). */
export function labelQuestions(
  lines: readonly string[],
  previous: readonly string[],
  people: readonly { id: string; name: string }[],
): { state: string; questions: Record<string, { type: 'choice'; instructions: string; criteria: string[] }> } {
  const actors = [...people.map((person) => person.name), LINE_LABELS.narrator];
  const questions: Record<string, { type: 'choice'; instructions: string; criteria: string[] }> = {};
  lines.forEach((line, index) => {
    const ask = (template: string) => template.replaceAll('{{line}}', line).replaceAll('{{n}}', String(index + 1));
    questions[`kind_${index}`] = {
      type: 'choice',
      instructions: ask(LINE_LABELS.kind_question),
      criteria: [...LINE_LABELS.kinds],
    };
    questions[`actor_${index}`] = { type: 'choice', instructions: ask(LINE_LABELS.actor_question), criteria: actors };
    questions[`target_${index}`] = {
      type: 'choice',
      instructions: ask(LINE_LABELS.target_question),
      criteria: [...people.map((person) => person.name), LINE_LABELS.no_one],
    };
    questions[`icon_${index}`] = {
      type: 'choice',
      instructions: ask(LINE_LABELS.icon_question),
      criteria: [...ACTION_KINDS, LINE_LABELS.none],
    };
  });
  const state = [
    ...previous.slice(-2).map((line) => `Before: ${line}`),
    ...lines.map((line, index) => `Line ${index + 1}: ${line}`),
  ].join('\n');
  return { state, questions };
}

/** The labels the answers give, one per line; a line the model left unread is narration by the narrator. */
export function readLabels(
  lines: readonly string[],
  answers: Readonly<Record<string, { choice?: unknown } | null | undefined>> | null,
  people: readonly { id: string; name: string }[],
): LineLabel[] {
  const pick = (key: string): string | null => {
    const choice = answers?.[key]?.choice;
    return typeof choice === 'string' ? choice : null;
  };
  return lines.map((text, index) => {
    const said = pick(`kind_${index}`);
    const kind = (LINE_LABELS.kinds as readonly string[]).includes(said ?? '') ? (said as LineLabel['kind']) : 'narrate';
    const actorName = pick(`actor_${index}`);
    const person = people.find((one) => one.name === actorName);
    const icon = pick(`icon_${index}`);
    const iconOk = icon !== null && (ACTION_KINDS as readonly string[]).includes(icon) && kind === 'do';
    return {
      index,
      text,
      kind,
      actor_id: kind === 'narrate' || kind === 'drop' ? null : (person?.id ?? null),
      actor_name: kind === 'narrate' || kind === 'drop' ? null : (person?.name ?? null),
      // Never the line's own actor (live run, build58: Old Hesk's own lines labelled "to Old Hesk").
      target_name:
        kind === 'say' || kind === 'do'
          ? (people.find((one) => one.name === pick(`target_${index}`) && one !== person)?.name ?? null)
          : null,
      manner: kind === 'say' ? mannerOf(text) : null,
      icon: iconOk ? icon : null,
    };
  });
}
