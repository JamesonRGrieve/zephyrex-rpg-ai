// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which wiki campaign a sandbox chat plays in (the composed suite: every chat has one, so the prompt
 * reads its world and cast from the wiki alone). A chat whose cast all come from one campaign plays
 * in it; any other chat plays in the person's own "Sandbox" campaign, made on first use.
 */

export const SANDBOX_NAME = 'Sandbox';

/** The one campaign every picked person belongs to, or null (none, or more than one). */
export function sharedCampaign(picked: readonly string[], campaignOf: ReadonlyMap<string, string | null>): string | null {
  const found = new Set(picked.map((id) => campaignOf.get(id) ?? null));
  if (found.size !== 1) return null;
  const [only] = [...found];
  return only ?? null;
}

/** The person's Sandbox campaign: the existing one, or a new one. */
export async function sandboxCampaign(
  campaigns: readonly { id: string; name: string }[],
  create: (fields: { name: string; description: string }) => Promise<{ id: string }>,
): Promise<string> {
  const existing = campaigns.find((one) => one.name === SANDBOX_NAME);
  if (existing !== undefined) return existing.id;
  const made = await create({ name: SANDBOX_NAME, description: 'One-on-one chats outside any campaign.' });
  return made.id;
}
