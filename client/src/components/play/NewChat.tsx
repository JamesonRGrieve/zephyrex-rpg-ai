// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Starting a chat: pick one character, or several for a group, and go. The chat opens on each
 * member's greeting in turn (a group greets as SillyTavern's group greetings do), each with its
 * alternate greetings as swipes.
 */
import { useRouter } from 'next/navigation';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { cn } from '~/lib/utils';
import { LIMITS } from '~/contract';
import { openingTurns } from '~/features/chat/turns';
import { people, worlds } from '@zephyrex-rpg/wiki/features/data/records';
import { useCast } from '~/features/data/cast';
import { sandboxCampaign, sharedCampaign } from '~/features/data/sandbox';
import { usePersonFolders } from '~/features/data/folders';
import { type Character, chats, messages } from '~/features/data/records';
import { initials } from '../characters/CharacterTile';
import { CampaignStart } from './CampaignStart';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';

/** A chat's title from its cast. */
export function chatTitle(cast: readonly Pick<Character, 'name'>[]): string {
  const names = cast.map((character) => character.name);
  if (names.length <= 1) return `Chat with ${names[0] ?? 'a character'}`;
  return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** `campaignId`: the campaign frame the new chat plays in (from a campaign's brief), if any. */
export function NewChat({
  open,
  onOpenChange,
  campaignId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string | null;
}): ReactElement {
  const list = useCast();
  const folders = usePersonFolders();
  // The picker folders the cast by setting, scenario and campaign (features/data/folders).
  const grouped = new Map<string, NonNullable<typeof list.data>>();
  for (const character of list.data ?? []) {
    const folder = folders.get(character.id) ?? 'Cards';
    grouped.set(folder, [...(grouped.get(folder) ?? []), character]);
  }
  const folderNames = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
  const { create } = chats.useActions();
  const personList = people.useList();
  const worldList = worlds.useList();
  const { create: createWorld } = worlds.useActions();
  const { create: createMessage } = messages.useActions();
  const router = useRouter();
  const mobile = useIsMobile();
  const [picked, setPicked] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const toggle = (id: string) =>
    setPicked(
      picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id].slice(0, LIMITS.characters_per_chat),
    );

  const start = async () => {
    const cast = picked.flatMap((id) => (list.data ?? []).filter((character) => character.id === id));
    const first = cast[0];
    if (first === undefined) return;
    setStarting(true);
    try {
      // Every chat plays in a wiki campaign: the one the cast share, else the person's Sandbox.
      const campaignOf = new Map((personList.data ?? []).map((person) => [person.id, person.campaign_id]));
      const playsIn =
        campaignId ?? sharedCampaign(picked, campaignOf) ?? (await sandboxCampaign(worldList.data ?? [], createWorld));
      const chat = await create({
        title: chatTitle(cast),
        character_ids: picked,
        mode: cast.length > 1 ? 'group' : 'character',
        campaign_id: playsIn,
      });
      // Each member greets in turn (A52): one message after another, each answering the last.
      await openingTurns(cast).reduce<Promise<string | null>>(
        async (parent, turn) =>
          (
            await createMessage({
              chat_id: chat.id,
              parent_id: await parent,
              role: 'character',
              speaker_character_id: turn.speakerId,
              swipes: turn.swipes,
            })
          ).id,
        Promise.resolve(null),
      );
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
          <SheetTitle>{campaignId === null ? 'New chat' : 'Start the campaign'}</SheetTitle>
          <SheetDescription>
            {campaignId === null
              ? 'Pick one character, or several for a group.'
              : 'Sit as the GM or as any character; the AI plays the rest of the party.'}
          </SheetDescription>
        </SheetHeader>
        {campaignId !== null ? (
          <CampaignStart campaignId={campaignId} onStarted={() => onOpenChange(false)} />
        ) : (
          <>
            <ul className='grid flex-1 gap-2 overflow-y-auto p-4' aria-label='Characters'>
              {folderNames.flatMap((folder) => [
                <li key={`folder-${folder}`} role='presentation' className='pt-2 text-xs font-semibold text-muted-foreground'>
                  {folder}
                </li>,
                ...(grouped.get(folder) ?? []).map((character) => {
                const order = picked.indexOf(character.id);
                return (
                  <li key={character.id}>
                    <button
                      type='button'
                      aria-pressed={order !== -1}
                      onClick={() => toggle(character.id)}
                      className={cn(
                        'flex min-h-14 w-full items-center gap-3 rounded-lg border p-2 text-left',
                        order !== -1 && 'border-primary bg-primary/10',
                      )}
                    >
                      <Avatar className='size-10'>
                        {character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
                        <AvatarFallback>{initials(character.name)}</AvatarFallback>
                      </Avatar>
                      <span className='min-w-0 flex-1 truncate font-medium'>{character.name}</span>
                      {order !== -1 && (
                        <span className='text-xs text-muted-foreground'>
                          {order === 0 ? 'Speaks first' : `#${order + 1}`}
                        </span>
                      )}
                    </button>
                  </li>
                );
              }),
              ])}
              {list.data !== undefined && list.data.length === 0 && (
                <li className='text-muted-foreground'>Add a character first.</li>
              )}
            </ul>
            <div className='border-t p-4'>
              <Button
                type='button'
                className='h-11 w-full'
                disabled={picked.length === 0 || starting}
                onClick={() => void start()}
              >
                {starting ? 'Starting…' : picked.length > 1 ? `Start a group chat (${picked.length})` : 'Start the chat'}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
