// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The scene's location when the VTT isn't loaded to say (A31): the wiki location the story names
 * most recently, over its last few story lines, so the chat's background can follow the scene. The
 * server twin is server/extensions/ai_campaign/SceneLocation.py; both run contract/scene-cases.json.
 */
import cases from '../../../../contract/scene-cases.json';
import type { NamedEntity } from './sessionReport';

export interface StoryLine {
  text: string;
  channel: string;
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where in `text` a location is named last, or -1. */
function lastNamedAt(text: string, location: NamedEntity): number {
  let last = -1;
  for (const name of [location.name, ...location.aliases]) {
    if (name.trim() === '') continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name.trim())}(?![\\p{L}\\p{N}])`, 'giu');
    for (const match of text.matchAll(pattern)) last = Math.max(last, match.index);
  }
  return last;
}

/** The id of the location the latest story lines name last, or null. */
export function sceneLocation(lines: readonly StoryLine[], locations: readonly NamedEntity[]): string | null {
  const story = lines.filter((line) => line.channel === 'story').slice(-cases.window);
  for (const line of [...story].reverse()) {
    let best: { id: string; at: number } | null = null;
    for (const location of locations) {
      const at = lastNamedAt(line.text, location);
      if (at >= 0 && (best === null || at > best.at)) best = { id: location.id, at };
    }
    if (best !== null) return best.id;
  }
  return null;
}
