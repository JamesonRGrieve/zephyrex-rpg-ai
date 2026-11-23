// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A campaign's framing note (the vaults' "<Campaign>: Campaign Framing", sections Premise, Tone,
 * Truths, Opening Situation; wiki journal kind `campaign_framing`, imported as `lore` before the
 * kind existed). The campaign opens on its Opening Situation as the narrator's first line.
 */

interface PlateNode {
  type?: string;
  text?: string;
  children?: PlateNode[];
}

const HEADING = /^h([1-6])$/;

function textOf(node: PlateNode): string {
  if (typeof node.text === 'string') return node.text;
  return (node.children ?? []).map(textOf).join('');
}

function parse(entry: string | null | undefined): PlateNode[] {
  if (entry === null || entry === undefined || entry.trim() === '') return [];
  try {
    const value = JSON.parse(entry) as unknown;
    return Array.isArray(value) ? (value as PlateNode[]) : [];
  } catch {
    return [];
  }
}

/** The text under a heading (any level) named `section`, up to the next heading at its level or above. */
export function sectionText(entry: string | null | undefined, section: string): string {
  const nodes = parse(entry);
  const wanted = section.trim().toLowerCase();
  const start = nodes.findIndex((node) => HEADING.test(node.type ?? '') && textOf(node).trim().toLowerCase() === wanted);
  if (start < 0) return '';
  const level = Number(HEADING.exec(nodes[start]?.type ?? '')?.[1] ?? 6);
  const out: string[] = [];
  for (const node of nodes.slice(start + 1)) {
    const heading = HEADING.exec(node.type ?? '');
    if (heading !== null && Number(heading[1]) <= level) break;
    const text = textOf(node).trim();
    if (text !== '') out.push(text);
  }
  return out.join('\n\n');
}

/** Whether a journal is a campaign's framing note: its kind, or the vaults' title. */
export function isFraming(journal: { kind: string | null; name: string }): boolean {
  return journal.kind === 'campaign_framing' || /:\s*campaign framing$/i.test(journal.name.trim());
}

/**
 * A note that points elsewhere rather than telling anything (the operator, 2026-11-22, of an opening that
 * read "See Sullenmire — Player Briefing; the event graph is The Sullenmire Infiltration, and
 * play-by-play is in Sullenmire — Run 1 Record.": "Completely unacceptable"): never story.
 */
export function isPointer(text: string): boolean {
  const plain = text.trim();
  return (
    plain === '' ||
    /^see\b/i.test(plain) ||
    /\b(event graph|play-by-play|run \d+ record|gm notes?|see also|cross-?ref)/i.test(plain) ||
    // Mostly titles of other notes ("X — Y; …").
    (plain.match(/ — /g) ?? []).length >= 2
  );
}

/** A section's text without its "Sources: …" lines. */
function withoutSources(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*sources?:/i.test(line))
    .join('\n')
    .trim();
}

/** A paragraph addressed to the reader or the GM, not the story ("Read or share this before play"). */
export function isMeta(paragraph: string): boolean {
  return /\b(read (or share )?this|share this|before play|one-shot|for (one|two|three|four|five|\d+) players?|this briefing|the gm\b|game ?master|players? should)/i.test(
    paragraph,
  );
}

/** The opening of a note for the players: its first section's text, or its text, without headings. */
function briefingText(entry: string | null | undefined): string {
  const nodes = parse(entry);
  if (nodes.length === 0 && entry !== null && entry !== undefined) {
    // Markdown: the text before the second heading, headings and markup dropped.
    const out: string[] = [];
    for (const line of entry.split('\n')) {
      if (/^#{1,6}\s/.test(line)) {
        if (out.some((one) => one.trim() !== '')) break;
        continue;
      }
      const plain = line.replace(/[*_`>]/g, '').trim();
      if (!isMeta(plain)) out.push(plain);
    }
    return out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 1200);
  }
  const out: string[] = [];
  let seenText = false;
  for (const node of nodes) {
    const heading = HEADING.test(node.type ?? '');
    if (heading && seenText) break;
    if (heading) continue;
    const text = textOf(node).trim();
    if (text !== '' && !isMeta(text)) {
      out.push(text);
      seenText = true;
    }
    if (out.join('\n\n').length > 900) break;
  }
  return out.join('\n\n');
}

/**
 * The campaign's first line: its framing note's Opening Situation, else its players' briefing (a note
 * written for the players, so it spoils nothing), else its description when that tells something; never
 * a pointer to other notes. Empty when nothing tells the story's start: the narrator writes it then.
 */
export function openingLine(
  campaign: { name: string; description: string | null },
  journals: readonly { kind: string | null; name: string; entry: string | null }[],
): string {
  const framing = journals.find(isFraming);
  // A repaired framing keeps its old pointer below the written opening as "Sources: …": not the opening
  // (the operator's Sullenmire, 2026-11-23: the good opening was rejected for its Sources line and the
  // briefing's note to the GM was used instead).
  const situation = withoutSources(framing === undefined ? '' : sectionText(framing.entry, 'Opening Situation'));
  if (situation !== '' && !isPointer(situation)) return situation;
  const briefing = journals.find((journal) => journal.kind === 'player_briefing' || /player\s+briefing/i.test(journal.name));
  const told = briefing === undefined ? '' : briefingText(briefing.entry);
  if (told !== '' && !isPointer(told)) return told;
  const description = campaign.description?.trim() ?? '';
  return isPointer(description) ? '' : description;
}
