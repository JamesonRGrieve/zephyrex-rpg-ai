// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The API contract, on both editions: the lite build's route handlers and the SaaS server answer
 * the same calls with the same statuses, envelopes and rules. Pages never branch on edition, so
 * any difference here is a bug in one of them.
 */
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { isHosted, signIn } from './support/people';

const CSRF_COOKIE = 'zx_csrf';
const SESSION_COOKIE = 'zx_session';
const CSRF_HEADER = 'X-CSRF-Token';

test.beforeEach(async ({ page }, testInfo) => {
  if (isHosted(testInfo)) await signIn(page);
});

/** The page's own request context and the headers a write needs (the CSRF token, when signed in). */
async function api(page: Page): Promise<{ request: APIRequestContext; write: Record<string, string> }> {
  if (page.url() === 'about:blank') await page.goto('/play');
  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === CSRF_COOKIE);
  // The session cookie is Secure, and a test's request context doesn't send it over plain http (the
  // browser does, for localhost): the session goes as an explicit credential instead, which needs no
  // CSRF token (Zephyrex Server, 2026-11-23).
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE);
  if (session !== undefined) await page.context().setExtraHTTPHeaders({ Authorization: `Bearer ${session.value}` });
  return { request: page.request, write: csrf === undefined ? {} : { [CSRF_HEADER]: csrf.value } };
}

test('the extension list names what this build serves', async ({ page }) => {
  const { request } = await api(page);
  const response = await request.get('/api/v1/extension');
  expect(response.status()).toBe(200);
  const names = JSON.stringify(await response.json());
  for (const extension of ['ai_character', 'ai_lorebook', 'ai_chat']) expect(names).toContain(extension);
});

test('a record: created with its version, read, guarded by If-Match on change, and gone once deleted', async ({ page }) => {
  const { request, write } = await api(page);
  const created = await request.post('/api/v1/persona', { headers: write, data: { persona: { name: 'Sam' } } });
  expect(created.status()).toBe(201);
  const { persona } = (await created.json()) as { persona: { id: string; name: string; is_default: boolean } };
  expect(persona).toMatchObject({ name: 'Sam', is_default: false });
  const etag = created.headers().etag ?? '';
  expect(etag).not.toBe('');

  const listed = (await (await request.get('/api/v1/persona')).json()) as { personae: { id: string }[] };
  expect(listed.personae.map((row) => row.id)).toContain(persona.id);

  const url = `/api/v1/persona/${persona.id}`;
  expect((await request.put(url, { headers: write, data: { persona: { name: 'Samuel' } } })).status()).toBe(428);
  const changed = await request.put(url, { headers: { ...write, 'If-Match': etag }, data: { persona: { name: 'Samuel' } } });
  expect(changed.status()).toBe(200);
  expect(((await changed.json()) as { persona: { name: string } }).persona.name).toBe('Samuel');
  expect(
    (await request.put(url, { headers: { ...write, 'If-Match': etag }, data: { persona: { name: 'Stale' } } })).status(),
  ).toBe(412);

  const current = changed.headers().etag ?? '';
  expect((await request.delete(url, { headers: { ...write, 'If-Match': current } })).status()).toBe(204);
  expect((await request.get(url)).status()).toBe(404);
});

test('both editions refuse the same bad input with 422', async ({ page }) => {
  const { request, write } = await api(page);
  const refused = [
    ['/api/v1/chat', { chat: { title: 'No cast', character_ids: [] } }],
    ['/api/v1/regex_script', { regex_script: { name: 'Sticky', find: '/a/y' } }],
    ['/api/v1/generation_preset', { generation_preset: { name: 'Hot', temperature: 99 } }],
    ['/api/v1/model_endpoint', { model_endpoint: { name: 'File', base_url: 'file:///etc/passwd', model: 'm' } }],
    ['/api/v1/quick_reply', { quick_reply: { label: 'Shout', message: 'Hey', action: 'shout' } }],
  ] as const;
  for (const [path, body] of refused) {
    const response = await request.post(path, { headers: write, data: body });
    expect(response.status(), path).toBe(422);
  }
});

test('the model routes answer 404 for a chat that is not yours, before asking any model', async ({ page }) => {
  const { request, write } = await api(page);
  for (const route of ['prompt', 'summarize', 'generate']) {
    const response = await request.post(`/api/v1/ai_chat/${route}`, {
      headers: write,
      data: { generate: { chat_id: 'no-such-chat' } },
    });
    expect(response.status(), route).toBe(404);
  }
});
