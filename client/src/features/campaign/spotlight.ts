// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spotlight balance at a multiplayer table (AP7): over the table's last story lines, the player
 * characters who have had the least of the players' lines are quiet, and the GM is told to draw
 * them in. NPC and GM lines don't count, nor out-of-character ones. The server twin is
 * server/extensions/ai_campaign/Spotlight.py; both run contract/spotlight-cases.json.
 */
import cases from '../../../../contract/spotlight-cases.json';

export interface TableLine {
  speaker: string;
  channel: string;
}

/** The quiet PCs, quietest first (fewest lines, then longest silent, then name), at most a few. */
export function quietPlayers(pcs: readonly string[], lines: readonly TableLine[]): string[] {
  if (pcs.length < 2) return [];
  const story = lines.filter((line) => line.channel === 'story').slice(-cases.window);
  const counts = new Map(pcs.map((pc) => [pc, 0]));
  const lastAt = new Map(pcs.map((pc) => [pc, -1]));
  story.forEach((line, at) => {
    const count = counts.get(line.speaker);
    if (count === undefined) return;
    counts.set(line.speaker, count + 1);
    lastAt.set(line.speaker, at);
  });
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const below = (cases.quiet_share * total) / pcs.length;
  return pcs
    .filter((pc) => (counts.get(pc) ?? 0) === 0 || (counts.get(pc) ?? 0) < below)
    .sort(
      (a, b) =>
        (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || (lastAt.get(a) ?? -1) - (lastAt.get(b) ?? -1) || a.localeCompare(b),
    )
    .slice(0, cases.max_named);
}

/** The line the GM reads, or nothing when no one is quiet. */
export function spotlightNote(quiet: readonly string[]): string {
  if (quiet.length === 0) return '';
  const names = quiet.length === 1 ? quiet[0] : `${quiet.slice(0, -1).join(', ')} and ${quiet.at(-1)}`;
  return cases.note.replace('{names}', names ?? '');
}
