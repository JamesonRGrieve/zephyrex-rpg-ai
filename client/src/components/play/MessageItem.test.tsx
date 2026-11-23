// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ADA_REPLY, TABLE_TALK, USER_LINE } from './fixtures';
import { MessageItem } from './MessageItem';

describe('MessageItem', () => {
  it('pages through alternatives and branches', async () => {
    const onSwipe = vi.fn();
    const onFork = vi.fn();
    const { rerender } = render(<MessageItem message={ADA_REPLY} onSwipe={onSwipe} />);
    expect(screen.getByRole('button', { name: 'Previous reply' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next reply' }));
    expect(onSwipe).toHaveBeenCalledWith(1);
    rerender(<MessageItem message={USER_LINE} onFork={onFork} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous branch' }));
    expect(onFork).toHaveBeenCalledWith(-1);
  });

  it('reads a message aloud from the menu, where offered', async () => {
    const onSpeak = vi.fn();
    render(<MessageItem message={ADA_REPLY} onSpeak={onSpeak} />);
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(onSpeak).toHaveBeenCalledOnce();
  });

  it('shows a translation under the text, and hides it on request', async () => {
    const onHide = vi.fn();
    const { rerender } = render(<MessageItem message={ADA_REPLY} translation={{ status: 'writing' }} />);
    expect(screen.getByText('Translating…')).toBeInTheDocument();
    rerender(<MessageItem message={ADA_REPLY} translation={{ status: 'done', text: 'Bienvenue à bord.', onHide }} />);
    expect(screen.getByText('Bienvenue à bord.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide translation' }));
    expect(onHide).toHaveBeenCalledOnce();
    rerender(<MessageItem message={ADA_REPLY} translation={{ status: 'failed', reason: 'Add a model endpoint first' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Add a model endpoint first');
  });

  it('X-cards from the menu, and shows an X-carded message as out of the story with a way back', async () => {
    const onXCard = vi.fn();
    const { rerender } = render(<MessageItem message={ADA_REPLY} onXCard={onXCard} />);
    await userEvent.click(screen.getByRole('button', { name: "More for Ada Vance's message" }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'X-card' }));
    // An optional reason, then X-card.
    await userEvent.type(screen.getByLabelText(/What should the story stay away from/), 'spiders');
    await userEvent.click(screen.getByRole('button', { name: 'X-card' }));
    expect(onXCard).toHaveBeenCalledWith('spiders');
    rerender(<MessageItem message={{ ...ADA_REPLY, xCarded: true }} onXCard={onXCard} />);
    expect(screen.getByRole('article', { name: 'Ada Vance, X-carded' })).toBeInTheDocument();
    expect(screen.queryByText('wipes her hands on a rag')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Put it back' }));
    expect(onXCard).toHaveBeenCalledTimes(2);
  });

  it('folds a reply’s reasoning away under Thinking', async () => {
    render(<MessageItem message={{ ...ADA_REPLY, text: '<think>She is tired.</think>Mind the coolant.' }} />);
    expect(screen.getByText('Mind the coolant.')).toBeVisible();
    const reasoning = screen.getByText('She is tired.');
    expect(reasoning).not.toBeVisible();
    await userEvent.click(screen.getByText('Thinking'));
    expect(reasoning).toBeVisible();
  });

  it('names out of game as such and leaves out the portrait', () => {
    render(<MessageItem message={TABLE_TALK} />);
    expect(screen.getByRole('article', { name: 'Sam, out of game' })).toBeInTheDocument();
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('offers to continue a message from the menu', async () => {
    const onContinue = vi.fn();
    render(<MessageItem message={ADA_REPLY} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('edits in place from the menu', async () => {
    const onEdit = vi.fn();
    render(<MessageItem message={USER_LINE} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText('Edit message');
    await userEvent.clear(box);
    await userEvent.type(box, 'I hand her the wrench.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith('I hand her the wrench.');
  });

  it('offers to add a note the GM proposes, and says when the table keeps it already', async () => {
    const onAdd = vi.fn();
    const gm = { ...TABLE_TALK, channel: 'gm' as const, speaker: 'GM', text: 'Sure.' };
    const { rerender } = render(
      <MessageItem message={gm} proposal={{ label: 'Pacing', text: 'Skip travel.', added: false, onAdd }} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add to table notes' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    rerender(<MessageItem message={gm} proposal={{ label: 'Pacing', text: 'Skip travel.', added: true, onAdd }} />);
    expect(screen.queryByRole('button', { name: 'Add to table notes' })).not.toBeInTheDocument();
    expect(screen.getByText('In the table notes')).toBeInTheDocument();
  });

  it('moves a message up or down from the menu, where offered (A9)', async () => {
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    render(<MessageItem message={ADA_REPLY} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Branch' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Branch' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('says what a reply written now cost (AP5)', () => {
    render(<MessageItem message={ADA_REPLY} cost={{ tokens: 21, seconds: 3.4 }} />);
    expect(screen.getByText('About 21 tokens · 3.4 s')).toBeInTheDocument();
  });

  it('asks another model for an alternative from the menu, to compare (AP4)', async () => {
    const run = vi.fn();
    render(<MessageItem message={ADA_REPLY} onRegenerateWith={{ models: [{ id: 'e2', name: 'Big' }], run }} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Again with/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Big' }));
    expect(run).toHaveBeenCalledWith('e2');
  });
});
