// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { columnsOf, fieldsOf, jsonList, jsonObject, jsonOrNull, plain } from './columns';

const COLUMNS = {
  name: plain('name'),
  first_message: plain('firstMessage'),
  tags: jsonList('tags'),
  extensions: jsonObject('extensions'),
};

describe('columns', () => {
  it('writes only the fields given, under their column names', () => {
    expect(columnsOf(COLUMNS, { name: 'Ada', tags: ['wizard'], unknown: 1, first_message: undefined })).toEqual({
      name: 'Ada',
      tags: '["wizard"]',
    });
  });

  it('reads every field back, with JSON parsed', () => {
    const row = { name: 'Ada', firstMessage: 'Hi', tags: '["a","b"]', extensions: '{"x":1}', other: true };
    expect(fieldsOf(COLUMNS, row)).toEqual({ name: 'Ada', first_message: 'Hi', tags: ['a', 'b'], extensions: { x: 1 } });
  });

  it('reads unreadable or mistyped JSON as empty', () => {
    expect(fieldsOf(COLUMNS, { name: 'Ada', firstMessage: '', tags: 'not json', extensions: '[1]' })).toMatchObject({
      tags: [],
      extensions: {},
    });
    expect(jsonList('x').read(null)).toEqual([]);
  });
});

describe('a nullable object column (a rewritten line’s revision)', () => {
  it('writes null as null and an object as JSON, and reads unreadable text as null', () => {
    const column = jsonOrNull('revision');
    expect(column.write(null)).toBeNull();
    expect(column.read(column.write({ original: 'x', reason: 'y', kind: 'meta' }))).toEqual({
      original: 'x',
      reason: 'y',
      kind: 'meta',
    });
    expect(column.read(null)).toBeNull();
    expect(column.read('not json')).toBeNull();
  });
});
