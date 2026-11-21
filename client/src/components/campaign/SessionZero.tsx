// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Session zero (A57, AP1): the campaign frame asked one question a screen, with tap-to-pick answers
 * and free text, for one person or a table passing the device round. Nothing is saved until the
 * last screen, which shows the frame the way the players' brief will, to be changed or accepted.
 */
import { useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { CAMPAIGN, LIMITS } from '~/contract';
import { type FrameDraft, draftOf, frameFields, previewCampaign } from '~/features/campaign/frame';
import { campaigns, refreshedByRecords } from '~/features/data/records';
import { CampaignBrief } from './CampaignBrief';
import { MODE_LABELS, Pick, STRUCTURE_LABELS, dialOptions } from './CampaignForm';

type Change = (next: Partial<FrameDraft>) => void;

interface Step {
  title: string;
  question: string;
  body: (draft: FrameDraft, change: Change, id: string) => ReactNode;
  /** Whether Next is open: only the name is required. */
  ready?: (draft: FrameDraft) => boolean;
}

const capital = (word: string): string => (word[0]?.toUpperCase() ?? '') + word.slice(1);

const STEPS: readonly Step[] = [
  {
    title: 'The pitch',
    question: 'What is the game? Give it a name, and say what it promises in a few lines.',
    ready: (draft) => draft.name.trim() !== '',
    body: (draft, change, id) => (
      <>
        <div className='grid gap-1.5'>
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            required
            value={draft.name}
            maxLength={LIMITS.name_characters}
            placeholder='The Kestrel'
            className='h-11'
            onChange={(event) => change({ name: event.target.value })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={`${id}-genre`}>Genre</Label>
          <Input
            id={`${id}-genre`}
            value={draft.genre}
            maxLength={LIMITS.short_text_characters}
            placeholder='Space opera'
            className='h-11'
            onChange={(event) => change({ genre: event.target.value })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={`${id}-premise`}>Premise</Label>
          <Textarea
            id={`${id}-premise`}
            rows={3}
            value={draft.premise}
            maxLength={LIMITS.card_field_characters}
            placeholder='A crew of smugglers owes the wrong people a favour.'
            onChange={(event) => change({ premise: event.target.value })}
          />
        </div>
      </>
    ),
  },
  {
    title: 'The tone',
    question: 'How should it feel? Pick a side on each, or leave it balanced.',
    body: (draft, change) =>
      CAMPAIGN.dials.map((dial) => (
        <Pick
          key={dial.id}
          label={`${capital(dial.left)} or ${dial.right}`}
          options={dialOptions(dial.left, dial.right)}
          value={draft.dials[dial.id] ?? 0}
          onChange={(next) => change({ dials: { ...draft.dials, [dial.id]: next ?? 0 } })}
        />
      )),
  },
  {
    title: 'The themes',
    question: 'What is the story about, underneath? A few words, separated by commas.',
    body: (draft, change, id) => (
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-themes`}>Themes</Label>
        <Input
          id={`${id}-themes`}
          value={draft.themes}
          placeholder='loyalty, the cost of freedom'
          className='h-11'
          onChange={(event) => change({ themes: event.target.value })}
        />
      </div>
    ),
  },
  {
    title: 'What you will do',
    question: 'How much fighting, exploring, talking and puzzling does the table want?',
    body: (draft, change) =>
      CAMPAIGN.pillars.map((pillar) => (
        <Pick
          key={pillar}
          label={capital(pillar)}
          options={CAMPAIGN.pillar_words.map((word, value) => ({ value, label: capital(word) }))}
          value={draft.pillars[pillar] ?? 0}
          onChange={(next) => change({ pillars: { ...draft.pillars, [pillar]: next ?? 0 } })}
        />
      )),
  },
  {
    title: 'The shape',
    question: 'An open sandbox, a story with a line through it, episodes, or one night?',
    body: (draft, change) => (
      <Pick
        label='Structure'
        options={CAMPAIGN.structures.map((value) => ({ value, label: STRUCTURE_LABELS[value] }))}
        value={draft.structure}
        onChange={(structure) => change({ structure })}
      />
    ),
  },
  {
    title: 'What is true',
    question: 'What does everyone agree is true about the world before play? One per line.',
    body: (draft, change, id) => (
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-truths`}>Setting truths</Label>
        <Textarea
          id={`${id}-truths`}
          rows={5}
          value={draft.truths}
          placeholder={'Magic is feared.\nThe empire fell last winter.'}
          onChange={(event) => change({ truths: event.target.value })}
        />
      </div>
    ),
  },
  {
    title: 'The characters',
    question: 'Who are you playing, how do your characters know each other, and what does each of you want from the game?',
    body: (draft, change, id) => (
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-characters`}>The characters</Label>
        <Textarea
          id={`${id}-characters`}
          rows={5}
          value={draft.characters}
          maxLength={LIMITS.card_field_characters}
          placeholder='Ana flies the ship and owes Mira her life. Ana’s player wants chases; Mira’s wants intrigue.'
          onChange={(event) => change({ characters: event.target.value })}
        />
      </div>
    ),
  },
  {
    title: 'How it is run',
    question: 'Should the story decide what happens, the rules, or both? And how should the GM sound?',
    body: (draft, change, id) => (
      <>
        <Pick
          label='Resolution'
          options={CAMPAIGN.resolution_modes.map((value) => ({ value, label: MODE_LABELS[value] }))}
          value={draft.mode}
          onChange={(mode) => change({ mode })}
        />
        <div className='grid gap-1.5'>
          <Label htmlFor={`${id}-gm`}>How the GM runs it</Label>
          <Textarea
            id={`${id}-gm`}
            rows={2}
            value={draft.gmStyle}
            maxLength={LIMITS.card_field_characters}
            placeholder='Terse and cinematic. End each scene on a question to the players.'
            onChange={(event) => change({ gmStyle: event.target.value })}
          />
        </div>
      </>
    ),
  },
];

export function SessionZero({
  create,
  onSaved,
}: {
  create: (fields: ReturnType<typeof frameFields>) => Promise<{ id: string }>;
  onSaved: (id: string) => void;
}): ReactElement {
  const writes = useWrites(refreshedByRecords);
  const [draft, setDraft] = useState<FrameDraft>(() => draftOf(null));
  const [at, setAt] = useState(0);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewing = at === STEPS.length;
  const step = STEPS[at];
  const change: Change = (next) => setDraft((current) => ({ ...current, ...next }));

  // Each new screen announces itself: focus moves to its heading, so a screen reader reads it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [at]);

  const save = async () => {
    const saved: { id: string | null } = { id: null };
    const write = create(frameFields(draft)).then((campaign) => {
      saved.id = campaign.id;
    });
    if ((await writes.run(write, 'The campaign was not saved', 'Campaign saved')) && saved.id !== null) onSaved(saved.id);
  };

  return (
    <section aria-labelledby={`${id}-heading`} className='grid gap-6'>
      <div className='grid gap-1'>
        <p className='text-sm text-muted-foreground'>{reviewing ? 'Last step' : `Question ${at + 1} of ${STEPS.length}`}</p>
        <h2 id={`${id}-heading`} ref={heading} tabIndex={-1} className='text-xl font-semibold outline-none'>
          {reviewing ? 'The frame, as your players will read it' : step?.title}
        </h2>
        {!reviewing && <p className='text-muted-foreground'>{step?.question}</p>}
      </div>
      <form
        className='grid gap-5'
        onSubmit={(event) => {
          event.preventDefault();
          if (reviewing) void save();
          else setAt(at + 1);
        }}
      >
        {reviewing ? (
          <div className='rounded-lg border p-4'>
            <CampaignBrief campaign={previewCampaign(draft)} />
          </div>
        ) : (
          step?.body(draft, change, id)
        )}
        <WriteProblem problem={writes.problem} />
        <div className='flex flex-wrap gap-2'>
          {at > 0 && (
            <Button type='button' variant='outline' className='h-11' onClick={() => setAt(at - 1)}>
              Back
            </Button>
          )}
          <Button
            type='submit'
            // Sized to its label at the row's end, not stretched across the form (UX and UI).
            className='ms-auto h-11 px-6'
            disabled={writes.busy || (step?.ready !== undefined && !step.ready(draft))}
          >
            {reviewing ? 'Save the campaign' : at === STEPS.length - 1 ? 'See the frame' : 'Next'}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Session zero as a page of its own: saved, it opens the new campaign's brief. */
export function SessionZeroPage(): ReactElement {
  const router = useRouter();
  const { create } = campaigns.useActions();
  return <SessionZero create={create} onSaved={(saved) => router.push(`/campaigns/${saved}`)} />;
}
