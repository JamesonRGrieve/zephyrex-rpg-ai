// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Who speaks next, by the decision model (the operator, 2026-11-21): after each line the decision
 * model chooses among the cast the AI plays (unmuted, never the person's seat), the AI GM
 * interjecting (not when the person is the GM), or a pause that waits for the person's input. What
 * it's told depends on the person's seat, named in the question. Pure, and held to
 * contract/turn-decision-cases.json, which the SaaS server's TurnDecision.py runs too. The caller
 * falls back to the turn order when there's no decision model or no usable answer.
 */
import { DECIDE_TURN } from '~/contract';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';

export type TurnSeat = 'gm' | 'character' | 'none';
export type TurnPick = { kind: 'character'; id: string } | { kind: 'gm' } | { kind: 'pause' };

/** The person's seat: the GM's, a character's (a player at the table, or one playing a character), or none. */
export function turnSeat(chatSeat: string | null, playing: boolean): TurnSeat {
  if (chatSeat === 'gm') return 'gm';
  return chatSeat === 'player' || playing ? 'character' : 'none';
}

/** Where everyone is, as far as the VTT, the wiki and the story say. */
export interface Presence {
  /** The cast with a token in the chat's VTT scene, or null when no scene is set. */
  tokens: readonly string[] | null;
  /** The scene's wiki location, or null. */
  scene_location: string | null;
  /** Each wiki location's parent. */
  location_parents: Readonly<Record<string, string | null>>;
  /** Each person's wiki location, where the wiki says. */
  person_locations: Readonly<Record<string, string | null>>;
  /** The story's recent lines: who spoke (a cast id, or null) and what was said. */
  recent: readonly { speaker_id: string | null; text: string }[];
  /** The cast on vox (the chat's vox_ids). */
  vox: readonly string[];
}

const PRESENCE = DECIDE_TURN.presence;

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether a line names a member: their full name or their first name, as a whole word. */
function names(text: string, name: string): boolean {
  const full = name.trim();
  const first = full.split(/\s+/)[0] ?? '';
  // A title's article is no name: "The Acolyte" is never "The".
  const usable = first.length >= 3 && first !== full && !['the', 'a', 'an'].includes(first.toLowerCase());
  return [full, ...(usable ? [first] : [])].some(
    (word) => word !== '' && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text),
  );
}

function inside(location: string, scene: string, parents: Readonly<Record<string, string | null>>): boolean {
  let at: string | null = location;
  for (let step = 0; at !== null && step < 32; step += 1) {
    if (at === scene) return true;
    at = parents[at] ?? null;
  }
  return false;
}

/**
 * Who is in the scene and who a line reaches by vox (the operator, 2026-11-21). Present: a token in
 * the VTT scene when one is set; else a wiki location at or inside the scene's; else they spoke or
 * were named in the recent lines. Away but on vox: reached when the last line names them or a vox word.
 */
export function presentCast(
  cast: readonly { id: string; name: string }[],
  presence: Presence,
): { present: string[]; vox: string[] } {
  const recent = presence.recent.slice(-PRESENCE.recent);
  const here = (member: { id: string; name: string }): boolean => {
    if (presence.tokens !== null) return presence.tokens.includes(member.id);
    const location = presence.person_locations[member.id] ?? null;
    if (presence.scene_location !== null && location !== null)
      return inside(location, presence.scene_location, presence.location_parents);
    return recent.some((line) => line.speaker_id === member.id || names(line.text, member.name));
  };
  const last = recent.at(-1)?.text ?? '';
  const voxCalled = PRESENCE.vox_words.some((word) => names(last, word));
  const present = cast.filter(here).map((member) => member.id);
  const vox = cast
    .filter((member) => !present.includes(member.id) && presence.vox.includes(member.id))
    .filter((member) => voxCalled || names(last, member.name))
    .map((member) => member.id);
  return { present, vox };
}

/**
 * The decision model's question, and what each of its options picks. With `reachable`, only those
 * cast members are options (presentCast's present and vox); after the person's own line there is no
 * pause, so someone answers them.
 */
export function turnQuestion(
  cast: readonly { id: string; name: string }[],
  muted: readonly string[],
  seatedId: string | null,
  seat: TurnSeat,
  player: string,
  reachable: readonly string[] | null = null,
  afterPerson = false,
): { question: DecideQuestion; picks: Record<string, TurnPick> } {
  const fill = (text: string) => text.replaceAll('{{player}}', player);
  const picks: Record<string, TurnPick> = {};
  for (const member of cast) {
    if (muted.includes(member.id) || member.id === seatedId) continue;
    if (reachable !== null && !reachable.includes(member.id)) continue;
    let name = member.name.trim() || 'Someone';
    for (let count = 2; name in picks; count += 1) name = `${member.name.trim() || 'Someone'} (${count})`;
    picks[name] = { kind: 'character', id: member.id };
  }
  if (seat !== 'gm') picks[DECIDE_TURN.gm] = { kind: 'gm' };
  if (!afterPerson) picks[fill(DECIDE_TURN.pause[seat])] = { kind: 'pause' };
  const instructions = fill(DECIDE_TURN.instructions[seat]) + (reachable === null ? '' : PRESENCE.rule);
  return { question: { type: 'choice', instructions, criteria: Object.keys(picks) }, picks };
}

/** What the decision model's answer picks, or null when it named no option. */
export function turnPick(
  answer: DecideAnswer | null | undefined,
  picks: Readonly<Record<string, TurnPick>>,
): TurnPick | null {
  if (answer === null || answer === undefined || !('choice' in answer)) return null;
  return picks[answer.choice] ?? null;
}

/**
 * What the decision model reads: the scene and who is in it (when known), then the story's last
 * lines, each "Name: text".
 */
export function turnState(
  lines: readonly { name: string; text: string }[],
  scene: { place: string | null; present: readonly string[]; vox: readonly string[] } | null = null,
): string {
  const story = lines
    .slice(-DECIDE_TURN.window)
    .map((line) => `${line.name}: ${line.text}`)
    .join('\n');
  if (scene === null) return story;
  const list = (names: readonly string[]) => (names.length === 0 ? PRESENCE.nobody : names.join(', '));
  const header = [
    ...(scene.place === null ? [] : [PRESENCE.scene + scene.place]),
    PRESENCE.present + list(scene.present),
    ...(scene.vox.length === 0 ? [] : [PRESENCE.vox + list(scene.vox)]),
  ];
  return `${header.join('\n')}\n\n${story}`;
}
