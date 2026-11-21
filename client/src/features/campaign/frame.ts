// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A campaign frame being written (A57), by the frame form or by session zero (AP1), and the
 * fields it saves as. One function turns the draft into fields, so both ways of framing a campaign
 * save the same thing: zero dials and pillars left out, lists split, trimmed and capped.
 */
import { LIMITS } from '~/contract';
import { parseTags } from '~/features/chat/library';
import type { Campaign, Fields } from '~/features/data/records';

export interface FrameDraft {
  name: string;
  premise: string;
  genre: string;
  dials: Record<string, number>;
  /** Comma-separated, as typed. */
  themes: string;
  pillars: Record<string, number>;
  structure: Campaign['structure'];
  /** One per line, as typed. */
  truths: string;
  characters: string;
  gmStyle: string;
  mode: Campaign['resolution_mode'];
}

/** A draft from a saved frame, or an empty one. */
export function draftOf(campaign: Campaign | null): FrameDraft {
  return {
    name: campaign?.name ?? '',
    premise: campaign?.premise ?? '',
    genre: campaign?.genre ?? '',
    dials: campaign?.dials ?? {},
    themes: (campaign?.themes ?? []).join(', '),
    pillars: campaign?.pillars ?? {},
    structure: campaign?.structure ?? null,
    truths: (campaign?.truths ?? []).join('\n'),
    characters: campaign?.characters ?? '',
    gmStyle: campaign?.gm_style ?? '',
    mode: campaign?.resolution_mode ?? null,
  };
}

const nonZero = (values: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== 0));

/** The fields a draft saves as. */
export function frameFields(draft: FrameDraft): Fields<Campaign> & { name: string } {
  return {
    name: draft.name.trim(),
    premise: draft.premise,
    genre: draft.genre.trim(),
    dials: nonZero(draft.dials),
    themes: parseTags(draft.themes).slice(0, LIMITS.campaign_list_items),
    pillars: nonZero(draft.pillars),
    structure: draft.structure,
    truths: draft.truths
      .split('\n')
      .map((truth) => truth.trim())
      .filter(Boolean)
      .slice(0, LIMITS.campaign_list_items),
    characters: draft.characters,
    gm_style: draft.gmStyle.trim(),
    resolution_mode: draft.mode,
  };
}

/** A draft as an unsaved campaign, for showing it the way players will read it (the brief). */
export function previewCampaign(draft: FrameDraft): Campaign {
  const fields = frameFields(draft);
  return {
    id: 'preview',
    created_at: '',
    updated_at: null,
    wiki_campaign_id: null,
    premise: '',
    genre: '',
    dials: {},
    themes: [],
    pillars: {},
    structure: null,
    truths: [],
    characters: '',
    resolution_mode: null,
    gm_style: '',
    ...fields,
    name: fields.name === '' ? 'Untitled campaign' : fields.name,
  };
}
