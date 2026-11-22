// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A playthrough's own copy of its scenario's campaign frame, and of the scenarios under it (Zephyrex
 * RPG's prod run, 2026-11-22: every playthrough ran without its frame). The lite twin of ai_campaign's
 * copy_frame: a wiki campaign's frame is the one whose wikiCampaignId it is (a frame's id is never
 * chosen). Registered with the wiki's lite start (onAfterInstantiate) in the wiki catch-all.
 */
import { prisma } from '~/lib/prisma';

/** A campaign's frame for its owner: by id, or by the wiki campaign it names; null without one. */
export function frameFor(ownerId: string, campaignId: string) {
  return prisma.campaignFrame.findFirst({
    where: { OR: [{ id: campaignId }, { wikiCampaignId: campaignId }], createdById: ownerId },
  });
}

/** The playthrough's copy of the scenario's frame; null when it has one already or the scenario has none. */
export async function copyFrame(ownerId: string, sourceId: string, madeId: string) {
  if ((await frameFor(ownerId, madeId)) !== null) return null;
  const source = await frameFor(ownerId, sourceId);
  if (source === null) return null;
  const { id: sourceFrameId, createdAt: _made, updatedAt: _changed, wikiCampaignId: _wiki, ...fields } = source;
  const made = await prisma.campaignFrame.create({ data: { ...fields, wikiCampaignId: madeId, updatedAt: new Date() } });
  for (const scenario of await prisma.scenario.findMany({ where: { campaignId: sourceFrameId, createdById: ownerId } })) {
    const { id: _id, createdAt: _at, updatedAt: _up, campaignId: _from, ...copied } = scenario;
    await prisma.scenario.create({ data: { ...copied, campaignId: made.id, updatedAt: new Date() } });
  }
  return made;
}
