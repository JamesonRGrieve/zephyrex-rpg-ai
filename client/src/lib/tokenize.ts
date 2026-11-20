// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Counting tokens with the model server's own tokenizer (A47; the operator's choice, 2026-11-20).
 * llama.cpp, vLLM and KoboldCpp each answer a tokenize request; others don't, and the
 * characters-per-token estimate stands for them. The SaaS twin is
 * server/extensions/ai_chat/Tokenize.py; both run contract/tokenize-cases.json.
 */

export const TOKENIZE_TIMEOUT_MS = 5000;

export interface TokenizeRequest {
  url: string;
  body: Record<string, string>;
}

/** The server's own root, where its tokenize routes are: the base URL without /v1 or a completions path. */
export function tokenizerRoot(baseUrl: string): string {
  return baseUrl
    .replace(/\/+$/, '')
    .replace(/\/(chat\/)?completions$/, '')
    .replace(/\/v1$/, '');
}

/** The requests to try, in order: llama.cpp, vLLM, then KoboldCpp. */
export function tokenizeRequests(baseUrl: string, model: string, text: string): TokenizeRequest[] {
  const root = tokenizerRoot(baseUrl);
  return [
    { url: `${root}/tokenize`, body: { content: text } },
    { url: `${root}/tokenize`, body: { model, prompt: text } },
    { url: `${root}/api/extra/tokencount`, body: { prompt: text } },
  ];
}

/** The count in a tokenize answer, or null when it holds none. */
export function tokenCountFrom(answer: unknown): number | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null;
  for (const key of ['count', 'value']) {
    const value: unknown = Reflect.get(answer, key);
    if (typeof value === 'number' && Number.isInteger(value)) return value >= 0 ? value : null;
  }
  const tokens: unknown = Reflect.get(answer, 'tokens');
  return Array.isArray(tokens) ? tokens.length : null;
}

/** The server's own count of `text`, or null when it answers none of the requests. */
export async function serverTokenCount(
  baseUrl: string,
  model: string,
  text: string,
  headers: Record<string, string> = {},
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  for (const request of tokenizeRequests(baseUrl, model, text)) {
    try {
      const response = await fetcher(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(TOKENIZE_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const count = tokenCountFrom(await response.json());
      if (count !== null) return count;
    } catch {
      // A server that refuses or times out, or answers something else, just isn't this kind.
    }
  }
  return null;
}
