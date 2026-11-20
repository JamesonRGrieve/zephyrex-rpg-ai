// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  it('installs standalone on the chats, with any-purpose and maskable icons and shortcuts', () => {
    const app = manifest();
    expect(app).toMatchObject({ start_url: '/play', display: 'standalone', scope: '/' });
    expect(app.icons?.map((icon) => icon.purpose)).toEqual(['any', 'maskable']);
    expect(app.shortcuts?.map((shortcut) => shortcut.url)).toContain('/characters');
  });
});
