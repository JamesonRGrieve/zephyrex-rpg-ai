// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A person's voice for reading aloud (the operator, 2026-11-23: "a voice select option per character"):
 * the name of a voice on the model set to speak, kept on the wiki person (tts_voice) and copied with the
 * campaign. Shown only where the server keeps the field.
 */
import { type ReactElement, useId, useState } from 'react';
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { SPEECH } from '~/contract';

export function PersonVoice({ personId }: { personId: string }): ReactElement | null {
  const client = useClient();
  const id = useId();
  const read = useSWR(['rpg-ai', 'person-voice', personId], async () => {
    const answer: unknown = await client.get(`/v1/person/${personId}`);
    return Reflect.get(Object(answer), 'person') as Record<string, unknown> | undefined;
  });
  const person = read.data;
  const stored = person === undefined ? undefined : Reflect.get(person, 'tts_voice');
  // What the person typed; null until they type, so the saved voice shows.
  const [typed, setTyped] = useState<string | null>(null);
  const draft = typed ?? (typeof stored === 'string' ? stored : '');
  // An older server has no tts_voice on its persons: nothing to pick.
  if (person === undefined || !('tts_voice' in person)) return null;
  const save = async () => {
    try {
      await client.put(`/v1/person/${personId}`, { person: { tts_voice: draft.trim() } }, person as never);
      notify(draft.trim() === '' ? 'Back to the default voice' : 'Voice saved');
      setTyped(null);
      void read.mutate();
    } catch (error) {
      notify('Voice not saved', error instanceof Error ? error.message : undefined);
    }
  };
  return (
    <form
      className='flex items-end gap-2'
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className='grid flex-1 gap-1'>
        <label htmlFor={id} className='text-xs font-medium'>
          Voice
        </label>
        <Input
          id={id}
          className='h-11'
          placeholder='Default voice'
          maxLength={SPEECH.voice_characters}
          value={draft}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      <Button type='submit' variant='outline' className='h-11'>
        Save
      </Button>
    </form>
  );
}
