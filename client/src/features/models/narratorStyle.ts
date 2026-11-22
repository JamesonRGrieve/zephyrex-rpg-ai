// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Narrator sliders choose the model by reputation and tune it (the operator, 2026-11-21). A model
 * narrates only when it isn't marked not a narrator, is at least min_params_b (or of unknown size)
 * and adherent enough; the nearest to the chat's set sliders wins. Tuning maps verbosity to a
 * length line (never a token ceiling: the operator, 2026-11-21), spice and darkness to tone lines capped by the table's content
 * rating, and humour to a little temperature. Pure, and held to contract/narrator-style-cases.json
 * with ai_chat/NarratorStyle.py; traits from contract/model-traits.json.
 */
import seeds from '../../../../contract/model-traits.json';
import { NARRATOR_STYLE } from '~/contract';

export type Traits = Partial<Record<(typeof NARRATOR_STYLE.traits)[number], number>> & {
  params_b?: number | null;
  narrator?: boolean;
  warm?: boolean;
};
export type NarratorStyle = Partial<Record<(typeof NARRATOR_STYLE.sliders)[number], number | null>>;

export interface StyleEndpoint {
  id: string;
  model: string;
  roles: readonly string[];
  is_default: boolean;
  traits?: Traits | null;
}

const SEEDS = seeds.models as unknown as Record<string, Traits>;

/** A model name as the seeds key it: no tier prefix (72gb/), no tag (:latest), lower case. */
export function modelKey(model: string): string {
  return model.trim().toLowerCase().replace(/^.*\//, '').replace(/:.*$/, '');
}

/** An endpoint's traits: the seeds for its model, its own overriding. */
export function traitsOf(endpoint: Pick<StyleEndpoint, 'model' | 'traits'>): Traits {
  return { ...(SEEDS[modelKey(endpoint.model)] ?? {}), ...(endpoint.traits ?? {}) };
}

/** Whether a model may narrate: not marked otherwise, big enough (or unknown), adherent enough. */
export function mayNarrate(traits: Traits): boolean {
  if (traits.narrator === false) return false;
  if (typeof traits.params_b === 'number' && traits.params_b < NARRATOR_STYLE.min_params_b) return false;
  return (traits.adherence ?? NARRATOR_STYLE.adherence_floor) >= NARRATOR_STYLE.adherence_floor;
}

const value = (traits: Traits, slider: string): number => {
  const known = (key: string): number => {
    const found = (traits as Record<string, unknown>)[key];
    return typeof found === 'number' ? found : NARRATOR_STYLE.unknown;
  };
  return slider === 'spice' ? known('spice') * (1 - (typeof traits.refuse === 'number' ? traits.refuse : 0)) : known(slider);
};

const speed = (traits: Traits): number =>
  (traits.speed ?? NARRATOR_STYLE.unknown) * (traits.warm === true ? 1 : NARRATOR_STYLE.cold_speed_factor);

/**
 * The endpoint to narrate with, or null to keep the current choice: the chat's own endpoint when it
 * names one; else among those holding the story or gm role (else the default) that may narrate, the
 * nearest to the set sliders (ties: the default, then the faster); no slider set, the default when it
 * may narrate, else the most adherent that may.
 */
export function narratorEndpoint(
  endpoints: readonly StyleEndpoint[],
  style: NarratorStyle | null | undefined,
  explicitId: string | null,
): string | null {
  if (explicitId !== null && endpoints.some((endpoint) => endpoint.id === explicitId)) return explicitId;
  const roled = endpoints.filter((endpoint) => endpoint.roles.includes('story') || endpoint.roles.includes('gm'));
  const pool = (roled.length > 0 ? roled : endpoints.filter((endpoint) => endpoint.is_default)).filter((endpoint) =>
    mayNarrate(traitsOf(endpoint)),
  );
  if (pool.length === 0) return null;
  const set = NARRATOR_STYLE.sliders.filter((slider) => typeof style?.[slider] === 'number');
  const ranked = [...pool].sort((a, b) => {
    const ta = traitsOf(a);
    const tb = traitsOf(b);
    if (set.length > 0) {
      const distance = (traits: Traits): number =>
        set.reduce((sum, slider) => sum + (value(traits, slider) - (style?.[slider] ?? 0)) ** 2, 0);
      const gap = distance(ta) - distance(tb);
      if (Math.abs(gap) > 1e-9) return gap;
    }
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    if (set.length === 0) {
      const adherent = (tb.adherence ?? NARRATOR_STYLE.unknown) - (ta.adherence ?? NARRATOR_STYLE.unknown);
      if (Math.abs(adherent) > 1e-9) return adherent;
    }
    return speed(tb) - speed(ta);
  });
  return ranked[0]?.id ?? null;
}

/** How the sliders tune a turn, within the table's content rating. */
export function styleTuning(
  style: NarratorStyle | null | undefined,
  rating: string | null,
): { length: string; tones: string[]; temperature_delta: number } {
  const verbosity = style?.verbosity;
  const band =
    typeof verbosity === 'number' ? NARRATOR_STYLE.verbosity_bands.find((one) => verbosity < one.below) : undefined;
  const allowed = Math.max(0, NARRATOR_STYLE.ratings.indexOf(rating ?? 'general'));
  const tones: string[] = [];
  for (const tone of NARRATOR_STYLE.tone) {
    const level = style?.[tone.slider as keyof NarratorStyle];
    if (typeof level !== 'number') continue;
    if (level >= tone.high_at && allowed >= NARRATOR_STYLE.ratings.indexOf(tone.high_rating)) tones.push(tone.high);
    else if (level <= tone.low_at) tones.push(tone.low);
  }
  const humour = style?.humour;
  return {
    length: band?.line ?? '',
    tones,
    temperature_delta: typeof humour === 'number' ? Math.round(humour * NARRATOR_STYLE.temperature_delta * 1000) / 1000 : 0,
  };
}

const unit = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Why an endpoint's own traits can't be kept, or null: known traits 0-1, params_b a size, flags true or false. */
export function traitsProblem(value: Readonly<Record<string, unknown>>): string | null {
  for (const [key, one] of Object.entries(value)) {
    if ((NARRATOR_STYLE.traits as readonly string[]).includes(key)) {
      if (!unit(one)) return `${key} is a number from 0 to 1`;
    } else if (key === 'params_b') {
      if (one !== null && !(typeof one === 'number' && Number.isFinite(one) && one > 0))
        return 'params_b is a size in billions';
    } else if (key === 'narrator' || key === 'warm') {
      if (typeof one !== 'boolean') return `${key} is true or false`;
    } else return `${key} is not a trait`;
  }
  return null;
}

/** Why a chat's narrator style can't be kept, or null: each slider 0-1, or null for any. */
export function styleProblem(value: Readonly<Record<string, unknown>>): string | null {
  for (const [key, one] of Object.entries(value)) {
    if (!(NARRATOR_STYLE.sliders as readonly string[]).includes(key)) return `${key} is not a slider`;
    if (one !== null && !unit(one)) return `${key} is a number from 0 to 1, or null for any`;
  }
  return null;
}
