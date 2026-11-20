// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Starting a chat: pick one character, or several for a group, and go. The chat opens on the first
 * character's greeting, with the alternate greetings as its swipes, as SillyTavern does.
 */
import { useRouter } from 'next/navigation';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { cn } from '~/lib/utils';
import { LIMITS } from '~/contract';
import { greetingSwipes } from '~/features/chat/turns';
import { type Character, characters, chats, messages } from '~/features/data/records';
import { initials } from '../characters/CharacterTile';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';

/** A chat's title from its cast. */
export function chatTitle(cast: readonly Pick<Character, 'name'>[]): string {
  const names = cast.map((character) => character.name);
  if (names.length <= 1) return `Chat with ${names[0] ?? 'a character'}`;
  return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function NewChat({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): ReactElement {
  const list = characters.useList();
  const { create } = chats.useActions();
  const { create: createMessage } = messages.useActions();
  const router = useRouter();
  const mobile = useIsMobile();
  const [picked, setPicked] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id].slice(0, LIMITS.characters_per_chat));

  const start = async () => {
    const cast = picked.flatMap((id) => (list.data ?? []).filter((character) => character.id === id));
    const first = cast[0];
    if (first === undefined) return;
    setStarting(true);
    try {
      const chat = await create({ title: chatTitle(cast), character_ids: picked, mode: cast.length > 1 ? 'group' : 'character' });
      const greetings = greetingSwipes(first.first_message, first.alternate_greetings);
      if (greetings.length > 0) {
        await createMessage({ chat_id: chat.id, parent_id: null, role: 'character', speaker_character_id: first.id, swipes: greetings });
      }
      onOpenChange(false);
      setPicked([]);
      router.push(`/play/${chat.id}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={mobile ? 'bottom' : 'right'} className='flex max-h-[90svh] flex-col pb-safe'>
        <SheetHeader>
          <SheetTitle>New chat</SheetTitle>
          <SheetDescription>Pick one character, or several for a group.</SheetDescription>
        </SheetHeader>
        <ul className='grid flex-1 gap-2 overflow-y-auto p-4' aria-label='Characters'>
          {(list.data ?? []).map((character) => {
            const order = picked.indexOf(character.id);
            return (
              <li key={character.id}>
                <button
                  type='button'
                  aria-pressed={order !== -1}
                  onClick={() => toggle(character.id)}
                  className={cn('flex min-h-14 w-full items-center gap-3 rounded-lg border p-2 text-left', order !== -1 && 'border-primary bg-primary/10')}
                >
                  <Avatar className='size-10'>
                    {character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
                    <AvatarFallback>{initials(character.name)}</AvatarFallback>
                  </Avatar>
                  <span className='min-w-0 flex-1 truncate font-medium'>{character.name}</span>
                  {order !== -1 && <span className='text-xs text-muted-foreground'>{order === 0 ? 'Speaks first' : `#${order + 1}`}</span>}
                </button>
              </li>
            );
          })}
          {list.data !== undefined && list.data.length === 0 && <li className='text-muted-foreground'>Add a character first.</li>}
        </ul>
        <div className='border-t p-4'>
          <Button type='button' className='h-11 w-full' disabled={picked.length === 0 || starting} onClick={() => void start()}>
            {starting ? 'Starting…' : picked.length > 1 ? `Start a group chat (${picked.length})` : 'Start the chat'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
