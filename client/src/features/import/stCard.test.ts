// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CardError, cardFromJson, cardFromPng, cardToJson, pngTextChunks, readCardFile } from './stCard';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG's chunk: length, type, body and a CRC (the reader does not check CRCs). */
function chunk(type: string, body: Uint8Array): number[] {
  const length = body.length;
  return [(length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...[...type].map((c) => c.charCodeAt(0)), ...body, 0, 0, 0, 0];
}

const latin1 = (value: string) => Uint8Array.from([...value].map((c) => c.charCodeAt(0)));
const base64Json = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
const textChunk = (keyword: string, value: string) => chunk('tEXt', latin1(`${keyword}\0${value}`));

function png(...chunks: number[][]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([...SIGNATURE, ...chunk('IHDR', new Uint8Array(13)), ...chunks.flat(), ...chunk('IEND', new Uint8Array())]);
}

const V2 = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Ada',
    description: 'An engineer.',
    personality: 'dry',
    scenario: 'Aboard.',
    first_mes: 'Mind the coolant.',
    mes_example: '<START>',
    alternate_greetings: ['Hello, café ☕'],
    tags: ['sci-fi'],
    creator: 'Sam',
    extensions: { depth_prompt: { depth: 4 } },
  },
};

describe('SillyTavern cards', () => {
  it('reads a V2 card, mapping first_mes and mes_example', () => {
    expect(cardFromJson(V2)).toMatchObject({
      name: 'Ada',
      first_message: 'Mind the coolant.',
      example_messages: '<START>',
      alternate_greetings: ['Hello, café ☕'],
      extensions: { depth_prompt: { depth: 4 } },
    });
  });

  it('reads a V1 card with flat fields, and refuses a nameless one', () => {
    expect(cardFromJson({ name: ' Bram ', first_mes: 'Stew?', creatorcomment: 'old' })).toMatchObject({
      name: 'Bram',
      first_message: 'Stew?',
      creator_notes: 'old',
    });
    expect(() => cardFromJson({ spec: 'chara_card_v3', data: {} })).toThrow(CardError);
  });

  it('writes a V2 card that reads back the same', () => {
    const fields = cardFromJson(V2);
    expect(cardFromJson(cardToJson(fields))).toEqual(fields);
  });

  it('reads the card in a PNG, preferring V3 over V2, with UTF-8 text intact', () => {
    const v3 = { spec: 'chara_card_v3', spec_version: '3.0', data: { ...V2.data, name: 'Ada v3' } };
    const bytes = png(textChunk('chara', base64Json(V2)), textChunk('ccv3', base64Json(v3)));
    expect(pngTextChunks(bytes).map((found) => found.keyword)).toEqual(['chara', 'ccv3']);
    const card = cardFromPng(bytes);
    expect(card.name).toBe('Ada v3');
    expect(card.alternate_greetings).toEqual(['Hello, café ☕']);
  });

  it('refuses a PNG without a card, a broken card and a non-PNG', () => {
    expect(() => cardFromPng(png())).toThrow('This PNG carries no character card');
    expect(() => cardFromPng(png(textChunk('chara', 'not base64 json')))).toThrow('could not be read');
    expect(() => pngTextChunks(latin1('GIF89a'))).toThrow('Not a PNG');
  });

  it('hands back a card’s embedded lorebook, and none when it has no entries', async () => {
    const withBook = { ...V2, data: { ...V2.data, character_book: { name: 'Ada’s past', entries: [{ keys: ['forge'], content: 'She grew up at a forge.' }] } } };
    const read = await readCardFile(new Blob([JSON.stringify(withBook)]));
    expect(read.book).toMatchObject({ name: 'Ada’s past', entries: [{ keys: ['forge'], content: 'She grew up at a forge.' }] });
    const empty = { ...V2, data: { ...V2.data, character_book: { entries: [] } } };
    expect((await readCardFile(new Blob([JSON.stringify(empty)]))).book).toBeNull();
    expect((await readCardFile(new Blob([JSON.stringify(V2)]))).book).toBeNull();
  });

  it('reads a card file, keeping a PNG as the avatar', async () => {
    const fromPng = await readCardFile(new Blob([png(textChunk('chara', base64Json(V2)))]));
    expect(fromPng.fields.name).toBe('Ada');
    expect(fromPng.avatar).toMatch(/^data:image\/png;base64,/);
    const fromJson = await readCardFile(new Blob([JSON.stringify(V2)]));
    expect(fromJson.avatar).toBeNull();
    await expect(readCardFile(new Blob(['nonsense']))).rejects.toThrow('A card is a PNG or a JSON file');
  });
});
