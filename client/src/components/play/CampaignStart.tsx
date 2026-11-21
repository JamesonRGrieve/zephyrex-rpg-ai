// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Starting a campaign (docs/DESIGN.md, The composed suite): the campaign is the wiki's, and so is
 * its cast. The person picks the party (the campaign's player characters, wiki persons of kind
 * `pc`, by default; any of its persons can join) and the seat they start in: the GM, or any of
 * them. The seat can be swapped at any time once playing. The campaign's story is one chat, marked
 * a campaign by its play state, whose campaign is the wiki campaign (the prompt reads its world
 * from there), and opens on its framing note's Opening Situation (else the campaign's
 * description) as the narrator's first line, which is where Session 1 starts.
 */
import { journals, worlds } from '@zephyrex-rpg/wiki/features/data/records';
import { useRouter } from 'next/navigation';
import { notify } from 'zephyrex/hooks/useToast';
import { useClient } from 'zephyrex';
import { z } from 'zod';
import { type ReactElement, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { LIMITS } from '~/contract';
import { campaignPlays, chatSessions } from '~/features/data/playRecords';
import { PARTY_TAG, useCast } from '~/features/data/cast';
import { type OpeningEntity, openingFor } from '~/features/campaign/opening';
import { openingLine } from '~/features/data/framing';
import { type Character, chats, messages } from '~/features/data/records';
import { cn } from '~/lib/utils';
import { seatGroups } from './SeatPicker';
import { initials } from '../characters/CharacterTile';

export { PARTY_TAG };

/** The default party: the player characters, less the one the person plays. */
export function defaultParty(cast: readonly Pick<Character, 'id' | 'tags'>[], playing: string | null): string[] {
  return cast
    .filter((character) => character.tags.includes(PARTY_TAG) && character.id !== playing)
    .map((character) => character.id)
    .slice(0, LIMITS.characters_per_chat);
}

/** The new chat's title: the campaign, and the person's seat. */
export function startTitle(campaign: string, playing: string | null): string {
  return `${campaign}: ${playing === null ? 'you are the GM' : `you play ${playing}`}`.slice(
    0,
    LIMITS.chat_title_characters,
  );
}

function Row({
  character,
  pressed,
  onClick,
  label,
}: {
  character: Character;
  pressed: boolean;
  onClick: () => void;
  label?: string;
}): ReactElement {
  return (
    <button
      type='button'
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-lg border p-2 text-left',
        pressed && 'border-primary bg-primary/10',
      )}
    >
      <Avatar className='size-10'>
        {character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
        <AvatarFallback>{initials(character.name)}</AvatarFallback>
      </Avatar>
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-medium'>{character.name}</span>
        {character.folder !== '' && (
          <span className='line-clamp-2 block text-xs text-muted-foreground'>{character.folder}</span>
        )}
      </span>
      {label !== undefined && <span className='text-xs text-muted-foreground'>{label}</span>}
    </button>
  );
}

export interface StartChoice {
  seat: 'gm' | 'player';
  /** The character the person plays (the player's seat), or null. */
  playing: string | null;
  /** The party the AI pilots. */
  party: string[];
}

