// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A session report for the wiki's campaign log (A24): the model is asked for it from the session's
 * story lines (never its out-of-character ones), and the wiki entities the report names are linked
 * to the log entry. Who saves it depends on who runs the game: a human GM reviews and saves; the AI
 * GM's are saved automatically (the operator, 2026-11-20). The server twin is
 * server/extensions/ai_campaign/SessionReport.py; both run contract/report-cases.json.
 */
import cases from '../../../../contract/report-cases.json';

export interface SessionLine {
  speaker: string;
  text: string;
  channel: string;
}

export interface NamedEntity {
  id: string;
  name: string;
  aliases: readonly string[];
}

export const REPORT_MAX_LINES = cases.max_lines;
export const REPORT_SYSTEM = cases.system;

/** The request for a report: the instructions, then the session's last story lines, oldest first. */
export function reportPrompt(lines: readonly SessionLine[]): { role: 'system' | 'user'; content: string }[] {
  const story = lines.filter((line) => line.channel === 'story').slice(-REPORT_MAX_LINES);
  return [
    { role: 'system', content: REPORT_SYSTEM },
    { role: 'user', content: story.map((line) => `${line.speaker}: ${line.text}`).join('\n') },
  ];
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The entities a report names, each once, in the order the report first names them. */
export function reportMentions(text: string, entities: readonly NamedEntity[]): string[] {
  const firstAt = new Map<string, number>();
  for (const entity of entities) {
    for (const name of [entity.name, ...entity.aliases]) {
      if (name.trim() === '') continue;
      const match = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name.trim())}(?![\\p{L}\\p{N}])`, 'iu').exec(text);
      if (match !== null && match.index < (firstAt.get(entity.id) ?? Number.POSITIVE_INFINITY)) {
        firstAt.set(entity.id, match.index);
      }
    }
  }
  return [...firstAt.entries()].sort(([, a], [, b]) => a - b).map(([id]) => id);
}
