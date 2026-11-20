// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A character's voice (A29): one of this device's voices, its speed and pitch, and a button to hear
 * it. Voices come from the browser, so the list differs by device; a voice a device lacks falls back
 * to its default.
 */
import { Volume2 } from 'lucide-react';
import { type ReactElement, useEffect, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Label } from 'zephyrex/ui/label';
import { type CharacterVoice, PITCH_RANGE, RATE_RANGE, speak, speechSupport } from '~/features/speech/voice';

const DEFAULT = '';

/** This device's voices, kept current (browsers load them late). */
function useVoices(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!speechSupport().speak) return undefined;
    const read = () => setNames(speechSynthesis.getVoices().map((voice) => voice.name));
    read();
    speechSynthesis.addEventListener('voiceschanged', read);
    return () => speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);
  return names;
}

export function VoicePicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: CharacterVoice;
  onChange: (next: CharacterVoice) => void;
}): ReactElement | null {
  const voices = useVoices();
  const ids = { voice: useId(), rate: useId(), pitch: useId() };
  const [supported] = useState(() => speechSupport().speak);
  if (!supported) return null;
  const known = value.name === null || voices.includes(value.name);
  return (
    <fieldset className='grid gap-3 rounded-lg border p-3'>
      <legend className='px-1 text-sm font-medium'>Voice</legend>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.voice}>Voice on this device</Label>
        <select
          id={ids.voice}
          value={value.name ?? DEFAULT}
          className='h-11 rounded-md border bg-background px-3 text-sm'
          onChange={(event) => onChange({ ...value, name: event.target.value === DEFAULT ? null : event.target.value })}
        >
          <option value={DEFAULT}>The device’s default</option>
          {!known && value.name !== null && <option value={value.name}>{value.name} (not on this device)</option>}
          {voices.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.rate}>Speed ({value.rate.toFixed(1)}×)</Label>
          <input
            id={ids.rate}
            type='range'
            min={RATE_RANGE[0]}
            max={RATE_RANGE[1]}
            step={0.1}
            value={value.rate}
            className='h-11 accent-primary'
            onChange={(event) => onChange({ ...value, rate: Number(event.target.value) })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={ids.pitch}>Pitch ({value.pitch.toFixed(1)})</Label>
          <input
            id={ids.pitch}
            type='range'
            min={PITCH_RANGE[0]}
            max={PITCH_RANGE[1]}
            step={0.1}
            value={value.pitch}
            className='h-11 accent-primary'
            onChange={(event) => onChange({ ...value, pitch: Number(event.target.value) })}
          />
        </div>
      </div>
      <Button
        type='button'
        variant='outline'
        className='h-11 justify-self-start'
        onClick={() => speak(`Hello, I am ${name}.`, value)}
      >
        <Volume2 aria-hidden /> Hear it
      </Button>
    </fieldset>
  );
}
