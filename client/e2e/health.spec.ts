// SPDX-License-Identifier: AGPL-3.0-or-later
/** The health probe answers 204, uncached, without a session, on both editions. */
import { expect, test } from '@playwright/test';

test('GET /healthz answers 204 with nothing cached, signed out @phone', async ({ request }) => {
  const response = await request.get('/healthz', { maxRedirects: 0 });
  expect(response.status()).toBe(204);
  expect(response.headers()['cache-control']).toBe('no-store');
});
