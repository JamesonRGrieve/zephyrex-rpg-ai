// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Web search injected into context (A42). The search source is set per install, as model
 * endpoints are (the operator, 2026-11-20): a SearXNG instance or the Brave search API. Results
 * become one block the model reads, marked as search results that may be wrong. The SaaS twin is
 * server/extensions/ai_chat/Search.py; both run contract/search-cases.json.
 */
import type { NextRequest } from 'next/server';
import { ApiError, apiErrorResponse, localOwner, readJsonObject, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import cases from '../../../contract/search-cases.json';
import { isSearchApi } from '~/contract';
import { endpoints } from '~/lib/rpgRecords';

export type SearchKind = 'searxng' | 'brave';

export interface SearchSource {
  kind: SearchKind;
  base_url: string;
  api_key: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const SEARCH = {
  heading: cases.heading,
  maxResults: cases.max_results,
  snippetCharacters: cases.snippet_characters,
  queryCharacters: cases.query_characters,
} as const;

export const SEARCH_TIMEOUT_MS = 8000;

/** The request a source is asked: its URL and headers. */
export function searchRequest(source: SearchSource, query: string): { url: string; headers: Record<string, string> } {
  const base = source.base_url.replace(/\/+$/, '');
  if (source.kind === 'brave') {
    const params = new URLSearchParams({ q: query, count: String(SEARCH.maxResults) });
    return {
      url: `${base}/res/v1/web/search?${params.toString()}`,
      headers: { Accept: 'application/json', 'X-Subscription-Token': source.api_key },
    };
  }
  const params = new URLSearchParams({ q: query, format: 'json' });
  return { url: `${base}/search?${params.toString()}`, headers: { Accept: 'application/json' } };
}

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

/** The results in a source's answer: those with a title and a URL, at most the limit. */
export function searchResults(kind: SearchKind, answer: unknown): SearchResult[] {
  const list: unknown =
    kind === 'brave'
      ? Reflect.get(Object(Reflect.get(Object(answer), 'web')), 'results')
      : Reflect.get(Object(answer), 'results');
  if (!Array.isArray(list)) return [];
  return list
    .map((item: unknown) => ({
      title: text(Reflect.get(Object(item), 'title')),
      url: text(Reflect.get(Object(item), 'url')),
      snippet: text(Reflect.get(Object(item), kind === 'brave' ? 'description' : 'content')).slice(
        0,
        SEARCH.snippetCharacters,
      ),
    }))
    .filter((result) => result.title !== '' && result.url !== '')
    .slice(0, SEARCH.maxResults);
}

/** The block the model reads; empty when there are no results. */
export function searchContext(query: string, results: readonly SearchResult[]): string {
  if (results.length === 0) return '';
  const lines = results.map((result, index) => `${index + 1}. ${result.title} (${result.url}): ${result.snippet}`);
  return [SEARCH.heading.replace('{query}', query), ...lines].join('\n');
}

/** Searches the source; an empty list when it can't be reached or answers nothing usable. */
export async function webSearch(
  source: SearchSource,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<SearchResult[]> {
  const request = searchRequest(source, query);
  try {
    const response = await fetcher(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    return response.ok ? searchResults(source.kind, await response.json()) : [];
  } catch {
    return [];
  }
}

const searchRequestSchema = z.object({ query: z.string().trim().min(1).max(SEARCH.queryCharacters) });

/**
 * `POST /v1/ai_chat/search` (A42): the install's search source (an endpoint serving the search role)
 * asked `query`. Request `{ "search": { "query" } }`; answer `{ "search": { "query", "results",
 * "context" } }`, the context the block a chat keeps as a system line for the model to read. 409 when
 * no search source is set. The SaaS server answers the same (server/extensions/ai_chat/Search.py).
 */
export async function search(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = searchRequestSchema.safeParse(Reflect.get(envelope, 'search'));
    if (!parsed.success) throw validationError('A search object with a query is required', 'search');
    const sources = (await endpoints.list(owner.id, new URLSearchParams()))
      .filter((row) => isSearchApi(row.api))
      .sort((a, b) => a.name.localeCompare(b.name));
    const row = sources.find((one) => one.isDefault) ?? sources[0];
    if (row === undefined) throw new ApiError(409, { message: 'Set a search source first', code: 'no_search_source' });
    const query = parsed.data.query;
    const results = await webSearch({ kind: row.api as SearchKind, base_url: row.baseUrl, api_key: row.apiKey }, query);
    return Response.json({ search: { query, results, context: searchContext(query, results) } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
