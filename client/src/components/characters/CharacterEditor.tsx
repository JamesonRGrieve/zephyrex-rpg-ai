// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * One character: the card's form, saved with the version it was opened at (a stale save says so
 * instead of overwriting). Export as a SillyTavern V2 card (a PNG card when it has a picture, its
 * lorebook inside), start a chat, or delete with undo. On a
 * phone the save bar stays at the bottom, above the home indicator.
 */
import { Download, MessageSquarePlus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useId, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { useClient, writeProblem } from 'zephyrex';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { type Character, characters, chats, lorebookEntrySchema, lorebooks } from '~/features/data/records';
import type { EntryFields } from '~/features/import/stLorebook';
import { exportCard } from '~/features/import/exportCard';
import { cardWithBook } from '~/features/import/characterCard';
import { WriteProblem } from '../common/WriteProblem';
import { type CharacterVoice, voiceOf, withVoice } from '~/features/speech/voice';
import { ExpressionEditor } from './ExpressionEditor';
import { VoicePicker } from './VoicePicker';
import { type CharacterDraft, CharacterForm } from './CharacterForm';

export function draftOf(character: Character): CharacterDraft {
  const {
    name,
    avatar,
    description,
    personality,
    scenario,
    first_message,
    alternate_greetings,
    example_messages,
    system_prompt,
    post_history_instructions,
    creator_notes,
    creator,
    character_version,
    tags,
  } = character;
  return {
    name,
    avatar,
    description,
    personality,
    scenario,
    first_message,
    alternate_greetings,
    example_messages,
    system_prompt,
    post_history_instructions,
    creator_notes,
    creator,
    character_version,
    tags,
  };
}

/** A lorebook's entries, read as the signed-in person sees them. */
export function entriesOfBook(client: ReturnType<typeof useClient>, lorebookId: string): Promise<EntryFields[]> {
  const path = `/v1/lorebook_entry?${new URLSearchParams({ lorebook_id: lorebookId }).toString()}`;
  return client.list(path, 'lorebook_entries', lorebookEntrySchema);
}

/** Whether the draft differs from what was opened. */
export function isChanged(draft: CharacterDraft, saved: Character): boolean {
  return JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
}

export function CharacterEditor({ id }: { id: string }): ReactElement {
  const record = characters.useOne(id);
  const { update, remove } = characters.useActions();
  const { create: createChat } = chats.useActions();
  const router = useRouter();
  // The person's edits; until there are any, the draft is the record as saved.
  const [edited, setDraft] = useState<CharacterDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const books = lorebooks.useList();
  const bookPicker = useId();
  const [voice, setVoice] = useState<CharacterVoice | null>(null);
  const client = useClient();

  if (record.error !== undefined)
    return <LoadProblem what='this character' error={record.error} onRetry={() => record.mutate()} />;
  if (record.data === undefined) return <SkeletonRows rows={6} />;
  const saved = record.data;
  const draft = edited ?? draftOf(saved);
  const changed = isChanged(draft, saved);

  const save = async () => {
    setSaving(true);
    const writing = update(saved, { ...draft, name: draft.name.trim() || saved.name });
    const failed = await writeProblem(writing, 'Not saved');
    setProblem(failed);
    if (failed === null) {
      setDraft(draftOf(await writing));
      notify('Saved');
    }
    setSaving(false);
  };

  /** The card, with the character's lorebook as its character_book, as a PNG card or JSON. */
  const exportThis = async () => {
    const book = (books.data ?? []).find((one) => one.id === saved.lorebook_id);
    const card = await cardWithBook({ ...draft, extensions: saved.extensions }, book, () =>
      entriesOfBook(client, book?.id ?? ''),
    );
    await exportCard(saved.name, draft.avatar, card);
  };

  const startChat = async () => {
    const chat = await createChat({ title: `Chat with ${saved.name}`, character_ids: [saved.id] });
    router.push(`/play/${chat.id}`);
  };

  const deleteCharacter = () => {
    router.push('/characters');
    deferWithUndo(
      `${saved.name} deleted`,
      () => void remove(saved),
      () => router.push(`/characters/${saved.id}`),
    );
  };

  return (
    <div className='pb-24'>
      <div className='mb-6 flex flex-wrap gap-2'>
        <Button type='button' className='h-11' onClick={() => void startChat()}>
          <MessageSquarePlus aria-hidden /> Chat
        </Button>
        <Button type='button' variant='outline' className='h-11' onClick={() => void exportThis()}>
          <Download aria-hidden /> Export card
        </Button>
        <Button type='button' variant='ghost' className='h-11 text-destructive' onClick={deleteCharacter}>
          <Trash2 aria-hidden /> Delete
        </Button>
      </div>
      <div className='mb-6 grid gap-1.5'>
        <label htmlFor={bookPicker} className='text-sm font-medium'>
          Lorebook
        </label>
        <p id={`${bookPicker}-hint`} className='text-xs text-muted-foreground'>
          The character’s own World Info, read whenever they speak.
        </p>
        <select
          id={bookPicker}
          aria-describedby={`${bookPicker}-hint`}
          value={saved.lorebook_id ?? ''}
          className='h-11 rounded-md border bg-background px-3 text-sm'
          onChange={(event) =>
            void update(saved, { lorebook_id: event.target.value === '' ? null : event.target.value }).then(() =>
              notify('Saved'),
            )
          }
        >
          <option value=''>None</option>
          {(books.data ?? []).map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>
      </div>
      <div className='mb-6 grid gap-2'>
        <VoicePicker name={saved.name} value={voice ?? voiceOf(saved.extensions)} onChange={setVoice} />
        {voice !== null && (
          <Button
            type='button'
            variant='outline'
            className='h-11 justify-self-start'
            onClick={() =>
              void update(saved, { extensions: withVoice(saved.extensions, voice) }).then(() => {
                setVoice(null);
                notify('Voice saved');
              })
            }
          >
            Save voice
          </Button>
        )}
      </div>
      <div className='mb-6'>
        <ExpressionEditor characterId={saved.id} name={saved.name} />
      </div>
      <CharacterForm
        key={saved.id}
        value={draft}
        onChange={setDraft}
        onAvatarRefused={(reason) => notify('Picture not used', reason)}
      />
      <div className='fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-safe backdrop-blur-sm md:sticky md:mt-8 md:border md:rounded-xl'>
        <div className='mx-auto max-w-3xl px-4 pt-3'>
          <WriteProblem problem={problem} />
        </div>
        <div className='mx-auto flex max-w-3xl items-center justify-end gap-3 px-4 pt-3 md:pb-3'>
          <span className='text-sm text-muted-foreground' role='status'>
            {changed ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <Button type='button' className='h-11' disabled={!changed || saving} onClick={() => void save()}>
            <Save aria-hidden /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
