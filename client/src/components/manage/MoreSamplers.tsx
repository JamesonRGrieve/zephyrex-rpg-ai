// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * SillyTavern's further samplers on a preset (audit gap 2), folded away: each blank until set, which
 * keeps it off. Only the ones set are kept, and each reaches only the servers that take it
 * (features/prompt/samplers.ts).
 */
import { type ReactElement, useId } from 'react';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { SAMPLERS, type SamplerParam } from '~/contract';
import type { SamplerValue } from '~/features/prompt/samplers';

const GROUPS: Record<string, string> = {
  truncation: 'Truncation',
  penalties: 'Penalties',
  dry_xtc: 'DRY and XTC',
  mirostat: 'Mirostat',
  dynamic_temperature: 'Dynamic temperature',
  other: 'Other',
};

const LABELS: Record<string, string> = {
  min_p: 'Min P',
  typical_p: 'Typical P',
  top_a: 'Top A',
  tfs: 'Tail-free sampling',
  top_n_sigma: 'Top n-sigma',
  epsilon_cutoff: 'Epsilon cutoff',
  eta_cutoff: 'Eta cutoff',
  presence_penalty: 'Presence penalty',
  frequency_penalty: 'Frequency penalty',
  repetition_penalty_range: 'Repetition penalty range (tokens)',
  repetition_penalty_slope: 'Repetition penalty slope',
  dry_multiplier: 'DRY multiplier',
  dry_base: 'DRY base',
  dry_allowed_length: 'DRY allowed length',
  dry_penalty_last_n: 'DRY range (tokens)',
  dry_sequence_breakers: 'DRY sequence breakers',
  xtc_probability: 'XTC probability',
  xtc_threshold: 'XTC threshold',
  mirostat_mode: 'Mirostat mode (1 or 2)',
  mirostat_tau: 'Mirostat tau',
  mirostat_eta: 'Mirostat eta',
  dynatemp_range: 'Range around the temperature',
  dynatemp_exponent: 'Exponent',
  smoothing_factor: 'Smoothing factor',
  smoothing_curve: 'Smoothing curve',
  seed: 'Seed',
  banned_strings: 'Banned strings',
  sampler_order: 'Sampler order',
};

const where = (param: SamplerParam): string =>
  param.apis.includes('chat') ? 'Every server' : param.apis.includes('horde') ? 'Text servers and AI Horde' : 'Text servers';

function Field({
  param,
  value,
  onChange,
}: {
  param: SamplerParam;
  value: SamplerValue | undefined;
  onChange: (next: SamplerValue | undefined) => void;
}): ReactElement {
  const id = useId();
  const label = LABELS[param.name] ?? param.name;
  const hint = `${where(param)}${param.requires === undefined ? '' : `, with ${LABELS[param.requires] ?? param.requires} set`}.`;
  if (param.kind === 'strings') {
    return (
      <div className='grid gap-1.5'>
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
          One per line. {hint}
        </p>
        <textarea
          id={id}
          rows={2}
          aria-describedby={`${id}-hint`}
          value={Array.isArray(value) ? value.join('\n') : ''}
          className='rounded-md border bg-background p-2 text-sm'
          onChange={(event) => {
            const lines = event.target.value.split('\n').filter((line) => line.trim() !== '');
            onChange(lines.length === 0 ? undefined : lines.slice(0, param.range[1]));
          }}
        />
      </div>
    );
  }
  const [low, high] = param.range;
  return (
    <div className='grid gap-1.5'>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type='number'
          inputMode='decimal'
          min={low}
          max={high}
          step={param.kind === 'integer' ? 1 : 0.01}
          placeholder='Off'
          aria-describedby={`${id}-hint`}
          value={typeof value === 'number' ? value : ''}
          className='h-10 w-32 text-right'
          onChange={(event) => {
            if (event.target.value.trim() === '') return onChange(undefined);
            const number = Number(event.target.value);
            if (!Number.isFinite(number)) return;
            const kept = Math.min(high, Math.max(low, param.kind === 'integer' ? Math.round(number) : number));
            onChange(kept);
          }}
        />
      </div>
      <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
        {hint}
      </p>
    </div>
  );
}

export function MoreSamplers({
  value,
  onChange,
}: {
  value: Readonly<Record<string, SamplerValue>>;
  onChange: (next: Record<string, SamplerValue>) => void;
}): ReactElement {
  const set = (name: string, next: SamplerValue | undefined) => {
    const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== name));
    onChange(next === undefined ? rest : { ...rest, [name]: next });
  };
  const count = Object.keys(value).length;
  return (
    <details className='grid gap-3 rounded-lg border p-3'>
      <summary className='min-h-11 cursor-pointer content-center text-sm font-medium'>
        More samplers{count === 0 ? '' : ` (${count} set)`}
      </summary>
      <p className='mt-2 text-xs text-muted-foreground'>
        Blank is off. Each is sent only to servers that take it, so a chat API never sees one it would refuse.
      </p>
      <div className='mt-3 grid gap-5'>
        {SAMPLERS.groups.map((group) => (
          <fieldset key={group} className='grid min-w-0 gap-4'>
            <legend className='text-sm font-semibold'>{GROUPS[group] ?? group}</legend>
            {SAMPLERS.params
              .filter((param) => param.group === group)
              .map((param) => (
                <Field key={param.name} param={param} value={value[param.name]} onChange={(next) => set(param.name, next)} />
              ))}
          </fieldset>
        ))}
      </div>
    </details>
  );
}
