// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { crc32 } from '~/features/import/pngCard';
import { unzipStore, zipStore } from './zip';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('zipStore', () => {
  it('stores each entry in order and reads back the same', () => {
    const zip = zipStore([
      { name: 'mimetype', bytes: bytes('application/epub+zip') },
      { name: 'dir/ünïcode.txt', bytes: bytes('hello') },
    ]);
    const entries = unzipStore(zip);
    expect(entries.map((entry) => entry.name)).toEqual(['mimetype', 'dir/ünïcode.txt']);
    expect(new TextDecoder().decode(entries[1]?.bytes)).toBe('hello');
  });

  it('writes the first entry where an EPUB reader looks for it, stored, with its CRC', () => {
    const zip = zipStore([{ name: 'mimetype', bytes: bytes('application/epub+zip') }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // stored
    expect(view.getUint32(14, true)).toBe(crc32(bytes('application/epub+zip')));
    expect(new TextDecoder().decode(zip.subarray(30, 38))).toBe('mimetype');
    expect(new TextDecoder().decode(zip.subarray(38, 58))).toBe('application/epub+zip');
  });

  it('ends with a directory that points back at every entry', () => {
    const zip = zipStore([
      { name: 'a', bytes: bytes('1') },
      { name: 'b', bytes: bytes('22') },
    ]);
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const central = view.getUint32(end + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint32(central + 42, true)).toBe(0);
    const second = central + 46 + 1;
    expect(view.getUint32(second + 42, true)).toBe(30 + 1 + 1);
  });
});
