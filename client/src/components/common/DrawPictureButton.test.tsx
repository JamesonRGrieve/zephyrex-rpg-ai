// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DrawPictureButton } from './DrawPictureButton';

describe('DrawPictureButton', () => {
  it('hands back the drawn picture', async () => {
    const onDrawn = vi.fn();
    render(
      <DrawPictureButton
        label='Draw a portrait'
        draw={async () => ({ image: 'data:image/png;base64,AA' })}
        onDrawn={onDrawn}
        onProblem={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Draw a portrait' }));
    expect(onDrawn).toHaveBeenCalledWith('data:image/png;base64,AA');
  });

  it('says why it could not draw, in the server’s words', async () => {
    const onProblem = vi.fn();
    render(
      <DrawPictureButton
        label='Draw a background'
        draw={async () => {
          throw new Error('Set a model to draw pictures first');
        }}
        onDrawn={vi.fn()}
        onProblem={onProblem}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Draw a background' }));
    expect(onProblem).toHaveBeenLastCalledWith('Set a model to draw pictures first');
    expect(screen.getByRole('button', { name: 'Draw a background' })).toBeEnabled();
  });
});
