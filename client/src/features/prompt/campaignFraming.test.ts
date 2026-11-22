// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/campaign-framing-cases.json';
import { type CampaignFraming, frameFromFraming } from './campaignFraming';

describe('the campaign framing cases both twins run', () => {
  it.each(cases.cases)('$name', ({ framing, frame }) => {
    expect(frameFromFraming(framing as CampaignFraming | null)).toEqual(frame);
  });
});
