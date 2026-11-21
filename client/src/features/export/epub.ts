// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A branch as an illustrated story (AP10): an EPUB 3 book of the in-character lines, with the
 * pictures each line carries (A30) set after it. Table talk, GM asides, rolls and x-carded lines
 * are not the story, so they never enter the book (docs/DESIGN.md, Out-of-character).
 */
import type { ChatMessage } from '~/features/data/records';
import { roleplayPieces } from '~/features/chat/roleplayText';
import { dataUrlBytes } from '~/features/import/pngCard';
import { type ZipEntry, zipStore } from './zip';

export interface StoryLine {
  /** The message the line is, so a picture can be drawn of the scene up to it. */
  id?: string;
  speaker: string;
  text: string;
  /** Picture URLs; only data URLs can be put in the book. */
  images: readonly string[];
}

const STORY_ROLES: ReadonlySet<ChatMessage['role']> = new Set(['user', 'character', 'narrator']);

/** The lines of a branch that belong in the story, in order, each on its chosen swipe. */
export function storyLines(branch: readonly ChatMessage[], speakerOf: (message: ChatMessage) => string): StoryLine[] {
  return branch
    .filter((message) => message.channel === 'ic' && STORY_ROLES.has(message.role) && !message.x_carded)
    .map((message) => ({
      id: message.id,
      speaker: speakerOf(message),
      text: message.swipes[message.swipe_index] ?? '',
      images: message.images,
    }))
    .filter((line) => line.text.trim() !== '' || line.images.length > 0);
}

/** How many lines may pass without a picture before one is drawn, and the most drawn for one book. */
export const ILLUSTRATE_EVERY = 6;
export const ILLUSTRATE_MOST = 8;

/**
 * Where an illustrated book draws pictures (AP10): the last line of each run of `every` lines with
 * no picture of their own, at most `most`, so a long chat doesn't ask for dozens of pictures.
 */
export function illustrationPoints(
  lines: readonly StoryLine[],
  every: number = ILLUSTRATE_EVERY,
  most: number = ILLUSTRATE_MOST,
): number[] {
  const points: number[] = [];
  let since = 0;
  lines.forEach((line, index) => {
    if (line.images.length > 0) {
      since = 0;
      return;
    }
    since += 1;
    if (since === every && points.length < most) {
      points.push(index);
      since = 0;
    }
  });
  return points;
}

/** Pictures an EPUB reader must show (EPUB 3.3 core media types), and their file endings. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** One line's text as XHTML paragraphs: blank lines part paragraphs, `*actions*` in italics. */
export function lineXhtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => {
      const inner = roleplayPieces(paragraph)
        .map((piece) => (piece.kind === 'action' ? `<em>${escapeXml(piece.text)}</em>` : escapeXml(piece.text)))
        .join('')
        .replaceAll('\n', '<br/>');
      return `<p>${inner}</p>`;
    })
    .join('\n');
}

export interface EpubOptions {
  title: string;
  /** Stable for the chat, so a re-export is the same book to a reader's library. */
  identifier: string;
  language: string;
  /** When the book was made (ISO 8601); the seconds are kept, the rest dropped. */
  modified: string;
  lines: readonly StoryLine[];
}

const XHTML_HEAD = (title: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" href="story.css"/></head>`;

const STYLES = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1 { text-align: center; margin: 2em 0; }
.line { margin: 0 0 1.2em; }
.speaker { font-weight: bold; font-variant: small-caps; margin: 0 0 0.3em; }
.line p { margin: 0 0 0.6em; }
figure { margin: 1em 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
`;

/** The book as EPUB bytes. */
export function storyEpub(options: EpubOptions): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const text = (name: string, content: string): ZipEntry => ({ name, bytes: encoder.encode(content) });
  const pictures: { file: string; type: string; bytes: Uint8Array }[] = [];

  const body = options.lines
    .map((line) => {
      const figures = line.images
        .map((url) => {
          const decoded = dataUrlBytes(url);
          const ending = decoded === null ? undefined : IMAGE_TYPES[decoded.type];
          if (decoded === null || ending === undefined) return '';
          const file = `images/picture-${pictures.length + 1}.${ending}`;
          pictures.push({ file, type: decoded.type, bytes: decoded.bytes });
          return `<figure><img src="${file}" alt="${escapeXml(`A picture of the scene, with ${line.speaker}'s line`)}"/></figure>`;
        })
        .join('\n');
      const words =
        line.text.trim() === '' ? '' : `<p class="speaker">${escapeXml(line.speaker)}</p>\n${lineXhtml(line.text)}`;
      return `<section class="line">\n${words}${words !== '' && figures !== '' ? '\n' : ''}${figures}\n</section>`;
    })
    .join('\n');

  const modified = `${options.modified.slice(0, 19)}Z`;
  const manifestPictures = pictures
    .map((picture, index) => `    <item id="picture-${index + 1}" href="${picture.file}" media-type="${picture.type}"/>`)
    .join('\n');

  return zipStore([
    text('mimetype', 'application/epub+zip'),
    text(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n`,
    ),
    text(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(options.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(options.identifier)}</dc:identifier>
    <dc:title>${escapeXml(options.title)}</dc:title>
    <dc:language>${escapeXml(options.language)}</dc:language>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="story" href="story.xhtml" media-type="application/xhtml+xml"/>
    <item id="styles" href="story.css" media-type="text/css"/>
${manifestPictures}
  </manifest>
  <spine>
    <itemref idref="story"/>
  </spine>
</package>
`,
    ),
    text(
      'OEBPS/nav.xhtml',
      `${XHTML_HEAD(options.title)}\n<body>\n<nav epub:type="toc"><ol><li><a href="story.xhtml">${escapeXml(options.title)}</a></li></ol></nav>\n</body>\n</html>\n`,
    ),
    text('OEBPS/story.css', STYLES),
    text(
      'OEBPS/story.xhtml',
      `${XHTML_HEAD(options.title)}\n<body>\n<h1>${escapeXml(options.title)}</h1>\n${body}\n</body>\n</html>\n`,
    ),
    ...pictures.map((picture) => ({ name: `OEBPS/${picture.file}`, bytes: picture.bytes })),
  ]);
}
