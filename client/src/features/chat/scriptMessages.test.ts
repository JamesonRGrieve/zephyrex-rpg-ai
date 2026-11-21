// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deleteCount, messagesText, rangeIndexes } from './scriptMessages';

const LINES = [
  { name: 'Ada', text: 'Mind the coolant.' },
  { name: 'You', text: 'I hand her the spanner.' },
  { name: 'Ada', text: 'Thanks.' },
];

describe('rangeIndexes', () => {
  it('reads a line, a span, a line from the end, or every line', () => {
    expect(rangeIndexes('1', 3)).toEqual([1]);
    expect(rangeIndexes('0-1', 3)).toEqual([0, 1]);
    expect(rangeIndexes('2-0', 3)).toEqual([0, 1, 2]);
    expect(rangeIndexes('-1', 3)).toEqual([2]);
    expect(rangeIndexes('', 3)).toEqual([0, 1, 2]);
  });

  it('names nothing outside the branch, or for a range that is not one', () => {
    expect(rangeIndexes('5', 3)).toEqual([]);
    expect(rangeIndexes('-4', 3)).toEqual([]);
    expect(rangeIndexes('1-9', 3)).toEqual([1, 2]);
    expect(rangeIndexes('last', 3)).toEqual([]);
  });
});

describe('messagesText', () => {
  it('gives the lines with their speakers, or without', () => {
    expect(messagesText(LINES, '0-1', true)).toBe('Ada: Mind the coolant.\nYou: I hand her the spanner.');
    expect(messagesText(LINES, '-1', false)).toBe('Thanks.');
  });
});

describe('deleteCount', () => {
  it('is one by default, the number asked, and never more than there are', () => {
    expect(deleteCount('', 3)).toBe(1);
    expect(deleteCount('2', 3)).toBe(2);
    expect(deleteCount('9', 3)).toBe(3);
    expect(deleteCount('nope', 3)).toBe(0);
    expect(deleteCount('0', 3)).toBe(0);
  });
});
