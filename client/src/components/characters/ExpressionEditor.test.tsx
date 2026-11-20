// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExpressionSprites } from './ExpressionEditor';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('ExpressionSprites', () => {
  it('adds a sprite under the feeling named, then clears the name', async () => {
    const onAdd = vi.fn(async () => null);
    render(<ExpressionSprites name='Ada' sprites={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Feeling'), ' joy ');
    await userEvent.upload(
      screen.getByLabelText('Choose a sprite picture'),
      new File([PNG], 'joy.png', { type: 'image/png' }),
    );
    expect(onAdd).toHaveBeenCalledWith('joy', expect.stringMatching(/^data:image\/png;base64,/));
    expect(screen.getByLabelText('Feeling')).toHaveValue('');
  });

  it('says why a sprite was not saved, and keeps the name', async () => {
    render(<ExpressionSprites name='Ada' sprites={[]} onAdd={async () => 'joy is already a sprite'} onRemove={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Feeling'), 'joy');
    await userEvent.upload(
      screen.getByLabelText('Choose a sprite picture'),
      new File([PNG], 'joy.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('joy is already a sprite')).toBeInTheDocument();
    expect(screen.getByLabelText('Feeling')).toHaveValue('joy');
  });

  it('hides a removed sprite at once, before the undo window closes', async () => {
    render(
      <ExpressionSprites
        name='Ada'
        sprites={[{ id: 's1', label: 'joy', image: 'data:image/png;base64,AAAA' }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove the joy sprite' }));
    expect(screen.queryByRole('img', { name: 'Ada, joy' })).not.toBeInTheDocument();
  });
});
