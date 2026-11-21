// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which persona a chat speaks as (audit gap 9), as SillyTavern picks it: the one chosen for the chat;
 * else one locked to a character in the chat (the first of its characters that has one, then the
 * persona's name for a tie); else the default persona; else none. Pure, and held to
 * contract/persona-cases.json, which the SaaS server's PersonaPick.py runs too.
 */

export interface PickablePersona {
  id: string;
  name: string;
  is_default: boolean;
  /** The characters it's locked to. */
  character_ids: readonly string[];
  /** Its own lorebook, read while it's the one spoken as. */
  lorebook_id: string | null;
}

export function personaFor<P extends PickablePersona>(
  chosenId: string | null,
  characterIds: readonly string[],
  personas: readonly P[],
): P | null {
  if (chosenId !== null) {
    const chosen = personas.find((persona) => persona.id === chosenId);
    if (chosen !== undefined) return chosen;
  }
  const byName = [...personas].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));
  for (const characterId of characterIds) {
    const locked = byName.find((persona) => persona.character_ids.includes(characterId));
    if (locked !== undefined) return locked;
  }
  return byName.find((persona) => persona.is_default) ?? null;
}

/** The lorebooks a persona brings to the chat's own (its lorebook, once). */
export function personaBooks(persona: PickablePersona | null, books: readonly string[]): string[] {
  const own = persona?.lorebook_id ?? null;
  return own === null || books.includes(own) ? [...books] : [...books, own];
}

/**
 * A persona made from a character (audit gap 9, SillyTavern's "convert to persona"): its name,
 * picture and description, with `{{char}}` read as `{{user}}`, since the description now describes
 * the person. The description is cut to what a persona holds.
 */
export function personaFromCharacter(
  character: { name: string; description: string; avatar: string | null },
  maxDescription: number,
): { name: string; description: string; avatar: string | null } {
  const description = character.description.replace(/\{\{char\}\}/gi, '{{user}}');
  return {
    name: character.name,
    description: Array.from(description).slice(0, maxDescription).join(''),
    avatar: character.avatar,
  };
}
