// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A scenario (A59, A61): a playable situation written as moving parts, not a script. The words
 * (premise, hook, stakes, situation); the cast, each with what they want and hide; the clocks; the
 * secrets, each with several clues; and, one per line, the places, beats and endings. Saving keeps
 * the state in play as it is.
 */
import { Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Textarea } from 'zephyrex/ui/textarea';
import { WriteProblem } from '~/components/common/WriteProblem';
import { LIMITS, SCENARIO } from '~/contract';
import { type Scenario, scenarios } from '~/features/data/records';

type Cast = Scenario['cast'][number];
type Clock = Scenario['clocks'][number];
type Secret = Scenario['secrets'][number];

const lines = (text: string, limit: number) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);

function Words({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        maxLength={LIMITS.card_field_characters}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Lines({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
        {hint}
      </p>
      <Textarea
        id={id}
        rows={3}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function ScenarioForm({
  scenario,
  campaigns,
  done,
}: {
  scenario: Scenario | null;
  campaigns: readonly { id: string; name: string }[];
  done: () => void;
}): ReactElement {
  const { create, update } = scenarios.useActions();
  const [name, setName] = useState(scenario?.name ?? '');
  const [campaignId, setCampaignId] = useState<string | null>(scenario?.campaign_id ?? null);
  const [premise, setPremise] = useState(scenario?.premise ?? '');
  const [hook, setHook] = useState(scenario?.hook ?? '');
  const [stakes, setStakes] = useState(scenario?.stakes ?? '');
  const [situation, setSituation] = useState(scenario?.situation ?? '');
  const [cast, setCast] = useState<Cast[]>(scenario?.cast ?? []);
  const [clocks, setClocks] = useState<Clock[]>(scenario?.clocks ?? []);
  const [secrets, setSecrets] = useState<{ truth: string; clues: string; found: Secret['clues'] }[]>(
    (scenario?.secrets ?? []).map((secret) => ({
      truth: secret.truth,
      clues: secret.clues.map((clue) => clue.text).join('\n'),
      found: secret.clues,
    })),
  );
  const [places, setPlaces] = useState((scenario?.places ?? []).join('\n'));
  const [beats, setBeats] = useState((scenario?.beats ?? []).map((beat) => beat.text).join('\n'));
  const [outcomes, setOutcomes] = useState((scenario?.outcomes ?? []).join('\n'));
  const [problem, setProblem] = useState<string | null>(null);
  const ids = { name: useId(), campaign: useId() };
  const limits = SCENARIO.limits;
  const [fewest, most] = SCENARIO.clock_segment_range as [number, number];

  const save = async () => {
    const doneBeats = new Set((scenario?.beats ?? []).filter((beat) => beat.done).map((beat) => beat.text));
    const fields = {
      name: name.trim(),
      campaign_id: campaignId,
      premise,
      hook,
      stakes,
      situation,
      cast: cast.filter((person) => person.name.trim() !== '').slice(0, limits.cast),
      places: lines(places, limits.places),
      clocks: clocks
        .filter((clock) => clock.name.trim() !== '')
        .map((clock) => ({ ...clock, filled: Math.min(clock.filled, clock.segments) }))
        .slice(0, limits.clocks),
      // A clue keeps whether it was found while its words stay the same.
      secrets: secrets
        .filter((secret) => secret.truth.trim() !== '')
        .map((secret) => ({
          truth: secret.truth.trim(),
          clues: lines(secret.clues, limits.clues_per_secret).map((text) => ({
            text,
            found: secret.found.some((clue) => clue.text === text && clue.found),
          })),
        }))
        .slice(0, limits.secrets),
      beats: lines(beats, limits.beats).map((text) => ({ text, done: doneBeats.has(text) })),
      outcomes: lines(outcomes, limits.outcomes),
    };
    const failed = await writeProblem(scenario === null ? create(fields) : update(scenario, fields), 'Not saved');
    setProblem(failed);
    if (failed === null) {
      notify('Saved');
      done();
    }
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
          placeholder='Sabotage'
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.campaign}>Campaign</Label>
        <select
          id={ids.campaign}
          value={campaignId ?? ''}
          className='h-11 rounded-md border bg-background px-3 text-sm'
          onChange={(event) => setCampaignId(event.target.value === '' ? null : event.target.value)}
        >
          <option value=''>None</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </div>
      <Words label='Premise' value={premise} onChange={setPremise} />
      <Words label='Hook' value={hook} onChange={setHook} />
      <Words label='Stakes' value={stakes} onChange={setStakes} />
      <Words label='Situation at the start' value={situation} onChange={setSituation} />
      <fieldset className='grid gap-3'>
        <legend className='text-sm font-medium'>Cast</legend>
        {cast.map((person, index) => (
          // Rows have no identity beyond their place while editing.
          <div key={index} className='grid gap-2 rounded-lg border p-3'>
            <div className='flex gap-2'>
              <Input
                aria-label={`Cast ${index + 1}: name`}
                value={person.name}
                placeholder='Name'
                className='h-11'
                onChange={(event) =>
                  setCast(cast.map((one, at) => (at === index ? { ...one, name: event.target.value } : one)))
                }
              />
              <Input
                aria-label={`Cast ${index + 1}: disposition`}
                value={person.disposition}
                placeholder='Disposition'
                className='h-11'
                onChange={(event) =>
                  setCast(cast.map((one, at) => (at === index ? { ...one, disposition: event.target.value } : one)))
                }
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11 shrink-0'
                aria-label={`Remove cast ${index + 1}`}
                onClick={() => setCast(cast.filter((_one, at) => at !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <Input
              aria-label={`Cast ${index + 1}: wants`}
              value={person.agenda}
              placeholder='What they want, and will do unprompted'
              className='h-11'
              onChange={(event) =>
                setCast(cast.map((one, at) => (at === index ? { ...one, agenda: event.target.value } : one)))
              }
            />
            <Input
              aria-label={`Cast ${index + 1}: secret`}
              value={person.secret}
              placeholder='Their secret'
              className='h-11'
              onChange={(event) =>
                setCast(cast.map((one, at) => (at === index ? { ...one, secret: event.target.value } : one)))
              }
            />
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          className='h-11 justify-self-start'
          disabled={cast.length >= limits.cast}
          onClick={() => setCast([...cast, { name: '', agenda: '', secret: '', disposition: '' }])}
        >
          <Plus aria-hidden /> Add someone
        </Button>
      </fieldset>
      <fieldset className='grid gap-3'>
        <legend className='text-sm font-medium'>Clocks</legend>
        {clocks.map((clock, index) => (
          // Rows have no identity beyond their place while editing.
          <div key={index} className='grid gap-2 rounded-lg border p-3'>
            <div className='flex gap-2'>
              <Input
                aria-label={`Clock ${index + 1}: name`}
                value={clock.name}
                placeholder='The cult completes the ritual'
                className='h-11'
                onChange={(event) =>
                  setClocks(clocks.map((one, at) => (at === index ? { ...one, name: event.target.value } : one)))
                }
              />
              <Input
                aria-label={`Clock ${index + 1}: segments`}
                type='number'
                inputMode='numeric'
                min={fewest}
                max={most}
                value={clock.segments}
                className='h-11 w-20'
                onChange={(event) =>
                  setClocks(
                    clocks.map((one, at) =>
                      at === index
                        ? {
                            ...one,
                            segments: Math.min(most, Math.max(fewest, Number.parseInt(event.target.value, 10) || fewest)),
                          }
                        : one,
                    ),
                  )
                }
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11 shrink-0'
                aria-label={`Remove clock ${index + 1}`}
                onClick={() => setClocks(clocks.filter((_one, at) => at !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <Input
              aria-label={`Clock ${index + 1}: advances when`}
              value={clock.advances}
              placeholder='Advances when…'
              className='h-11'
              onChange={(event) =>
                setClocks(clocks.map((one, at) => (at === index ? { ...one, advances: event.target.value } : one)))
              }
            />
            <Input
              aria-label={`Clock ${index + 1}: when full`}
              value={clock.when_full}
              placeholder='When it fills…'
              className='h-11'
              onChange={(event) =>
                setClocks(clocks.map((one, at) => (at === index ? { ...one, when_full: event.target.value } : one)))
              }
            />
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          className='h-11 justify-self-start'
          disabled={clocks.length >= limits.clocks}
          onClick={() => setClocks([...clocks, { name: '', segments: 4, filled: 0, advances: '', when_full: '' }])}
        >
          <Plus aria-hidden /> Add a clock
        </Button>
      </fieldset>
      <fieldset className='grid gap-3'>
        <legend className='text-sm font-medium'>Secrets and clues</legend>
        {secrets.map((secret, index) => (
          // Rows have no identity beyond their place while editing.
          <div key={index} className='grid gap-2 rounded-lg border p-3'>
            <div className='flex gap-2'>
              <Input
                aria-label={`Secret ${index + 1}: the truth`}
                value={secret.truth}
                placeholder='What is really true'
                className='h-11'
                onChange={(event) =>
                  setSecrets(secrets.map((one, at) => (at === index ? { ...one, truth: event.target.value } : one)))
                }
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11 shrink-0'
                aria-label={`Remove secret ${index + 1}`}
                onClick={() => setSecrets(secrets.filter((_one, at) => at !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <Textarea
              aria-label={`Secret ${index + 1}: clues, one per line`}
              rows={3}
              value={secret.clues}
              placeholder={'One clue per line, each found somewhere else'}
              onChange={(event) =>
                setSecrets(secrets.map((one, at) => (at === index ? { ...one, clues: event.target.value } : one)))
              }
            />
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          className='h-11 justify-self-start'
          disabled={secrets.length >= limits.secrets}
          onClick={() => setSecrets([...secrets, { truth: '', clues: '', found: [] }])}
        >
          <Plus aria-hidden /> Add a secret
        </Button>
      </fieldset>
      <Lines label='Places' hint='One per line.' value={places} onChange={setPlaces} />
      <Lines
        label='Beats'
        hint='Moments that may happen, one per line. Guidance, never rails.'
        value={beats}
        onChange={setBeats}
      />
      <Lines label='Endings' hint='How it can end, one per line.' value={outcomes} onChange={setOutcomes} />
      <WriteProblem problem={problem} />
      <Button type='submit' className='h-11' disabled={name.trim() === ''}>
        Save
      </Button>
    </form>
  );
}
