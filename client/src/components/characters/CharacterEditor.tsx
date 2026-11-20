// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * One character: the card's form, saved with the version it was opened at (a stale save says so
 * instead of overwriting). Export as a SillyTavern V2 card, start a chat, or delete with undo. On a
 * phone the save bar stays at the bottom, above the home indicator.
 */
import { Download, MessageSquarePlus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { type Character, characters, chats } from '~/features/data/records';
import { cardToJson } from '~/features/import/stCard';
import { type CharacterDraft, CharacterForm } from './CharacterForm';

export function draftOf(character: Character): CharacterDraft {
  const { name, avatar, description, personality, scenario, first_message, alternate_greetings, example_messages, system_prompt, post_history_instructions, creator_notes, creator, character_version, tags } = character;
  return { name, avatar, description, personality, scenario, first_message, alternate_greetings, example_messages, system_prompt, post_history_instructions, creator_notes, creator, character_version, tags };
}

/** Whether the draft differs from what was opened. */
export function isChanged(draft: CharacterDraft, saved: Character): boolean {
  return JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
}

function download(name: string, json: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w.-]+/g, '_') || 'character'}.json` });
  link.click();
  URL.revokeObjectURL(url);
}

export function CharacterEditor({ id }: { id: string }): ReactElement {
  const record = characters.useOne(id);
  const { update, remove } = characters.useActions();
  const { create: createChat } = chats.useActions();
  const router = useRouter();
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record.data !== undefined && draft === null) setDraft(draftOf(record.data));
  }, [record.data, draft]);

  if (record.error !== undefined) return <LoadProblem what='this character' error={record.error} onRetry={() => record.mutate()} />;
  if (record.data === undefined || draft === null) return <SkeletonRows rows={6} />;
  const saved = record.data;
  const changed = isChanged(draft, saved);

  const save = async () => {
    setSaving(true);
    try {
      const next = await update(saved, { ...draft, name: draft.name.trim() || saved.name });
      setDraft(draftOf(next));
      notify('Saved');
    } catch (error) {
      notify('Not saved', error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const startChat = async () => {
    const chat = await createChat({ title: `Chat with ${saved.name}`, character_ids: [saved.id] });
    router.push(`/play/${chat.id}`);
  };

  const deleteCharacter = () => {
    router.push('/characters');
    deferWithUndo(`${saved.name} deleted`, () => void remove(saved), () => router.push(`/characters/${saved.id}`));
  };

  return (
    <div className='pb-24'>
      <div className='mb-6 flex flex-wrap gap-2'>
        <Button type='button' className='h-11' onClick={() => void startChat()}>
          <MessageSquarePlus aria-hidden /> Chat
        </Button>
        <Button type='button' variant='outline' className='h-11' onClick={() => download(saved.name, cardToJson({ ...draft, extensions: saved.extensions }))}>
          <Download aria-hidden /> Export card
        </Button>
        <Button type='button' variant='ghost' className='h-11 text-destructive' onClick={deleteCharacter}>
          <Trash2 aria-hidden /> Delete
        </Button>
      </div>
      <CharacterForm key={saved.id} value={draft} onChange={setDraft} onAvatarRefused={(reason) => notify('Picture not used', reason)} />
      <div className='fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-safe backdrop-blur-sm md:sticky md:mt-8 md:border md:rounded-xl'>
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
