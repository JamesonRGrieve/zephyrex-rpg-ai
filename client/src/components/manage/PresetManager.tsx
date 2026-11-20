// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** Sampler presets: each setting within the contract's range, with the defaults one tap away. */
import { type ReactElement, useId, useState } from 'react';
import { useWrites } from 'zephyrex/hooks/useWrites';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Slider } from 'zephyrex/ui/slider';
import { PromptLayoutEditor } from '~/components/prompt/PromptLayoutEditor';
import type { PromptSection } from '~/features/prompt/assemble';
import { WriteProblem } from '~/components/common/WriteProblem';
import { LIMITS, PRESET_DEFAULTS, SAMPLER_RANGES, type SamplerSetting, SAMPLER_EXTRAS } from '~/contract';
import { type Preset, presets, refreshedByRecords } from '~/features/data/records';
import { ManagedList } from './ManagedList';

type Samplers = Record<SamplerSetting, number>;

const SETTINGS: { key: SamplerSetting; label: string; step: number }[] = [
  { key: 'temperature', label: 'Temperature', step: 0.05 },
  { key: 'top_p', label: 'Top P', step: 0.01 },
  { key: 'top_k', label: 'Top K', step: 1 },
  { key: 'repetition_penalty', label: 'Repetition penalty', step: 0.01 },
  { key: 'max_tokens', label: 'Reply length (tokens)', step: 16 },
  { key: 'context_tokens', label: 'Context window (tokens)', step: 512 },
];

/** Stop strings as typed: one per line, without blanks. */
export function parseStops(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, LIMITS.preset_stop_strings);
}

function SamplerField({
  setting,
  value,
  onChange,
}: {
  setting: (typeof SETTINGS)[number];
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  const id = useId();
  const [low, high] = SAMPLER_RANGES[setting.key];
  return (
    <div className='grid gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor={id}>{setting.label}</Label>
        <Input
          id={id}
          type='number'
          inputMode='decimal'
          min={low}
          max={high}
          step={setting.step}
          value={value}
          className='h-10 w-28 text-right'
          onChange={(event) => onChange(Math.min(high, Math.max(low, Number(event.target.value))))}
        />
      </div>
      <Slider
        min={low}
        max={high}
        step={setting.step}
        value={[value]}
        aria-label={setting.label}
        onValueChange={([next]) => next !== undefined && onChange(next)}
      />
    </div>
  );
}

/** Only the sampler settings of a preset (or of the defaults). */
/** Logit bias typed one per line as `token id: bias` (A47): unreadable lines are left out, biases kept in range. */
export function parseLogitBias(text: string): Record<string, number> {
  const [low, high] = SAMPLER_EXTRAS.logit_bias_range as [number, number];
  const entries = text.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(line);
    return match === null ? [] : [[match[1] as string, Math.min(high, Math.max(low, Number(match[2])))] as const];
  });
  return Object.fromEntries(entries.slice(0, SAMPLER_EXTRAS.logit_bias_entries));
}

export function samplersOf(source: Samplers): Samplers {
  return Object.fromEntries(SETTINGS.map(({ key }) => [key, source[key]])) as Samplers;
}

