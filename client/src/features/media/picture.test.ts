// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { LIMITS } from '~/contract';
import { pictureFromFile } from './picture';

const file = (type: string, bytes: number) => ({ type, arrayBuffer: async () => new Uint8Array(bytes).buffer });

describe('pictureFromFile', () => {
  it('keeps an allowed picture as a data URL', async () => {
    expect(await pictureFromFile(file('image/png', 3))).toEqual({ url: 'data:image/png;base64,AAAA' });
  });

  it('refuses another type or a picture too large', async () => {
    expect(await pictureFromFile(file('image/svg+xml', 3))).toEqual({ refused: 'A picture is a PNG, JPEG, WebP or GIF' });
    expect(await pictureFromFile(file('image/png', LIMITS.avatar_bytes))).toEqual({ refused: 'That picture is too large' });
  });
});
