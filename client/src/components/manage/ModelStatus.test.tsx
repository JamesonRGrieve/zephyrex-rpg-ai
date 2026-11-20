// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelStatus } from './ModelStatus';

const MODEL = {
  id: 'e1',
  created_at: 'x',
  updated_at: null,
  name: 'Local',
  base_url: 'http://h/v1',
  model: 'tiny',
  is_default: true,
  has_api_key: false,
  custom_template_id: null,
  image_size: '',
  api: 'chat' as const,
  instruct_template: 'chatml' as const,
  roles: ['story' as const],
};

describe('ModelStatus', () => {
  it('checks a model and says how it answered, and when the model is not offered', async () => {
    const check = vi.fn(async () => ({
      ok: true,
      latency_ms: 42,
      status: 200,
      has_model: false,
      detail: '3 models offered',
    }));
    render(<ModelStatus models={[MODEL]} check={check} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check Local' }));
    expect(await screen.findByText(/3 models offered · 42 ms · tiny is not offered/)).toBeInTheDocument();
    expect(check).toHaveBeenCalledWith('e1');
  });

  it('shows a check that could not run', async () => {
    render(<ModelStatus models={[MODEL]} check={async () => Promise.reject(new Error('The check could not run (500)'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check all' }));
    expect(await screen.findByText('The check could not run (500)')).toBeInTheDocument();
  });
});
