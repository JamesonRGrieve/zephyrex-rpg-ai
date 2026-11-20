// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A picture chosen from a file, as the records keep one: a data URL of an allowed type and size
 * (avatars, chat backgrounds). The lite edition needs no file store this way.
 */
import { LIMITS } from '~/contract';
import { dataUrl } from '~/features/import/stCard';

export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** The picture as a data URL, or why it was refused. */
export async function pictureFromFile(
  file: Pick<File, 'type' | 'arrayBuffer'>,
): Promise<{ url: string } | { refused: string }> {
  if (!PICTURE_TYPES.includes(file.type)) return { refused: 'A picture is a PNG, JPEG, WebP or GIF' };
  const url = dataUrl(new Uint8Array(await file.arrayBuffer()), file.type);
  return url.length > LIMITS.avatar_bytes ? { refused: 'That picture is too large' } : { url };
}
