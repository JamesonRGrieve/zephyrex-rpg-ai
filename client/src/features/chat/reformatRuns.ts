// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The reformat model's runs as the lines a narration is saved as (the server's run_text): the narrator's
 * prose as paragraphs, anyone else's run as their structured lines, credited to them.
 */
import { type Manner, formatPlayerLines } from './playerLines';
import type { ReformatRun } from './replyStream';

export function partsOfRuns(
  runs: readonly ReformatRun[],
  cast: readonly { id: string; name: string }[],
): { speaker_id: string | null; text: string }[] {
  return runs.flatMap((run) => {
    const narrator = run.speaker_id === null && run.speaker_name === null;
    if (narrator) {
      const text = run.lines.map((line) => line.text).join('\n\n');
      return text.trim() === '' ? [] : [{ speaker_id: null, text }];
    }
    // Someone the cast doesn't hold is named in their lines, as the server does.
    const who = run.speaker_id ?? '';
    const people = run.speaker_id === null ? [...cast, { id: '', name: run.speaker_name ?? '' }] : cast;
    const text = formatPlayerLines(
      run.lines.map((line) => ({
        speaker_id: who,
        kind: line.kind,
        manner: line.kind === 'say' ? ((line.manner ?? 'speak') as Manner) : null,
        target_id: line.target_id,
        target_name: line.target_name,
        text: line.text,
      })),
      people,
    );
    return text.trim() === '' ? [] : [{ speaker_id: run.speaker_id, text }];
  });
}
