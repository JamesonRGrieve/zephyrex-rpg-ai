// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The table GM's own voice, guarded (contract table.voice; the operator, 2026-11-23: prod chat b93b668e
 * answered an out-of-game question as "Sergeant Horvec: …" and as "Understood. I'll pause here…"). An
 * answer that opens with a speaker's label or as an assistant is flagged; the client asks again with
 * forbid {reason: "table_voice", note}. The twin of ai_chat/TableVoice.py, held to
 * contract/table-voice-cases.json.
 */
import { REASONING, TABLE } from '~/contract';
import { splitReasoning } from '~/features/prompt/assemble';

export interface TableVoiceProblem {
  kind: 'npc' | 'assistant';
  name: string | null;
}

const LABEL = /^\s*([A-Z][\w'’.-]*(?: [A-Z][\w'’.-]*){0,4})\s*:\s+\S/u;

/** The answer's problem: opening as a character (a `Name:` label other than the GM's own) or as an assistant. */
export function tableVoiceProblem(text: string): TableVoiceProblem | null {
  const thinks = REASONING.pairs.some(([opening]) => text.includes(opening as string));
  const answer = (thinks ? splitReasoning(text).reply : text).trim();
  const first = answer.split('\n').find((line) => line.trim() !== '') ?? '';
  const label = LABEL.exec(first);
  const allowed = new Set(TABLE.voice.allowed_labels.map((one) => one.toLowerCase()));
  if (label?.[1] !== undefined && !allowed.has(label[1].toLowerCase())) return { kind: 'npc', name: label[1] };
  const opening = first.trim().toLowerCase();
  if (TABLE.voice.assistant_openings.some((word) => opening.startsWith(word))) return { kind: 'assistant', name: null };
  return null;
}

/** What the retry is told: the wrong voice, by name when it was a character. */
export function tableVoiceNote(problem: TableVoiceProblem): string {
  return problem.kind === 'npc'
    ? TABLE.voice.npc_note.replaceAll('{{name}}', problem.name ?? 'someone')
    : TABLE.voice.assistant_note;
}
