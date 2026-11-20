// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A zip of stored (uncompressed) entries, in the order given. Enough for an EPUB, whose first
 * entry must be a stored `mimetype`, and small enough that no archive library is needed: the
 * pictures in a story are already compressed, and its text is small.
 */
import { crc32 } from '~/features/import/pngCard';

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
// 1980-01-01 00:00, the earliest DOS date: entries carry no real time, so output is reproducible.
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 1 << 11;

/** The entries as one zip file. Names are UTF-8; each entry is stored, never compressed. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const named = entries.map((entry) => ({ ...entry, nameBytes: encoder.encode(entry.name), crc: crc32(entry.bytes) }));
  const localSize = named.reduce((sum, entry) => sum + LOCAL_HEADER + entry.nameBytes.length + entry.bytes.length, 0);
  const centralSize = named.reduce((sum, entry) => sum + CENTRAL_HEADER + entry.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + END_RECORD);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let at = 0;

  for (const entry of named) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed: 2.0
    view.setUint16(at + 6, UTF8_NAMES, true);
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, 0, true); // time
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, entry.crc, true);
    view.setUint32(at + 18, entry.bytes.length, true);
    view.setUint32(at + 22, entry.bytes.length, true);
    view.setUint16(at + 26, entry.nameBytes.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(entry.nameBytes, at + LOCAL_HEADER);
    out.set(entry.bytes, at + LOCAL_HEADER + entry.nameBytes.length);
    at += LOCAL_HEADER + entry.nameBytes.length + entry.bytes.length;
  }

  const centralStart = at;
  named.forEach((entry, index) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // made by
    view.setUint16(at + 6, 20, true); // needed
    view.setUint16(at + 8, UTF8_NAMES, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, 0, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, entry.crc, true);
    view.setUint32(at + 20, entry.bytes.length, true);
    view.setUint32(at + 24, entry.bytes.length, true);
    view.setUint16(at + 28, entry.nameBytes.length, true);
    // extra, comment, disk, internal and external attributes stay 0
    view.setUint32(at + 42, offsets[index] as number, true);
    out.set(entry.nameBytes, at + CENTRAL_HEADER);
    at += CENTRAL_HEADER + entry.nameBytes.length;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, named.length, true);
  view.setUint16(at + 10, named.length, true);
  view.setUint32(at + 12, at - centralStart, true);
  view.setUint32(at + 16, centralStart, true);
  return out;
}

/** The entries of a stored zip, read back (tests and checks; no compression supported). */
export function unzipStore(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  while (at + LOCAL_HEADER <= zip.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const start = at + LOCAL_HEADER + nameLength + extra;
    entries.push({
      name: decoder.decode(zip.subarray(at + LOCAL_HEADER, at + LOCAL_HEADER + nameLength)),
      bytes: zip.subarray(start, start + size),
    });
    at = start + size;
  }
  return entries;
}
