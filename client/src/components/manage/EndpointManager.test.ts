// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { KNOWN_ENDPOINTS } from './EndpointManager';

describe('known endpoints', () => {
  it('are OpenAI-compatible /v1 addresses', () => {
    for (const known of KNOWN_ENDPOINTS) expect(known.base_url).toMatch(/^http:\/\/localhost:\d+\/v1$/);
  });
});
