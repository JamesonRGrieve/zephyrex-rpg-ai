// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A table note the GM proposes (A11): the last line of a table GM answer, in the contract's form
 * (`Note (pacing): …`). Only a proposal: it reaches the table notes when a player adds it. Pure.
 */
import { TABLE } from '~/contract';

export interface ProposedNote {
  kind: (typeof TABLE.note_kinds)[number];
  text: string;
}

/** The note the answer proposes, and the answer without that line; null when it proposes none. */
export function proposedNote(answer: string): { note: ProposedNote; rest: string } | null {
  const lines = answer.trimEnd().split('\n');
  const last = (lines.at(-1) ?? '').trim();
  for (const kind of TABLE.note_kinds) {
    const prefix = TABLE.note_line.replace('{{kind}}', kind);
    if (last.toLowerCase().startsWith(prefix.toLowerCase())) {
      const text = last.slice(prefix.length).trim();
      if (text === '') return null;
      return { note: { kind, text }, rest: lines.slice(0, -1).join('\n').trimEnd() };
    }
  }
  return null;
}

/** Whether the table notes already hold this note (the same kind and words, ignoring case). */
export function hasNote(notes: readonly { kind: string; text: string }[], note: ProposedNote): boolean {
  return notes.some((one) => one.kind === note.kind && one.text.trim().toLowerCase() === note.text.toLowerCase());
}
