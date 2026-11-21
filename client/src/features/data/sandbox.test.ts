// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { SANDBOX_NAME, sandboxCampaign, sharedCampaign } from './sandbox';

describe('sharedCampaign', () => {
  const campaignOf = new Map<string, string | null>([
    ['a', 'void'],
    ['b', 'void'],
    ['c', 'antler'],
    ['d', null],
  ]);
  it('the campaign all the picked share', () => expect(sharedCampaign(['a', 'b'], campaignOf)).toBe('void'));
  it('none when they come from more than one', () => expect(sharedCampaign(['a', 'c'], campaignOf)).toBeNull());
  it('none for a card or a setting-wide person', () => expect(sharedCampaign(['d', 'x'], campaignOf)).toBeNull());
});

describe('sandboxCampaign', () => {
  it('reuses the existing Sandbox', async () => {
    const create = vi.fn();
    await expect(sandboxCampaign([{ id: 's', name: SANDBOX_NAME }], create)).resolves.toBe('s');
    expect(create).not.toHaveBeenCalled();
  });
  it('makes one on first use', async () => {
    const create = vi.fn(async () => ({ id: 'new' }));
    await expect(sandboxCampaign([{ id: 'v', name: 'Voidship Escapade' }], create)).resolves.toBe('new');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: SANDBOX_NAME }));
  });
});
