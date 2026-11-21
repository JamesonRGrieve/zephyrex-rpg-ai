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
  const start = nodes.findIndex(
    (node) => HEADING.test(node.type ?? '') && textOf(node).trim().toLowerCase() === wanted,
  );
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

/** The campaign's first line: its framing note's Opening Situation, else its description, else a default. */
export function openingLine(
  campaign: { name: string; description: string | null },
  journals: readonly { kind: string | null; name: string; entry: string | null }[],
): string {
  const framing = journals.find(isFraming);
  const situation = framing === undefined ? '' : sectionText(framing.entry, 'Opening Situation');
  return situation || campaign.description?.trim() || `${campaign.name} begins.`;
}
