// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A character's expression sprites (A4): one picture per feeling (joy, anger, …). In a chat, the
 * model picks which fits each line, from these labels only.
 */
import { ImagePlus, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { WriteProblem } from '~/components/common/WriteProblem';
import { EXPRESSION } from '~/contract';
import { characterExpressions } from '~/features/data/records';
import { PICTURE_TYPES, pictureFromFile } from '~/features/media/picture';

export function ExpressionEditor({ characterId, name }: { characterId: string; name: string }): ReactElement {
  const list = characterExpressions.useList({ character_id: characterId });
  const { create, remove } = characterExpressions.useActions();
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const ids = { label: useId(), file: useId() };
  const sprites = (list.data ?? []).filter((sprite) => !hidden.has(sprite.id));

  const add = async (file: File | undefined) => {
    if (file === undefined) return;
    const picture = await pictureFromFile(file);
    if ('refused' in picture) {
      setProblem(picture.refused);
      return;
    }
    const failed = await writeProblem(create({ character_id: characterId, label: label.trim(), image: picture.url }), 'Not saved');
    setProblem(failed);
    if (failed === null) {
      notify('Sprite added');
      setLabel('');
    }
  };

  return (
    <fieldset className='grid gap-3 rounded-lg border p-3'>
      <legend className='px-1 text-sm font-medium'>Expressions</legend>
      <p className='text-xs text-muted-foreground'>A picture of {name} for each feeling. In a chat, the one that fits each line is shown.</p>
      {sprites.length > 0 && (
        <ul className='flex flex-wrap gap-3'>
          {sprites.map((sprite) => (
            <li key={sprite.id} className='grid justify-items-center gap-1'>
              <img src={sprite.image} alt={`${name}, ${sprite.label}`} className='size-20 rounded-md border object-cover' />
              <span className='text-xs'>{sprite.label}</span>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11'
                aria-label={`Remove the ${sprite.label} sprite`}
                onClick={() => {
                  setHidden(new Set([...hidden, sprite.id]));
                  deferWithUndo(`${sprite.label} sprite removed`, () => void remove(sprite), () => setHidden(new Set([...hidden].filter((id) => id !== sprite.id))));
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <label htmlFor={ids.label} className='sr-only'>
          Feeling
        </label>
        <Input id={ids.label} value={label} maxLength={EXPRESSION.label_characters} placeholder='joy' className='h-11 w-40' onChange={(event) => setLabel(event.target.value)} />
        <input
          id={ids.file}
          type='file'
          accept={PICTURE_TYPES.join(',')}
          aria-label='Choose a sprite picture'
          className='peer sr-only'
          disabled={label.trim() === '' || sprites.length >= EXPRESSION.per_character}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void add(file);
          }}
        />
        <label
          htmlFor={ids.file}
          className='inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring'
        >
          <ImagePlus className='size-4' aria-hidden /> Add a sprite
        </label>
      </div>
      <WriteProblem problem={problem} />
    </fieldset>
  );
}
