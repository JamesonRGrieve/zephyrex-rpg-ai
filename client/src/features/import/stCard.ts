// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern character cards in and out (feature A2): the JSON card in its three shapes
 * (V1 flat fields, Character Card V2 `{ spec: "chara_card_v2", data }`, V3
 * `{ spec: "chara_card_v3", data }`), and the PNG card, a picture whose `tEXt` chunk named `chara`
 * (V2) or `ccv3` (V3) carries the JSON in base64. Pure: bytes in, fields out.
 */
import { CARD_SPECS } from '~/contract';
import { type ImportedLorebook, lorebookFromJson } from './stLorebook';

/** The card fields this app keeps (the API's `character` fields, less the app's own). */
export interface CardFields {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_message: string;
  alternate_greetings: string[];
  example_messages: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  creator: string;
  character_version: string;
  tags: string[];
  extensions: Record<string, unknown>;
}

export class CardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CardError';
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHUNK_HEADER = 8;
const CHUNK_CRC = 4;
const CARD_KEYWORDS = ['ccv3', 'chara'];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** The card's fields, from any of the three JSON shapes. */
export function cardFromJson(json: unknown): CardFields {
  const root = object(json);
  const spec = text(root.spec);
  const versioned = spec === CARD_SPECS.v2.spec || spec === CARD_SPECS.v3.spec;
  const data = versioned ? object(root.data) : root;
  const name = text(data.name).trim();
  if (name === '') throw new CardError('The card has no name');
  return {
    name,
    description: text(data.description),
    personality: text(data.personality),
    scenario: text(data.scenario),
    // V1 cards call the greeting `first_mes` and the examples `mes_example`, as V2/V3 still do.
    first_message: text(data.first_mes),
    alternate_greetings: texts(data.alternate_greetings),
    example_messages: text(data.mes_example),
    system_prompt: text(data.system_prompt),
    post_history_instructions: text(data.post_history_instructions),
    creator_notes: text(data.creator_notes || data.creatorcomment),
    creator: text(data.creator),
    character_version: text(data.character_version),
    tags: texts(data.tags),
    extensions: object(data.extensions),
  };
}

/** A V2 card's JSON for `fields` (the shape every SillyTavern-compatible app reads). */
export function cardToJson(fields: CardFields): Record<string, unknown> {
  return {
    spec: CARD_SPECS.v2.spec,
    spec_version: CARD_SPECS.v2.spec_version,
    data: {
      name: fields.name,
      description: fields.description,
      personality: fields.personality,
      scenario: fields.scenario,
      first_mes: fields.first_message,
      mes_example: fields.example_messages,
      creator_notes: fields.creator_notes,
      system_prompt: fields.system_prompt,
      post_history_instructions: fields.post_history_instructions,
      alternate_greetings: fields.alternate_greetings,
      tags: fields.tags,
      creator: fields.creator,
      character_version: fields.character_version,
      extensions: fields.extensions,
    },
  };
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Every `tEXt` chunk's keyword and text, in file order. */
export function pngTextChunks(bytes: Uint8Array): { keyword: string; text: string }[] {
  if (!isPng(bytes)) throw new CardError('Not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  const chunks: { keyword: string; text: string }[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + CHUNK_HEADER <= bytes.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + CHUNK_HEADER));
    const start = offset + CHUNK_HEADER;
    if (start + length + CHUNK_CRC > bytes.length) throw new CardError('The PNG is cut short');
    if (type === 'tEXt') {
      const body = bytes.subarray(start, start + length);
      const split = body.indexOf(0);
      if (split > 0)
        chunks.push({ keyword: latin1.decode(body.subarray(0, split)), text: latin1.decode(body.subarray(split + 1)) });
    }
    if (type === 'IEND') break;
    offset = start + length + CHUNK_CRC;
  }
  return chunks;
}

function decodeBase64Json(encoded: string): unknown {
  const binary = atob(encoded.trim());
  const utf8 = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  return JSON.parse(utf8) as unknown;
}

/** The card JSON a PNG carries (V3's `ccv3` preferred over V2's `chara`). */
export function cardJsonFromPng(bytes: Uint8Array): unknown {
  const chunks = pngTextChunks(bytes);
  const chunk = CARD_KEYWORDS.map((keyword) => chunks.find((found) => found.keyword === keyword)).find(
    (found) => found !== undefined,
  );
  if (chunk === undefined) throw new CardError('This PNG carries no character card');
  try {
    return decodeBase64Json(chunk.text);
  } catch {
    throw new CardError('The card in this PNG could not be read');
  }
}

/** The card a PNG carries. */
export function cardFromPng(bytes: Uint8Array): CardFields {
  return cardFromJson(cardJsonFromPng(bytes));
}

/** A card's embedded lorebook (`character_book`), or null when it has none. */
export function cardBookFromJson(json: unknown, characterName: string): ImportedLorebook | null {
  const root = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const data = typeof root.data === 'object' && root.data !== null ? (root.data as Record<string, unknown>) : root;
  const book = data.character_book;
  if (typeof book !== 'object' || book === null) return null;
  const imported = lorebookFromJson(book, `${characterName}’s lore`);
  return imported.entries.length === 0 ? null : imported;
}

/** A data URL for an image's bytes (the card's picture becomes the character's avatar). */
export function dataUrl(bytes: Uint8Array, type: string): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${type};base64,${btoa(binary)}`;
}

export interface CardFile {
  fields: CardFields;
  /** A PNG card's picture, as a data URL. */
  avatar: string | null;
  /** The card's embedded lorebook, if it has one with entries. */
  book: ImportedLorebook | null;
}

/** A card file's fields, its picture (for a PNG card) and its embedded lorebook. */
export async function readCardFile(file: Blob & { name?: string }): Promise<CardFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let json: unknown;
  if (isPng(bytes)) json = cardJsonFromPng(bytes);
  else {
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new CardError('A card is a PNG or a JSON file');
    }
  }
  const fields = cardFromJson(json);
  return { fields, avatar: isPng(bytes) ? dataUrl(bytes, 'image/png') : null, book: cardBookFromJson(json, fields.name) };
}
