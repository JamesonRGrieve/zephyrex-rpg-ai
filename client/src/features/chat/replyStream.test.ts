// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseEventBlock, takeBlocks } from './replyStream';

describe('reply stream', () => {
  it('reads deltas, the end and errors', () => {
    expect(parseEventBlock('event: delta\ndata: {"text":"Hi"}')).toEqual({ type: 'delta', text: 'Hi' });
    expect(parseEventBlock('event: done\ndata: {"dropped":3}')).toEqual({ type: 'done', dropped: 3 });
    expect(parseEventBlock('event: error\ndata: {"detail":"stopped"}')).toEqual({ type: 'error', detail: 'stopped' });
  });

  it('ignores what is not one of its events', () => {
    expect(parseEventBlock('event: ping\ndata: {}')).toBeNull();
    expect(parseEventBlock('event: delta\ndata: not json')).toBeNull();
    expect(parseEventBlock('event: delta\ndata: {"text":1}')).toBeNull();
  });

  it('splits finished blocks from an unfinished one', () => {
    expect(takeBlocks('event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"te')).toEqual({
      blocks: ['event: delta\ndata: {"text":"a"}'],
      rest: 'event: delta\ndata: {"te',
    });
  });
});
