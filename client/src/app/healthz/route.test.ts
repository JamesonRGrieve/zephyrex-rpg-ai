// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /healthz', () => {
  it('answers 204 with nothing cached', () => {
    const response = GET();
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
