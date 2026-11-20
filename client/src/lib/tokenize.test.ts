// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import cases from '../../../contract/tokenize-cases.json';
import { serverTokenCount, tokenCountFrom, tokenizeRequests, tokenizerRoot } from './tokenize';

describe('the shared tokenize cases', () => {
  it.each(cases.roots)('finds the root: $name', (each) => {
    expect(tokenizerRoot(each.base_url)).toBe(each.root);
  });

  it.each(cases.requests)('tries each server kind in order: $name', (each) => {
    expect(tokenizeRequests(each.base_url, each.model, each.text)).toEqual(each.tries);
  });

  it.each(cases.answers)('reads the count: $name', (each) => {
    expect(tokenCountFrom(each.answer)).toBe(each.count);
  });
});

describe('serverTokenCount', () => {
  it('falls through to the server that answers', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/api/extra/tokencount')
        ? Response.json({ value: 4, ids: [1, 2, 3, 4] })
        : Response.json({ detail: 'Not Found' }, { status: 404 }),
    );
    expect(await serverTokenCount('http://kobold:5001/v1', 'm', 'Hi there', {}, fetcher)).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('is null when no server counts', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await serverTokenCount('http://gone/v1', 'm', 'Hi', {}, fetcher)).toBeNull();
  });
});
