// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A scenario's state in play (A60) and its file (A61). Pure: each change returns the parts to save.
 */
import { z } from 'zod';
import type { Scenario } from '~/features/data/records';

export type ScenarioParts = Omit<Scenario, 'id' | 'created_at' | 'updated_at'>;

/** The clocks with clock `index` moved `step` segments, kept within 0 and its segments. */
export function advanceClock(clocks: Scenario['clocks'], index: number, step: number): Scenario['clocks'] {
  return clocks.map((clock, at) => (at === index ? { ...clock, filled: Math.min(clock.segments, Math.max(0, clock.filled + step)) } : clock));
}

/** The secrets with clue `clue` of secret `secret` found, or not found again. */
export function toggleClue(secrets: Scenario['secrets'], secret: number, clue: number): Scenario['secrets'] {
  return secrets.map((one, at) => (at === secret ? { ...one, clues: one.clues.map((found, index) => (index === clue ? { ...found, found: !found.found } : found)) } : one));
}

/** The beats with beat `index` marked done, or not done again. */
export function toggleBeat(beats: Scenario['beats'], index: number): Scenario['beats'] {
  return beats.map((beat, at) => (at === index ? { ...beat, done: !beat.done } : beat));
}

/** A secret is learned once any of its clues is found. */
export const learned = (secret: Scenario['secrets'][number]): boolean => secret.clues.some((clue) => clue.found);

const fileSchema = z
  .object({
    name: z.string().min(1),
    premise: z.string().default(''),
    hook: z.string().default(''),
    stakes: z.string().default(''),
    situation: z.string().default(''),
    cast: z.array(z.object({ name: z.string(), agenda: z.string().default(''), secret: z.string().default(''), disposition: z.string().default('') })).default([]),
    places: z.array(z.string()).default([]),
    clocks: z
      .array(z.object({ name: z.string(), segments: z.number().int(), filled: z.number().int().default(0), advances: z.string().default(''), when_full: z.string().default('') }))
      .default([]),
    secrets: z.array(z.object({ truth: z.string(), clues: z.array(z.object({ text: z.string(), found: z.boolean().default(false) })).default([]) })).default([]),
    beats: z.array(z.object({ text: z.string(), done: z.boolean().default(false) })).default([]),
    outcomes: z.array(z.string()).default([]),
  })
  .strip();

export class ScenarioFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioFileError';
  }
}

/** A scenario file (A61) as the parts to create; its campaign is not carried. */
export function scenarioFromJson(json: unknown): Omit<ScenarioParts, 'campaign_id'> {
  const parsed = fileSchema.safeParse(Reflect.get(Object(json), 'scenario') ?? json);
  if (!parsed.success) throw new ScenarioFileError('This is not a scenario file (it needs at least a name)');
  return parsed.data;
}

/** A scenario as its file: its parts, with play reset (no clock filled, no clue found, no beat done). */
export function scenarioToJson(scenario: ScenarioParts, keepState = false): Record<string, unknown> {
  // A file carries the scenario, never the campaign it was filed under.
  const parts: Omit<ScenarioParts, 'campaign_id'> = {
    name: scenario.name,
    premise: scenario.premise,
    hook: scenario.hook,
    stakes: scenario.stakes,
    situation: scenario.situation,
    cast: scenario.cast,
    places: scenario.places,
    clocks: scenario.clocks,
    secrets: scenario.secrets,
    beats: scenario.beats,
    outcomes: scenario.outcomes,
  };
  return {
    scenario: keepState
      ? parts
      : {
          ...parts,
          clocks: parts.clocks.map((clock) => ({ ...clock, filled: 0 })),
          secrets: parts.secrets.map((secret) => ({ ...secret, clues: secret.clues.map((clue) => ({ ...clue, found: false })) })),
          beats: parts.beats.map((beat) => ({ ...beat, done: false })),
        },
  };
}
