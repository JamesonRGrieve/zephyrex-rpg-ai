// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { crc32, dataUrlBytes, pngWithCard } from './pngCard';
import { cardFromPng, cardJsonFromPng, dataUrl, pngTextChunks } from './stCard';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function chunk(type: string, body: number[]): number[] {
  const length = body.length;
  return [
    (length >>> 24) & 255,
    (length >>> 16) & 255,
    (length >>> 8) & 255,
    length & 255,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...body,
    0,
    0,
    0,
    0,
  ];
}
const textChunk = (keyword: string, value: string) =>
  chunk(
    'tEXt',
    [...`${keyword}\0${value}`].map((c) => c.charCodeAt(0)),
  );
const PNG = Uint8Array.from([
  ...SIGNATURE,
  ...chunk('IHDR', new Array(13).fill(0)),
  ...textChunk('Software', 'paint'),
  ...chunk('IDAT', [1, 2, 3]),
  ...chunk('IEND', []),
]);

const CARD = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Ada ☕', first_mes: 'Hi.' } };

describe('PNG card export', () => {
  it('computes the CRC-32 PNG uses', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });

  it('writes the card in before the image data, keeps the other chunks, and reads back the same', () => {
    const written = pngWithCard(PNG, CARD);
    expect(pngTextChunks(written).map((found) => found.keyword)).toEqual(['Software', 'chara']);
    expect(cardJsonFromPng(written)).toEqual(CARD);
    expect(cardFromPng(written).name).toBe('Ada ☕');
  });

  it('replaces a card the picture already carried', () => {
    const twice = pngWithCard(pngWithCard(PNG, { ...CARD, data: { name: 'Old' } }), CARD);
    expect(pngTextChunks(twice).filter((found) => found.keyword === 'chara')).toHaveLength(1);
    expect(cardFromPng(twice).name).toBe('Ada ☕');
  });

  it('reads a data URL back into bytes', () => {
    expect(dataUrlBytes(dataUrl(PNG, 'image/png'))).toEqual({ type: 'image/png', bytes: PNG });
    expect(dataUrlBytes('https://example.com')).toBeNull();
  });
});
