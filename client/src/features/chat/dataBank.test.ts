// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/databank-cases.json';
import { chunksOf, dataBankText, retrieve, wikiDocumentTexts } from './dataBank';

describe('the data bank (contract/databank-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', ({ documents, story, chunks, retrieved, text }) => {
    expect(documents.map((document) => chunksOf(document))).toEqual(chunks);
    expect(retrieve(documents, story)).toEqual(retrieved);
    expect(dataBankText(documents, story)).toBe(text);
  });
});

describe('the data bank from the wiki (contract/databank-cases.json wiki_cases, shared with the server)', () => {
  it.each(cases.wiki_cases)('$name', ({ documents, texts }) => {
    expect(wikiDocumentTexts(documents)).toEqual(texts);
  });
});
