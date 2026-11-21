// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '~/features/data/records';
import { escapeXml, illustrationPoints, lineXhtml, storyEpub, storyLines } from './epub';
import { unzipStore } from './zip';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function message(fields: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm',
    created_at: '2026-11-20T00:00:00Z',
    updated_at: null,
    chat_id: 'c',
    parent_id: null,
    role: 'character',
    channel: 'ic',
    speaker_character_id: 'ch',
    swipes: ['Hello.'],
    swipe_index: 0,
    bookmarked: false,
    images: [],
    x_carded: false,
    ...fields,
  };
}

const read = (zip: Uint8Array, name: string): string =>
  new TextDecoder().decode(unzipStore(zip).find((entry) => entry.name === name)?.bytes);

describe('storyLines', () => {
  it('keeps the story and leaves out table talk, the GM, rolls, the system and x-carded lines', () => {
    const lines = storyLines(
      [
        message({ id: '1', role: 'user', swipes: ['I open the door.'] }),
        message({ id: '2', channel: 'ooc', swipes: ['brb'] }),
        message({ id: '3', channel: 'gm', swipes: ['Roll stealth.'] }),
        message({ id: '4', channel: 'roll', swipes: ['d20 = 14'] }),
        message({ id: '5', role: 'system', swipes: ['Chat started.'] }),
        message({ id: '6', x_carded: true, swipes: ['Something skipped.'] }),
        message({ id: '7', swipes: ['First.', 'Chosen.'], swipe_index: 1, images: [PNG] }),
        message({ id: '8', role: 'narrator', swipes: ['Night falls.'] }),
      ],
      (each) => (each.role === 'user' ? 'Ana' : each.role === 'narrator' ? 'Narrator' : 'Mira'),
    );
    expect(lines).toEqual([
      { id: '1', speaker: 'Ana', text: 'I open the door.', images: [] },
      { id: '7', speaker: 'Mira', text: 'Chosen.', images: [PNG] },
      { id: '8', speaker: 'Narrator', text: 'Night falls.', images: [] },
    ]);
  });
});

describe('lineXhtml', () => {
  it('escapes the text, sets actions in italics and parts paragraphs on blank lines', () => {
    expect(lineXhtml('*waves* "Hi" <b>&\n\nNext line')).toBe(
      '<p><em>waves</em> &quot;Hi&quot; &lt;b&gt;&amp;</p>\n<p>Next line</p>',
    );
    expect(escapeXml(`'`)).toBe('&apos;');
  });
});

describe('storyEpub', () => {
  const book = storyEpub({
    title: 'The <Tower>',
    identifier: 'urn:rpg-ai:chat:c',
    language: 'en',
    modified: '2026-11-20T19:30:12.345Z',
    lines: [
      { speaker: 'Mira', text: 'Up we go.', images: [PNG, 'https://example.com/remote.png'] },
      { speaker: 'Ana', text: '', images: ['data:image/svg+xml;base64,PHN2Zy8+'] },
    ],
  });

  it('is an EPUB a reader can open: mimetype first, then the container pointing at the package', () => {
    const names = unzipStore(book).map((entry) => entry.name);
    expect(names[0]).toBe('mimetype');
    expect(read(book, 'mimetype')).toBe('application/epub+zip');
    expect(read(book, 'META-INF/container.xml')).toContain('full-path="OEBPS/content.opf"');
    expect(names).toEqual(expect.arrayContaining(['OEBPS/nav.xhtml', 'OEBPS/story.xhtml', 'OEBPS/story.css']));
  });

  it('names the book, dates it to the second, and lists every file it holds', () => {
    const opf = read(book, 'OEBPS/content.opf');
    expect(opf).toContain('<dc:title>The &lt;Tower&gt;</dc:title>');
    expect(opf).toContain('<dc:identifier id="book-id">urn:rpg-ai:chat:c</dc:identifier>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-11-20T19:30:12Z</meta>');
    expect(opf).toContain('href="images/picture-1.png" media-type="image/png"');
    expect(opf).toContain('properties="nav"');
  });

  it('carries only pictures it can hold: embedded ones a reader shows, never a link out', () => {
    const names = unzipStore(book).map((entry) => entry.name);
    expect(names.filter((name) => name.startsWith('OEBPS/images/'))).toEqual(['OEBPS/images/picture-1.png']);
    const story = read(book, 'OEBPS/story.xhtml');
    expect(story).toContain('<img src="images/picture-1.png"');
    expect(story).not.toContain('example.com');
    expect(story).toContain('<p class="speaker">Mira</p>');
    expect(story).not.toContain('<p class="speaker">Ana</p>');
  });
});

describe('illustrationPoints', () => {
  const line = (images: string[] = []) => ({ speaker: 'A', text: 'x', images });

  it('draws at the end of each run of lines with no picture, and counts again after one', () => {
    const lines = [line(), line(), line(), line(['p']), line(), line(), line(), line(), line()];
    expect(illustrationPoints(lines, 3)).toEqual([2, 6]);
  });

  it('draws no more than the most for one book', () => {
    expect(
      illustrationPoints(
        Array.from({ length: 30 }, () => line()),
        2,
        4,
      ),
    ).toEqual([1, 3, 5, 7]);
  });
});
