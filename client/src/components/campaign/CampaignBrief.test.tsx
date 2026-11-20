// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CampaignBrief } from './CampaignBrief';
import { KESTREL } from './fixtures';

describe('CampaignBrief', () => {
  it('shows the frame to the players, part by part', () => {
    render(<CampaignBrief campaign={KESTREL} />);
    expect(screen.getByRole('heading', { level: 1, name: 'The Kestrel' })).toBeInTheDocument();
    expect(screen.getByText('It feels grim, very fantastic.')).toBeInTheDocument();
    expect(screen.getByText('Exploration: heavy')).toBeInTheDocument();
    expect(screen.getByText('The Guild owns every port.')).toBeInTheDocument();
  });

  it('leaves out what the frame leaves empty', () => {
    render(<CampaignBrief campaign={{ ...KESTREL, dials: {}, themes: [], pillars: {}, structure: null, truths: [], characters: '' }} />);
    expect(screen.queryByRole('heading', { name: 'What is true' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tone and themes' })).not.toBeInTheDocument();
  });
});