function PresetForm({ preset, done }: { preset: Preset | null; done: () => void }): ReactElement {
  const { create, update } = presets.useActions();
  const [name, setName] = useState(preset?.name ?? '');
  const [values, setValues] = useState<Samplers>(() => samplersOf(preset ?? PRESET_DEFAULTS));
  const [stops, setStops] = useState((preset?.stop ?? []).join('\n'));
  const [layout, setLayout] = useState<PromptSection[]>(preset?.prompt_layout ?? []);
  const [bias, setBias] = useState(
    Object.entries(preset?.logit_bias ?? {})
      .map(([token, value]) => `${token}: ${value}`)
      .join('\n'),
  );
  const [negative, setNegative] = useState(preset?.negative_prompt ?? '');
  const [guidance, setGuidance] = useState(preset?.guidance_scale?.toString() ?? '');
  const writes = useWrites(refreshedByRecords);
  const ids = { name: useId(), stops: useId(), bias: useId(), negative: useId(), guidance: useId() };

  const save = async () => {
    const [low, high] = SAMPLER_EXTRAS.guidance_scale_range as [number, number];
    const scale = Number.parseFloat(guidance);
    const fields = {
      name: name.trim(),
      ...values,
      stop: parseStops(stops),
      prompt_layout: layout,
      logit_bias: parseLogitBias(bias),
      negative_prompt: negative,
      guidance_scale: Number.isNaN(scale) ? null : Math.min(high, Math.max(low, scale)),
    };
    if (await writes.run(preset === null ? create(fields) : update(preset, fields), 'Not saved', 'Saved')) done();
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
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {SETTINGS.map((setting) => (
        <SamplerField
          key={setting.key}
          setting={setting}
          value={values[setting.key]}
          onChange={(next) => setValues({ ...values, [setting.key]: next })}
        />
      ))}
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.stops}>Stop strings</Label>
        <p id={`${ids.stops}-hint`} className='text-xs text-muted-foreground'>
          One per line. The reply ends when the model writes one.
        </p>
        <textarea
          id={ids.stops}
          rows={3}
          value={stops}
          aria-describedby={`${ids.stops}-hint`}
          className='rounded-md border bg-background p-2 text-sm'
          onChange={(event) => setStops(event.target.value)}
        />
      </div>
      <PromptLayoutEditor value={layout} onChange={setLayout} />
      <details className='grid gap-3 rounded-lg border p-3'>
        <summary className='min-h-11 cursor-pointer content-center text-sm font-medium'>
          Advanced: logit bias and guidance
        </summary>
        <div className='mt-3 grid gap-4'>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.bias}>Logit bias</Label>
            <p id={`${ids.bias}-hint`} className='text-xs text-muted-foreground'>
              One per line as token id: bias, from -100 (never) to 100 (always). Only servers that take it use it.
            </p>
            <textarea
              id={ids.bias}
              rows={3}
              value={bias}
              aria-describedby={`${ids.bias}-hint`}
              placeholder='50256: -100'
              className='rounded-md border bg-background p-2 font-mono text-sm'
              onChange={(event) => setBias(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.negative}>Negative prompt</Label>
            <p id={`${ids.negative}-hint`} className='text-xs text-muted-foreground'>
              What guidance steers away from, on servers with classifier-free guidance.
            </p>
            <textarea
              id={ids.negative}
              rows={2}
              value={negative}
              aria-describedby={`${ids.negative}-hint`}
              className='rounded-md border bg-background p-2 text-sm'
              onChange={(event) => setNegative(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.guidance}>Guidance scale</Label>
            <Input
              id={ids.guidance}
              type='number'
              inputMode='decimal'
              step={0.1}
              min={1}
              max={5}
              placeholder='Off'
              value={guidance}
              className='h-11 w-32'
              onChange={(event) => setGuidance(event.target.value)}
            />
          </div>
        </div>
      </details>
      <WriteProblem problem={writes.problem} />
      <div className='flex gap-2'>
        <Button type='submit' className='h-11 flex-1' disabled={name.trim() === ''}>
          Save
        </Button>
        <Button type='button' variant='outline' className='h-11' onClick={() => setValues(samplersOf(PRESET_DEFAULTS))}>
          Defaults
        </Button>
      </div>
    </form>
  );
}

export function PresetManager(): ReactElement {
  const list = presets.useList();
  const { remove } = presets.useActions();
  return (
    <ManagedList
      what='preset'
      rows={list.data}
      error={list.error}
      onRetry={() => list.mutate()}
      summary={(row) => `Temperature ${row.temperature} · ${row.max_tokens} tokens · window ${row.context_tokens}`}
      newLabel='New preset'
      emptyText='No presets yet. Chats use the default settings until you add one.'
      editor={(row, done) => <PresetForm preset={row} done={done} />}
      onDelete={(row) => void remove(row)}
    />
  );
}
