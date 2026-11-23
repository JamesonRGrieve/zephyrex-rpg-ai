// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aimAt, mapStep, placeParty } from './mapStep';

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
      sceneMoves: [],
    });
  });

  it("reads who the round's lines took off the scene or brought onto it, and whether the VTT applied it", async () => {
    answer({
      moves: [],
      seat_moved: false,
      scene_changed: false,
      scene_moves: [
        { person_id: 'p1', name: 'Old Hesk', change: 'left', applied: true },
        { person_id: 'p2', name: 'Mira', change: 'arrived', applied: false },
        { person_id: 'p3', name: 'Nobody', change: 'wandered', applied: true },
      ],
    });
    expect((await mapStep('c1', 'm1'))?.sceneMoves).toEqual([
      { personId: 'p1', name: 'Old Hesk', change: 'left', applied: true },
      { personId: 'p2', name: 'Mira', change: 'arrived', applied: false },
    ]);
  });

  it('is nothing when no one moved and the scene stayed', async () => {
    answer({ moves: [], seat_moved: false, scene_changed: false, seat_location: { id: 'l1', name: 'Here', chain: [] } });
    expect(await mapStep('c1', 'm1')).toBeNull();
  });
});

describe('placeParty', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads how many were placed and on which scene', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ place_party: { placed: 3, scene_id: 's1' } }), { status: 200 })),
    );
    expect(await placeParty('c1')).toEqual({ placed: 3, sceneId: 's1' });
  });

  it('is null when the server could not place them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    expect(await placeParty('c1')).toBeNull();
  });
});
