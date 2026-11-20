// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/databank-cases.json';
import { chunksOf, dataBankText, retrieve } from './dataBank';

describe('the data bank (contract/databank-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', ({ documents, story, chunks, retrieved, text }) => {
    expect(documents.map((document) => chunksOf(document))).toEqual(chunks);
    expect(retrieve(documents, story)).toEqual(retrieved);
    expect(dataBankText(documents, story)).toBe(text);
  });
});
