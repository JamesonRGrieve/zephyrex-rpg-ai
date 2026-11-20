// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { draftOf, frameFields, previewCampaign } from './frame';

describe('frameFields', () => {
  it('saves what was chosen: no zero dials or pillars, lists split and trimmed', () => {
    const draft = {
      ...draftOf(null),
      name: '  The Kestrel ',
      dials: { grim_hopeful: -1, serious_comic: 0 },
      pillars: { combat: 2, mystery: 0 },
      themes: 'loyalty, , freedom, loyalty',
      truths: 'Magic is feared.\n\n  The empire fell. ',
      gmStyle: ' Terse. ',
    };
    expect(frameFields(draft)).toMatchObject({
      name: 'The Kestrel',
      dials: { grim_hopeful: -1 },
      pillars: { combat: 2 },
      themes: ['loyalty', 'freedom'],
      truths: ['Magic is feared.', 'The empire fell.'],
      gm_style: 'Terse.',
    });
  });

  it('reads a saved frame back as the draft it came from', () => {
    const campaign = previewCampaign({ ...draftOf(null), name: 'K', themes: 'a, b', truths: 'x\ny' });
    expect(draftOf(campaign)).toMatchObject({ name: 'K', themes: 'a, b', truths: 'x\ny' });
  });

  it('previews an unnamed frame under a placeholder name', () => {
    expect(previewCampaign(draftOf(null)).name).toBe('Untitled campaign');
  });
});
