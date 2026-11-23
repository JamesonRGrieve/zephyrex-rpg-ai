// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseEventBlock, takeBlocks } from './replyStream';

describe('reply stream', () => {
  it('reads deltas, the end and errors', () => {
    expect(parseEventBlock('event: delta\ndata: {"text":"Hi"}')).toEqual({ type: 'delta', text: 'Hi' });
    expect(parseEventBlock('event: done\ndata: {"dropped":3}')).toEqual({ type: 'done', dropped: 3, stopped: false });
    expect(parseEventBlock('event: done\ndata: {"stopped":true,"dropped":0}')).toEqual({
      type: 'done',
      dropped: 0,
      stopped: true,
    });
    // A keepalive is the stream alive, saying nothing.
    expect(parseEventBlock(': keepalive')).toEqual({ type: 'heartbeat' });
    expect(
      parseEventBlock(
        'event: voice_problem\ndata: {"kind":"npc","name":"Sergeant Horvec","note":"spoke as Sergeant Horvec"}',
      ),
    ).toEqual({
      type: 'voice_problem',
      kind: 'npc',
      note: 'spoke as Sergeant Horvec',
    });
    expect(
      parseEventBlock(
        'event: reformat\ndata: {"reformatted":true,"reason":"","cut":false,"runs":[{"speaker_id":"y1","speaker_name":null,"lines":[{"kind":"say","manner":"speak","target_id":null,"target_name":null,"text":"Sit."}]}]}',
      ),
    ).toEqual({
      type: 'reformat',
      reformatted: true,
      runs: [
        {
          speaker_id: 'y1',
          speaker_name: null,
          lines: [{ kind: 'say', manner: 'speak', target_id: null, target_name: null, text: 'Sit.' }],
        },
      ],
    });
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
