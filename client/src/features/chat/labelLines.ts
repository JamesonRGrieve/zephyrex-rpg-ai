// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The decision model labels each line of a saved story message (the operator, 2026-11-22: "Wire in the
 * decision model"; "A second tankard follows the first should be a throw action"): who acts, whether it
 * is speech, an action or narration, and the action's icon from the full ACTION_KINDS library. The
 * server keeps the labels on the message (line_labels); a labelled message renders from them alone.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { ACTION_KINDS, type ActionKind } from './actionKind';
import type { Manner, ShownLine } from '~/components/play/StructuredLines';
import { parsePlayerLines } from './playerLines';

export interface LineLabel {
  kind: 'say' | 'do' | 'narrate' | 'drop';
  text: string;
  actorName: string | null;
  targetName: string | null;
  manner: Manner | null;
  icon: ActionKind | null;
}

const MANNERS: readonly Manner[] = ['speak', 'whisper', 'shout', 'vox', 'voxcast'];

/** The labels as stored, or null when there are none (or they aren't usable). */
export function readLabels(raw: unknown): LineLabel[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const labels = raw.flatMap((one): LineLabel[] => {
    const field = (key: string): unknown => Reflect.get(Object(one), key);
    const kind = field('kind');
    const text = field('text');
    if ((kind !== 'say' && kind !== 'do' && kind !== 'narrate' && kind !== 'drop') || typeof text !== 'string') return [];
    const str = (key: string) => {
      const value = field(key);
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    };
    const icon = str('icon');
    const manner = str('manner');
    return [
      {
        kind,
        text: text.trim(),
        // The narrator is no one's action: "the narrator" as an actor reads as narration.
        actorName: /^(?:the )?narrator$/i.test(str('actor_name') ?? '') ? null : str('actor_name'),
        targetName: str('target_name'),
        manner: manner !== null && (MANNERS as readonly string[]).includes(manner) ? (manner as Manner) : null,
        icon: icon !== null && (ACTION_KINDS as readonly string[]).includes(icon) ? (icon as ActionKind) : null,
      },
    ];
  });
  return labels.length === 0 ? null : labels;
}

/**
 * A labelled line's own words: its stored form's name, parenthesis and quotes off (`Bram Holloway sets down the
 * cup` is "sets down the cup"; `Narrator: The fire pops.` "The fire pops."), as a structured line shows them.
 */
function ownWords(text: string, actorName: string | null): string {
  const item = parsePlayerLines(text, actorName === null ? [] : [{ id: 'actor', name: actorName }])[0];
  return item === undefined || item.text === '' ? text : item.text;
}

/** The lines to show from labels: speech and actions credited to whoever the model named. */
export function labelledLines(labels: readonly LineLabel[], fallbackSpeaker: string): ShownLine[] {
  return labels.flatMap((label): ShownLine[] => {
    if (label.kind === 'drop' || label.text === '') return [];
    if (label.kind === 'narrate' || (label.actorName === null && label.kind === 'do'))
      return [{ kind: 'narrate', text: ownWords(label.text, null) }];
    const speaker = label.actorName ?? fallbackSpeaker;
    const text = ownWords(label.text, speaker);
    if (label.kind === 'say')
      return [{ kind: 'say', speaker, target: label.targetName, manner: label.manner ?? 'speak', text }];
    return [{ kind: 'do', speaker, target: label.targetName, text, icon: label.icon ?? undefined }];
  });
}

/** Asks the server to label a saved message; resolves once it has (true) or couldn't (false). */
export async function labelLines(chatId: string, messageId: string): Promise<boolean> {
  const response = await fetch('/api/v1/ai_chat/label_lines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ label_lines: { chat_id: chatId, message_id: messageId } }),
  }).catch(() => null);
  return response !== null && response.ok;
}
