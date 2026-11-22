// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The chat's background follows the scene (A31; the operator, 2026-11-20: "Follows the scene"):
 * in a chat whose campaign frame is linked to a wiki campaign, when the story moves to a wiki
 * location with a picture, that picture is shown behind it. The location is the one the latest
 * story lines name (features/campaign/sceneLocation, the twin of the server's SceneLocation); a
 * background set by hand on the chat always wins.
 */
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { z } from 'zod';
import { sceneLocation, type StoryLine } from '~/features/campaign/sceneLocation';
import { useCapabilities } from '~/features/capabilities';

const locationsSchema = z.object({
  world_entities: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      picture: z.string().nullable(),
      deleted: z.boolean(),
    }),
  ),
});

export type WorldLocation = z.infer<typeof locationsSchema>['world_entities'][number];

/** The picture behind the scene: the named location's, when it has one; null otherwise. */
export function scenePicture(lines: readonly StoryLine[], locations: readonly WorldLocation[]): string | null {
  const pictured = locations.filter((location) => !location.deleted && location.picture !== null);
  const id = sceneLocation(lines, pictured);
  return pictured.find((location) => location.id === id)?.picture ?? null;
}

export function useSceneBackground(
  chat: { background: string | null; campaign_id: string | null },
  lines: readonly StoryLine[],
): string | null {
  const { world } = useCapabilities();
  const client = useClient();
  // In the composed suite a chat's campaign is the wiki's own (no frame to read: it 404'd for every
  // playthrough).
  const wikiCampaign = world && chat.background === null ? chat.campaign_id : null;
  const path =
    wikiCampaign === null ? null : `/v1/world_entity?campaign_id=${encodeURIComponent(wikiCampaign)}&kinds=location`;
  const locations = useSWR(path, async (key: string) => locationsSchema.parse(await client.get(key)).world_entities);
  if (chat.background !== null) return chat.background;
  return scenePicture(lines, locations.data ?? []);
}
