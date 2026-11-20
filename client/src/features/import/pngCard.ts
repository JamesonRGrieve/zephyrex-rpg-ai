// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Writing a character card into a PNG (feature A2), the way SillyTavern reads one: the card's JSON,
 * base64-encoded, in a `tEXt` chunk named `chara` placed before the image data. Any card chunk the
 * picture already carried (`chara` or `ccv3`) is replaced. Pure: bytes in, bytes out.
 */
import { CardError, pngTextChunks } from './stCard';

const SIGNATURE_LENGTH = 8;
const CHUNK_HEADER = 8;
const CHUNK_CRC = 4;
const CARD_KEYWORDS = new Set(['chara', 'ccv3']);

let crcTable: Uint32Array | null = null;

/** The CRC-32 a PNG chunk carries over its type and data. */
export function crc32(bytes: Uint8Array): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(CHUNK_HEADER + data.length + CHUNK_CRC);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typed = new Uint8Array([...type].map((char) => char.charCodeAt(0)));
  out.set(typed, 4);
  out.set(data, CHUNK_HEADER);
  const crcInput = new Uint8Array(typed.length + data.length);
  crcInput.set(typed);
  crcInput.set(data, typed.length);
  view.setUint32(CHUNK_HEADER + data.length, crc32(crcInput));
  return out;
}

function base64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `png` with `card` written in as its `chara` chunk (replacing any card it carried). */
export function pngWithCard(png: Uint8Array, card: unknown): Uint8Array {
  pngTextChunks(png); // refuses anything that is not a PNG
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const latin1 = new TextDecoder('latin1');
  const kept: Uint8Array[] = [png.subarray(0, SIGNATURE_LENGTH)];
  let offset = SIGNATURE_LENGTH;
  let inserted = false;
  const cardChunk = chunk('tEXt', new Uint8Array([...'chara\0'].map((char) => char.charCodeAt(0)).concat([...base64Utf8(JSON.stringify(card))].map((char) => char.charCodeAt(0)))));
  while (offset + CHUNK_HEADER <= png.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(png.subarray(offset + 4, offset + CHUNK_HEADER));
    const end = offset + CHUNK_HEADER + length + CHUNK_CRC;
    if (end > png.length) throw new CardError('The PNG is cut short');
    const body = png.subarray(offset + CHUNK_HEADER, offset + CHUNK_HEADER + length);
    const keyword = type === 'tEXt' ? latin1.decode(body.subarray(0, Math.max(0, body.indexOf(0)))) : '';
    if (!inserted && (type === 'IDAT' || type === 'IEND')) {
      kept.push(cardChunk);
      inserted = true;
    }
    if (!(type === 'tEXt' && CARD_KEYWORDS.has(keyword))) kept.push(png.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  kept.reduce((at, part) => {
    out.set(part, at);
    return at + part.length;
  }, 0);
  return out;
}

/** A data URL's bytes and type. */
export function dataUrlBytes(url: string): { type: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (match === null) return null;
  const binary = atob(match[2] as string);
  return { type: match[1] as string, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
}
