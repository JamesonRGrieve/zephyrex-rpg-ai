// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A campaign's frame (A57): what kind of game the table agreed to play. Tap-to-pick for the dials,
 * the pillars, the structure and the resolution mode; free text for the rest. Every part is
 * optional: what is left empty is left out of what the model reads.
 */
import Link from 'next/link';
import { type ReactElement, useId, useState } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { CAMPAIGN, LIMITS } from '~/contract';
import { frameFields } from '~/features/campaign/frame';
import { type Campaign, campaigns, refreshedByRecords } from '~/features/data/records';

const CHIP = 'h-11';
export const STRUCTURE_LABELS: Record<(typeof CAMPAIGN.structures)[number], string> = {
  sandbox: 'Sandbox',
  linear: 'Linear',
  episodic: 'Episodic',
  one_shot: 'One-shot',
};
export const MODE_LABELS: Record<(typeof CAMPAIGN.resolution_modes)[number], string> = {
  narrative: 'Narrative',
  mechanical: 'Rules as written',
  hybrid: 'Hybrid',
};

/** One row of chips choosing one value (or none, by choosing it again). */
export function Pick<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (next: T | null) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-2'>
      <span id={id} className='text-sm font-medium'>
        {label}
      </span>
      <div ref={chipGroup} role='radiogroup' aria-labelledby={id} className='flex flex-wrap gap-2'>
        {options.map((option) => (
          <ChoiceChip
            key={String(option.value)}
            checked={value === option.value}
            className={CHIP}
            onClick={() => onChange(value === option.value ? null : option.value)}
          >
            {option.label}
          </ChoiceChip>
        ))}
      </div>
    </div>
  );
}

export const dialOptions = (left: string, right: string): { value: number; label: string }[] => [
  { value: -2, label: `Very ${left}` },
  { value: -1, label: left },
  { value: 0, label: 'Balanced' },
  { value: 1, label: right },
  { value: 2, label: `Very ${right}` },
];

export function CampaignForm({ campaign, done }: { campaign: Campaign | null; done: () => void }): ReactElement {
  const { create, update } = campaigns.useActions();
  const [name, setName] = useState(campaign?.name ?? '');
  const [premise, setPremise] = useState(campaign?.premise ?? '');
  const [genre, setGenre] = useState(campaign?.genre ?? '');
  const [dials, setDials] = useState<Record<string, number>>(campaign?.dials ?? {});
  const [themes, setThemes] = useState((campaign?.themes ?? []).join(', '));
  const [pillars, setPillars] = useState<Record<string, number>>(campaign?.pillars ?? {});
  const [structure, setStructure] = useState<Campaign['structure']>(campaign?.structure ?? null);
  const [truths, setTruths] = useState((campaign?.truths ?? []).join('\n'));
  // Kept as saved, never edited here: a party belongs to each campaign, not the scenario.
  const characters = campaign?.characters ?? '';
  const [gmStyle, setGmStyle] = useState(campaign?.gm_style ?? '');
  const [mode, setMode] = useState<Campaign['resolution_mode']>(campaign?.resolution_mode ?? null);
  const writes = useWrites(refreshedByRecords);
  const ids = {
    name: useId(),
    premise: useId(),
    genre: useId(),
    themes: useId(),
    truths: useId(),
    gmStyle: useId(),
  };

  const save = async () => {
    const fields = frameFields({
      name,
      premise,
      genre,
      dials,
      themes,
      pillars,
      structure,
      truths,
      characters,
      gmStyle,
      mode,
    });
    if (await writes.run(campaign === null ? create(fields) : update(campaign, fields), 'Not saved', 'Saved')) done();
  };

  return (
    <form
      className='grid gap-5'
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          required
          value={name}
          maxLength={LIMITS.name_characters}
          placeholder='The Kestrel'
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.premise}>Premise</Label>
        <Textarea
          id={ids.premise}
          rows={3}
          value={premise}
          maxLength={LIMITS.card_field_characters}
          placeholder='The promise of the campaign, in a paragraph.'
          onChange={(event) => setPremise(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.genre}>Genre</Label>
        <Input
          id={ids.genre}
          value={genre}
          maxLength={LIMITS.short_text_characters}
          placeholder='Space opera'
          className='h-11'
          onChange={(event) => setGenre(event.target.value)}
        />
      </div>
      <fieldset className='grid gap-4'>
        <legend className='text-sm font-medium'>Tone</legend>
        {CAMPAIGN.dials.map((dial) => (
          <Pick
            key={dial.id}
            label={`${dial.left} or ${dial.right}`}
            options={dialOptions(dial.left, dial.right)}
            value={dials[dial.id] ?? 0}
            onChange={(next) => setDials({ ...dials, [dial.id]: next ?? 0 })}
          />
        ))}
      </fieldset>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.themes}>Themes</Label>
        <Input
          id={ids.themes}
          value={themes}
          placeholder='loyalty, the cost of freedom'
          className='h-11'
          onChange={(event) => setThemes(event.target.value)}
        />
      </div>
      <fieldset className='grid gap-4'>
        <legend className='text-sm font-medium'>How much of each</legend>
        {CAMPAIGN.pillars.map((pillar) => (
          <Pick
            key={pillar}
            label={pillar[0]?.toUpperCase() + pillar.slice(1)}
            options={CAMPAIGN.pillar_words.map((word, value) => ({ value, label: word[0]?.toUpperCase() + word.slice(1) }))}
            value={pillars[pillar] ?? 0}
            onChange={(next) => setPillars({ ...pillars, [pillar]: next ?? 0 })}
          />
        ))}
      </fieldset>
      <Pick
        label='Structure'
        options={CAMPAIGN.structures.map((value) => ({ value, label: STRUCTURE_LABELS[value] }))}
        value={structure}
        onChange={setStructure}
      />
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.truths}>Setting truths</Label>
        <p id={`${ids.truths}-hint`} className='text-xs text-muted-foreground'>
          One per line: what everyone agrees is true before play.
        </p>
        <Textarea
          id={ids.truths}
          rows={4}
          value={truths}
          aria-describedby={`${ids.truths}-hint`}
          placeholder={'Magic is feared.\nThe empire fell last winter.'}
          onChange={(event) => setTruths(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.gmStyle}>How the GM runs it</Label>
        <p id={`${ids.gmStyle}-hint`} className='text-xs text-muted-foreground'>
          The GM’s own voice: read when it narrates and at the table, never by the characters.
        </p>
        <Textarea
          id={ids.gmStyle}
          rows={2}
          value={gmStyle}
          maxLength={LIMITS.card_field_characters}
          aria-describedby={`${ids.gmStyle}-hint`}
          placeholder='Terse and cinematic. End each scene on a question to the players.'
          onChange={(event) => setGmStyle(event.target.value)}
        />
      </div>
      <Pick
        label='Resolution'
        options={CAMPAIGN.resolution_modes.map((value) => ({ value, label: MODE_LABELS[value] }))}
        value={mode}
        onChange={setMode}
      />
      <WriteProblem problem={writes.problem} />
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' className='h-11 flex-1' disabled={name.trim() === ''}>
          Save
        </Button>
        {campaign !== null && (
          <Button asChild variant='outline' className='h-11'>
            <Link href={`/campaigns/${campaign.id}`}>Open the brief</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
