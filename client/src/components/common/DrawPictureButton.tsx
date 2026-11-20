// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Asks the model set to draw for a picture (A30: a portrait, a background), shows that it is
 * drawing, and hands the picture back to be kept; why it failed goes to the caller, worded by the
 * server ("Set a model to draw pictures first").
 */
import { Palette } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';

export function DrawPictureButton({
  label,
  draw,
  onDrawn,
  onProblem,
}: {
  label: string;
  draw: () => Promise<{ image: string }>;
  onDrawn: (image: string) => void;
  onProblem: (reason: string | null) => void;
}): ReactElement {
  const [drawing, setDrawing] = useState(false);
  const start = async () => {
    setDrawing(true);
    onProblem(null);
    try {
      onDrawn((await draw()).image);
    } catch (error) {
      onProblem(error instanceof Error ? error.message : 'The picture could not be drawn');
    } finally {
      setDrawing(false);
    }
  };
  return (
    <Button type='button' variant='outline' className='h-11' disabled={drawing} onClick={() => void start()}>
      <Palette aria-hidden /> {drawing ? 'Drawing…' : label}
    </Button>
  );
}
