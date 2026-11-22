// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startPlace } from './startPlace';

const sullenmire = [
  { id: 'sul', kind: 'location', name: 'Sullenmire', parent_id: null },
  { id: 'hive', kind: 'location', name: 'Hive Korvaan', parent_id: 'sul' },
  { id: 'yard', kind: 'location', name: 'Processing Yard Alpha-7', parent_id: 'hive' },
  { id: 'bastion', kind: 'location', name: 'The Bastion', parent_id: 'hive' },
  { id: 'colonel', kind: 'person', name: 'Colonel Pietra Dravos', location_id: 'bastion' },
  { id: 'adjutant', kind: 'person', name: 'The Alpha-7 Adjutant', location_id: 'bastion' },
  { id: 'lieutenant', kind: 'person', name: 'The Alpha-7 Lieutenant', location_id: 'yard' },
  { id: 'dex', kind: 'person', name: 'Dex Calloran', location_id: null },
];

describe('startPlace (the Sullenmire start)', () => {
  it('the place the opening names, the longest first', () => {
    expect(startPlace('You step off the transport into Processing Yard Alpha-7 on Hive Korvaan.', sullenmire)).toBe('yard');
  });
  it('else where most people are', () => {
    expect(startPlace('An Inquisitor Lord arrives, unknown to all.', sullenmire)).toBe('bastion');
  });
  it('else the top place; nothing without places', () => {
    expect(
      startPlace(
        '',
        sullenmire.filter((one) => one.kind === 'location'),
      ),
    ).toBe('sul');
    expect(startPlace('Anything', [])).toBeNull();
  });
});