/** The choices: the seat, who the person plays, and the party. Data-free, so a story can drive it. */
export function CampaignStartForm({
  cast,
  starting,
  onStart,
}: {
  cast: readonly Character[];
  starting: boolean;
  onStart: (choice: StartChoice) => void;
}): ReactElement {
  const [seat, setSeat] = useState<'gm' | 'player'>('gm');
  const [playing, setPlaying] = useState<string | null>(null);
  const [party, setParty] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const playingId = seat === 'player' ? playing : null;
  const chosenParty = party ?? defaultParty(cast, playingId);
  const found = cast.filter((character) => character.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) =>
    setParty(
      chosenParty.includes(id)
        ? chosenParty.filter((one) => one !== id)
        : [...chosenParty, id].slice(0, LIMITS.characters_per_chat),
    );
  const ready = seat === 'gm' ? chosenParty.length > 0 : playingId !== null;
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='grid flex-1 gap-4 overflow-y-auto p-4'>
        <div className='grid gap-2'>
          <span id='start-seat' className='text-sm font-medium'>
            You start as
          </span>
          <div role='radiogroup' aria-labelledby='start-seat' className='grid grid-cols-2 gap-2'>
            {(['gm', 'player'] as const).map((value) => (
              <button
                key={value}
                type='button'
                role='radio'
                aria-checked={seat === value}
                onClick={() => {
                  setSeat(value);
                  setParty(null);
                }}
                className={cn('min-h-11 rounded-lg border px-3 text-left', seat === value && 'border-primary bg-primary/10')}
              >
                <span className='block font-medium'>{value === 'gm' ? 'The GM' : 'A character'}</span>
                <span className='block text-xs text-muted-foreground'>
                  {value === 'gm' ? 'You run the world; the party is AI' : 'You play one; the AI plays the rest'}
                </span>
              </button>
            ))}
          </div>
        </div>
        {seat === 'player' && (
          <section aria-labelledby='start-who' className='grid gap-2'>
            <h3 id='start-who' className='text-sm font-medium'>
              Who do you play?
            </h3>
            <Input
              aria-label='Find a character'
              placeholder='Find a character'
              className='h-11'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div role='group' aria-label='Characters to play' className='grid max-h-72 gap-3 overflow-y-auto'>
              {seatGroups(found.map((character) => ({ ...character, pc: character.tags.includes(PARTY_TAG) }))).map(
                (group) => (
                  <ul key={group.label} className='grid gap-2' aria-label={group.label}>
                    <li role='presentation' className='text-xs font-semibold text-muted-foreground'>
                      {group.label}
                    </li>
                    {group.members.map((character) => (
                      <li key={character.id}>
                        <Row
                          character={character}
                          pressed={playing === character.id}
                          onClick={() => {
                            setPlaying(character.id);
                            setParty(null);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        )}
        <section aria-labelledby='start-party' className='grid gap-2'>
          <h3 id='start-party' className='text-sm font-medium'>
            The party, played by the AI ({chosenParty.length})
          </h3>
          <ul className='grid gap-2' aria-label='Party'>
            {cast
              .filter(
                (character) =>
                  character.id !== playingId && (character.tags.includes(PARTY_TAG) || chosenParty.includes(character.id)),
              )
              .map((character) => (
                <li key={character.id}>
                  <Row
                    character={character}
                    pressed={chosenParty.includes(character.id)}
                    onClick={() => toggle(character.id)}
                  />
                </li>
              ))}
          </ul>
        </section>
      </div>
      <div className='border-t p-4'>
        <Button
          type='button'
          className='h-11 w-full'
          disabled={!ready || starting}
          onClick={() => onStart({ seat, playing: playingId, party: chosenParty.filter((id) => id !== playingId) })}
        >
          {starting ? 'Starting…' : 'Start the campaign'}
        </Button>
      </div>
    </div>
  );
}

const instantiated = z.object({ campaign: z.object({ id: z.string() }), id_map: z.record(z.string(), z.string()) });

/**
 * Copy on start (the operator, 2026-11-21): a campaign plays in its own copy of the scenario, so play
 * never changes the scenario. The wiki copies every record and link, and answers with an id map.
 */
export function remapChoice(choice: StartChoice, idMap: Readonly<Record<string, string>>): StartChoice {
  const to = (id: string) => idMap[id] ?? id;
  return { seat: choice.seat, playing: choice.playing === null ? null : to(choice.playing), party: choice.party.map(to) };
}

export function CampaignStart({ campaignId, onStarted }: { campaignId: string; onStarted: () => void }): ReactElement {
  const campaign = worlds.useOne(campaignId);
  const cast = useCast(campaignId);
  const notes = journals.useList({ campaign_id: campaignId });
  const { create: createChat } = chats.useActions();
  const { create: createMessage } = messages.useActions();
  const { create: createPlay } = campaignPlays.useActions();
  const { create: createSession } = chatSessions.useActions();
  const router = useRouter();
  const client = useClient();
  const [starting, setStarting] = useState(false);
  const all = useMemo(() => cast.data ?? [], [cast.data]);

  /**
   * The opening, told (the operator, 2026-11-21: "It should also not ask where I am. It should tell
   * me."): the framing's situation, then where the seat's character starts and who is there with them,
   * from the playthrough's own records. The situation alone when they can't be read.
   */
  const toldOpening = async (campaignId: string, seated: string | null, situation: string): Promise<string> => {
    try {
      const page = await client.get('/v1/world_entity', { campaign_id: campaignId, limit: '500' });
      const rows = Reflect.get(Object(page), 'world_entities');
      const entities = Array.isArray(rows) ? (rows as OpeningEntity[]) : [];
      return openingFor(seated, situation, entities, null, null).text || situation;
    } catch {
      return situation;
    }
  };

  const start = async (choice: StartChoice) => {
    const scenario = campaign.data;
    if (scenario === undefined) return;
    setStarting(true);
    try {
      // The playthrough: the scenario's own copy, its cast remapped to the copies.
      const copy = instantiated.parse(
        await client.post(`/v1/campaign/${scenario.id}/instantiate`, { instantiate: { name: scenario.name } }),
      );
      const world = { ...scenario, id: copy.campaign.id };
      const { seat, playing, party } = remapChoice(choice, copy.id_map);
      // The campaign's story is one chat: the party (and whoever the person starts as) are its cast.
      const members = playing === null || party.includes(playing) ? party : [...party, playing];
      const chat = await createChat({
        title: world.name.slice(0, LIMITS.chat_title_characters),
        character_ids: members.slice(0, LIMITS.characters_per_chat),
        mode: members.length > 1 ? 'group' : 'character',
        seat,
        campaign_id: world.id,
        folder: world.name.slice(0, LIMITS.name_characters),
        // The decision model runs the table by default (the operator, 2026-11-21): who speaks next,
        // the GM interjecting, or a pause for the person.
        group_settings: { order: 'decide' },
      });
      const opening = await createMessage({
        chat_id: chat.id,
        parent_id: null,
        role: 'narrator',
        channel: 'ic',
        swipes: [await toldOpening(world.id, playing, openingLine(scenario, notes.data ?? []))],
      });
      await createPlay({ chat_id: chat.id, playing_id: playing });
      await createSession({ chat_id: chat.id, number: 1, start_message_id: opening.id });
      onStarted();
      router.push(`/play/${chat.id}`);
    } catch (error) {
      // Never a silent hang (the operator, 2026-11-21: "Start the campaign now hangs"): say why.
      notify('The campaign was not started', error instanceof Error ? error.message : undefined);
    } finally {
      setStarting(false);
    }
  };

  return <CampaignStartForm cast={all} starting={starting} onStart={(choice) => void start(choice)} />;
}
