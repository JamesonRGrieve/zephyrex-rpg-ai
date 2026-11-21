// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A character's expression sprites (A4): one picture per feeling (joy, anger, …). In a chat, the
 * model picks which fits each line, from these labels only.
 */
import { useHidden } from 'zephyrex/hooks/useWrites';
import { ImagePlus, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { WriteProblem } from '~/components/common/WriteProblem';
import { EXPRESSION } from '~/contract';
import { characterExpressions, idOf } from '~/features/data/records';
import { PICTURE_TYPES, pictureFromFile } from '~/features/media/picture';

export interface Sprite {
  id: string;
  label: string;
  image: string;
}

/**
 * The sprites and the way to add one (a feeling's name, then its picture) or remove one with undo.
 * `onAdd` answers the problem that kept it from being saved, or null.
 */
export function ExpressionSprites({
  name,
  sprites,
  onAdd,
  onRemove,
}: {
  name: string;
  sprites: readonly Sprite[];
  onAdd: (label: string, image: string) => Promise<string | null>;
  onRemove: (sprite: Sprite) => void;
}): ReactElement {
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const hidden = useHidden(sprites, idOf);
  const ids = { label: useId(), file: useId() };
  const shown = hidden.shown;

  const add = async (file: File | undefined) => {
    if (file === undefined) return;
    const picture = await pictureFromFile(file);
    if ('refused' in picture) {
      setProblem(picture.refused);
      return;
    }
    const failed = await onAdd(label.trim(), picture.url);
    setProblem(failed);
    if (failed === null) setLabel('');
  };

  return (
    <fieldset className='grid gap-3 rounded-lg border p-3'>
      <legend className='px-1 text-sm font-medium'>Expressions</legend>
      <p className='text-xs text-muted-foreground'>
        A picture of {name} for each feeling. In a chat, the one that fits each line is shown. Add one named “talking” and{' '}
        {name} flips to it while a line is read aloud.
      </p>
      {shown.length > 0 && (
        <ul className='flex flex-wrap gap-3' aria-label='Sprites'>
          {shown.map((sprite) => (
            <li key={sprite.id} className='grid justify-items-center gap-1'>
              <img referrerPolicy='no-referrer' src={sprite.image} alt={`${name}, ${sprite.label}`} className='size-20 rounded-md border object-cover' />
              <span className='text-xs'>{sprite.label}</span>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11'
                aria-label={`Remove the ${sprite.label} sprite`}
                onClick={() => {
                  hidden.hide([sprite.id]);
                  deferWithUndo(
                    `${sprite.label} sprite removed`,
                    () => onRemove(sprite),
                    () => hidden.show([sprite.id]),
                  );
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
        <Input
          id={ids.label}
          value={label}
          maxLength={EXPRESSION.label_characters}
          placeholder='joy'
          className='h-11 w-40'
          onChange={(event) => setLabel(event.target.value)}
        />
        <input
          id={ids.file}
          type='file'
          accept={PICTURE_TYPES.join(',')}
          aria-label='Choose a sprite picture'
          className='peer sr-only'
          disabled={label.trim() === '' || shown.length >= EXPRESSION.per_character}
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

/** The character's sprites, read and written as records. */
export function ExpressionEditor({ characterId, name }: { characterId: string; name: string }): ReactElement {
  const list = characterExpressions.useList({ character_id: characterId });
  const { create, remove } = characterExpressions.useActions();
  return (
    <ExpressionSprites
      name={name}
      sprites={list.data ?? []}
      onAdd={async (label, image) => {
        const failed = await writeProblem(create({ character_id: characterId, label, image }), 'Not saved');
        if (failed === null) notify('Sprite added');
        return failed;
      }}
      onRemove={(sprite) => {
        const row = (list.data ?? []).find((one) => one.id === sprite.id);
        if (row !== undefined) void remove(row);
      }}
    />
  );
}
