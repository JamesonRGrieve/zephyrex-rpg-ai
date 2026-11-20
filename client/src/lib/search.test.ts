// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import cases from '../../../contract/search-cases.json';
import { prisma } from '~/lib/prisma';
import {
  type SearchKind,
  type SearchSource,
  search,
  searchContext,
  searchRequest,
  searchResults,
  webSearch,
} from './search';

describe('the shared search cases', () => {
  it.each(cases.requests)('asks the source: $name', (each) => {
    expect(searchRequest(each.source as SearchSource, each.query)).toEqual({ url: each.url, headers: each.headers });
  });

  it.each(cases.answers)('reads the results: $name', (each) => {
    expect(searchResults(each.kind as SearchKind, each.answer)).toEqual(each.results);
  });

  it.each(cases.contexts)('writes the block: $name', (each) => {
    expect(searchContext(each.query, each.results)).toBe(each.text);
  });
});

describe('webSearch', () => {
  it('reads what the source answers', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ results: [{ title: 'T', url: 'https://t', content: 'c' }] }),
    );
    const source: SearchSource = { kind: 'searxng', base_url: 'http://searx', api_key: '' };
    expect(await webSearch(source, 'q', fetcher)).toEqual([{ title: 'T', url: 'https://t', snippet: 'c' }]);
  });

  it('is empty when the source is unreachable or refuses', async () => {
    const source: SearchSource = { kind: 'brave', base_url: 'https://api', api_key: 'k' };
    expect(
      await webSearch(
        source,
        'q',
        vi.fn<typeof fetch>(async () => {
          throw new TypeError('fetch failed');
        }),
      ),
    ).toEqual([]);
    expect(
      await webSearch(
        source,
        'q',
        vi.fn<typeof fetch>(async () => new Response('', { status: 429 })),
      ),
    ).toEqual([]);
  });
});

describe('POST /v1/ai_chat/search (A42)', () => {
  beforeEach(async () => {
    await prisma.modelEndpoint.deleteMany();
  });
  afterEach(() => vi.unstubAllGlobals());
  const ask = (query: string) =>
    search(
      new NextRequest('http://localhost/api/v1/ai_chat/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: { query } }),
      }),
    );

  it('asks for a search source first, then answers with the results and the block for the model', async () => {
    const refused = await ask('tidal locking');
    expect(refused.status).toBe(409);
    await prisma.modelEndpoint.create({
      data: {
        createdById: LOCAL_OWNER_ID,
        updatedAt: new Date(),
        name: 'Searx',
        baseUrl: 'http://searx.lan:8080',
        model: 'searxng',
        api: 'searxng',
        roles: '["search"]',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ results: [{ title: 'Tidal locking', url: 'https://w/t', content: 'Same face.' }] })),
    );
    const answered = await ask('tidal locking');
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({
      search: {
        query: 'tidal locking',
        results: [{ title: 'Tidal locking', url: 'https://w/t', snippet: 'Same face.' }],
        context: searchContext('tidal locking', [{ title: 'Tidal locking', url: 'https://w/t', snippet: 'Same face.' }]),
      },
    });
    expect((await ask('   ')).status).toBe(422);
  });
});
