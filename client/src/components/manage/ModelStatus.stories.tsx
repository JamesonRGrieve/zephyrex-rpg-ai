// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, within } from 'storybook/test';
import { ModelStatus } from './ModelStatus';

const meta: Meta<typeof ModelStatus> = {
  title: 'Manage/Model status',
  component: ModelStatus,
  args: {
    models: [
      {
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
        extra_body: {},
        api: 'chat',
        instruct_template: 'chatml',
        roles: ['story', 'gm'],
      },
      {
        id: 'e2',
        created_at: 'x',
        updated_at: null,
        name: 'Summaries',
        base_url: 'http://g/v1',
        model: 'small',
        is_default: false,
        has_api_key: false,
        custom_template_id: null,
        image_size: '',
        extra_body: {},
        api: 'chat',
        instruct_template: 'chatml',
        roles: ['summary'],
      },
    ],
    check: async (id: string) =>
      id === 'e1'
        ? { ok: true, latency_ms: 38, status: 200, has_model: true, detail: '2 models offered' }
        : { ok: false, latency_ms: 8000, status: null, has_model: null, detail: 'The server could not be reached' },
  },
};
export default meta;
type Story = StoryObj<typeof ModelStatus>;

export const CheckAll: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Check all' }));
    await expect(await canvas.findByText('The server could not be reached')).toBeInTheDocument();
  },
};
