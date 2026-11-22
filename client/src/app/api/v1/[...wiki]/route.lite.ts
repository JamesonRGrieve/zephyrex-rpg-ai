// SPDX-License-Identifier: AGPL-3.0-or-later
// The wiki's lite API (docs/SUITE.md, Together: rpg-ai composes the wiki), mounted from
// @zephyrex-rpg/wiki/lite. rpg-ai's own routes beside it answer first.
import { onAfterInstantiate, wikiLite } from '@zephyrex-rpg/wiki/lite';
import { copyFrame } from '~/lib/frameCopy';
import { prisma } from '~/lib/prisma';

// A started playthrough gets its scenario's campaign frame (lib/frameCopy.ts). Once, at module load.
onAfterInstantiate(async ({ ownerId, sourceCampaignId, newCampaignId }) => {
  await copyFrame(ownerId, sourceCampaignId, newCampaignId);
});

export const { GET, POST, PUT, PATCH, DELETE } = wikiLite({ prisma });
