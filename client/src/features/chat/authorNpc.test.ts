// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authoringEvent } from './authorNpc';

describe('authoringEvent', () => {
  it('reads each step, the person made, and a failure; a heartbeat is nothing', () => {
    expect(authoringEvent('event: step\ndata: {"label":"Writing the barkeeper","done":1,"total":4}')).toEqual({
      type: 'step',
      step: { label: 'Writing the barkeeper', done: 1, total: 4 },
    });
    expect(authoringEvent('event: done\ndata: {"person_id":"p1","name":"Marta"}')).toEqual({ type: 'done', personId: 'p1' });
    expect(authoringEvent('event: error\ndata: {"message":"no model"}')).toEqual({ type: 'error', message: 'no model' });
    expect(authoringEvent(': keepalive')).toBeNull();
  });
});
