// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A character as the file SillyTavern takes (A2): a PNG with the card inside when the character has
 * a picture (any picture is redrawn as PNG first), otherwise the card's JSON. The character's own
 * lorebook rides along as the card's `character_book`.
 */
import { dataUrlBytes, pngWithCard } from './pngCard';

async function asPng(url: string): Promise<Uint8Array | null> {
  const parsed = dataUrlBytes(url);
  if (parsed === null) return null;
  if (parsed.type === 'image/png') return parsed.bytes;
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
}

function save(name: string, extension: string, part: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([part], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w.-]+/g, '_') || 'character'}.${extension}` });
  link.click();
  URL.revokeObjectURL(url);
}

/** Saves the card: as a PNG card when `avatar` is a picture, else as JSON. */
export async function exportCard(name: string, avatar: string | null, card: unknown): Promise<'png' | 'json'> {
  const png = avatar === null ? null : await asPng(avatar).catch(() => null);
  if (png !== null) {
    save(name, 'png', pngWithCard(png, card).slice().buffer, 'image/png');
    return 'png';
  }
  save(name, 'json', JSON.stringify(card, null, 2), 'application/json');
  return 'json';
}
