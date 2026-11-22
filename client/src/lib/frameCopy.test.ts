// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import { prisma } from '~/lib/prisma';
import { copyFrame, frameFor } from './frameCopy';

beforeEach(async () => {
  await prisma.scenario.deleteMany({});
  await prisma.campaignFrame.deleteMany({});
});

describe('a playthrough gets its scenario’s frame', () => {
  it('copies the frame and its scenarios once, found by the wiki campaign it names', async () => {
    const frame = await prisma.campaignFrame.create({
      data: {
        createdById: LOCAL_OWNER_ID,
        name: 'The Tavern',
        truths: '["The hearth is sacred."]',
        wikiCampaignId: 'scenario-1',
        updatedAt: new Date(),
      },
    });
    await prisma.scenario.create({
      data: { createdById: LOCAL_OWNER_ID, name: 'Opening', campaignId: frame.id, premise: 'Rain.', updatedAt: new Date() },
    });
    const made = await copyFrame(LOCAL_OWNER_ID, 'scenario-1', 'run-1');
    expect(made?.wikiCampaignId).toBe('run-1');
    expect((await frameFor(LOCAL_OWNER_ID, 'run-1'))?.truths).toBe('["The hearth is sacred."]');
    const copied = await prisma.scenario.findMany({ where: { campaignId: made?.id } });
    expect(copied.map((one) => [one.name, one.premise])).toEqual([['Opening', 'Rain.']]);
    expect(await copyFrame(LOCAL_OWNER_ID, 'scenario-1', 'run-1')).toBeNull();
  });
  it('copies nothing when the scenario has no frame', async () => {
    expect(await copyFrame(LOCAL_OWNER_ID, 'nothing', 'run-2')).toBeNull();
  });
});
