// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aimAt, mapStep } from './mapStep';

describe('aimAt', () => {
  it("aims the person's untargeted actions; speech and aimed actions stay", () => {
    expect(
      aimAt(
        ['Tessaly Kord punches it.', 'Tessaly Kord (to everyone): "Die!"', 'Tessaly Kord (at Wren) shoves her aside.'].join(
          '\n',
        ),
        'Tessaly Kord',
        'the Neverborn',
      ),
    ).toBe(
      [
        'Tessaly Kord (at the Neverborn) punches it.',
        'Tessaly Kord (to everyone): "Die!"',
        'Tessaly Kord (at Wren) shoves her aside.',
      ].join('\n'),
    );
  });
});

describe('mapStep', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: Record<string, unknown>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ map_step: body }), { status: 200 })),
    );

  it('reads the scene change and where the seat is, fully qualified', async () => {
    answer({
      moves: [],
      seat_moved: false,
      scene_changed: true,
      scene: { id: 's2', name: 'Sublevel Four' },
      seat_location: { id: 'l1', name: 'The Pale Tallow', chain: ['Transit Levels', 'Hive Desoleum', 'Desoleum'] },
    });
    expect(await mapStep('c1', 'm1')).toEqual({
      moved: [],
      scene: 'Sublevel Four',
      seatPlace: 'The Pale Tallow',
      seatMoved: false,
      seatChain: ['Transit Levels', 'Hive Desoleum', 'Desoleum'],
      sceneChanged: true,
    });
  });

  it('is nothing when no one moved and the scene stayed', async () => {
    answer({ moves: [], seat_moved: false, scene_changed: false, seat_location: { id: 'l1', name: 'Here', chain: [] } });
    expect(await mapStep('c1', 'm1')).toBeNull();
  });
});
