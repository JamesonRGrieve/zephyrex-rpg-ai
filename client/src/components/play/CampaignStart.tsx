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
import { journals, people, worlds } from '@zephyrex-rpg/wiki/features/data/records';
import { useRouter } from 'next/navigation';
import { notify } from 'zephyrex/hooks/useToast';
import { useSWRConfig } from 'swr';
import { useClient } from 'zephyrex';
import { z } from 'zod';
import { type ReactElement, type ReactNode, useMemo, useRef, useState } from 'react';
import { StartingLevel } from './StartingLevel';
import { createPortal } from 'react-dom';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Textarea } from 'zephyrex/ui/textarea';
import { LIMITS } from '~/contract';
import { campaignPlays, chatSessions } from '~/features/data/playRecords';
import { PARTY_TAG, personAsCast, useCast } from '~/features/data/cast';
import useSWR from 'swr';
import { type OpeningEntity, openingFor } from '~/features/campaign/opening';
import { startPlace } from '~/features/campaign/startPlace';
import { placeParty } from '~/features/chat/mapStep';
import { openingLine } from '~/features/data/framing';
import { type Character, type Chat, type ChatMessage, chats, messages } from '~/features/data/records';
import { cn } from '~/lib/utils';
import { seatGroups } from './SeatPicker';
import { initials } from '../characters/CharacterTile';

export { PARTY_TAG };
/** The wiki's tag on a setting's pregenerated characters. */
export const PREGEN_TAG = 'Pregen';
/** The first line while the narrator writes the opening (nothing in the records tells it). */
const OPENING_PLACEHOLDER = 'The story begins.';

/** The default party: the player characters, less the one the person plays. */
export function defaultParty(cast: readonly Pick<Character, 'id' | 'tags'>[], playing: string | null): string[] {
  return cast
    .filter((character) => character.tags.includes(PARTY_TAG) && character.id !== playing)
    .map((character) => character.id)
    .slice(0, LIMITS.characters_per_chat);
}

/** The new chat's title: the campaign, and the person's seat. */
/** An opening's first-line banner (`[location: …]`) apart from its story; null when it has none. */
export function splitBanner(text: string): [string | null, string] {
  const [first = '', ...rest] = text.split('\n');
  if (!/^\s*\[location:\s*[^\]\n]+\]\s*$/i.test(first)) return [null, text];
  return [first.trim(), rest.join('\n').replace(/^\n+/, '')];
}

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
  /**
   * A character made for this campaign (the operator, 2026-11-22: "a 'New Character' that uses the
   * character builder and a 'Freeform Character' that lets the character be developed during play
   * (narrative mode only)"): made in the playthrough at start and played; `playing` is then null.
   */
  make?: { kind: MakeKind; name: string; concept?: string };
}

/**
 * New: the character builder. Freeform: a name, filled in by play (narrative only). Described: the person
 * says who they are, and the decision model makes the builder's picks from the builder's own options
 * (the operator, 2026-11-23: "AI assisted character creation modes"); every pick can be changed after.
 */
export type MakeKind = 'new' | 'described' | 'freeform';

const MAKE_KINDS: Record<MakeKind, { label: string; hint: string }> = {
  new: { label: 'New character', hint: 'Built with the character builder' },
  described: { label: 'Describe them', hint: 'Say who they are; the builder is filled in for you to change' },
  freeform: { label: 'Freeform character', hint: 'Just a name; who they are grows in play' },
};

/** The choices: the seat, who the person plays, and the party. Data-free, so a story can drive it. */
/** The steps of a start, in order (the operator, 2026-11-21: "A progress bar for the copy"). */
export const START_STEPS = [
  'Copying the scenario for your campaign',
  'Seating the party',
  'Setting the scene',
  'Opening the story',
] as const;

/** The start's progress: the step under way and a bar; the copy creeps while the server works. */
export function StartProgress({
  step,
  creep,
  detail = null,
}: {
  step: number;
  creep: number;
  detail?: string | null;
}): ReactElement {
  const share = 100 / START_STEPS.length;
  const percent = Math.min(99, Math.round(step * share + creep * share));
  return (
    <div className='grid gap-2' role='status' aria-live='polite'>
      <div
        className='h-2 w-full overflow-hidden rounded-full bg-muted'
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label='Starting the campaign'
      >
        <div className='h-full rounded-full bg-primary transition-[width] duration-500' style={{ width: `${percent}%` }} />
      </div>
      <p className='text-sm text-muted-foreground'>
        {START_STEPS[Math.min(step, START_STEPS.length - 1)]}… ({step + 1} of {START_STEPS.length})
        {step === 0 && detail !== null && detail !== '' ? `: ${detail}` : ''}
      </p>
    </div>
  );
}

export function CampaignStartForm({
  cast,
  starting,
  step = 0,
  creep = 0,
  detail = null,
  onStart,
  mechanical = false,
  loading = false,
  settings = null,
}: {
  /** The scenario's own settings, above the seat (its starting level, for its GM). */
  settings?: ReactNode;
  /** A campaign whose outcomes the rules decide: no freeform character there. */
  mechanical?: boolean;
  /** The scenario is still being read: Start waits for it (a press before then would do nothing). */
  loading?: boolean;
  cast: readonly Character[];
  starting: boolean;
  step?: number;
  creep?: number;
  detail?: string | null;
  onStart: (choice: StartChoice) => void;
}): ReactElement {
  const [seat, setSeat] = useState<'gm' | 'player'>('gm');
  const [playing, setPlaying] = useState<string | null>(null);
  const [party, setParty] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [make, setMake] = useState<{ kind: MakeKind; name: string; concept?: string } | null>(null);
  const playingId = seat === 'player' && make === null ? playing : null;
  const chosenParty = party ?? defaultParty(cast, playingId);
  const found = cast.filter((character) => character.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) =>
    setParty(
      chosenParty.includes(id)
        ? chosenParty.filter((one) => one !== id)
        : [...chosenParty, id].slice(0, LIMITS.characters_per_chat),
    );
  const ready =
    seat === 'gm'
      ? chosenParty.length > 0
      : make !== null
        ? make.name.trim() !== '' && (make.kind !== 'described' || (make.concept ?? '').trim() !== '')
        : playingId !== null;
  // Once it starts, the copy and the boot take the whole page (the operator, 2026-11-22: "The world
  // copying / boot up should take up the full page. Once you start that you shouldn't be editing
  // characters etc anyway").
  if (starting) {
    const progress = (
      <div className='fixed inset-0 z-[100] flex items-center justify-center bg-background p-6 pt-safe pb-safe'>
        <div className='grid w-full max-w-md gap-4'>
          <StartProgress step={step} creep={creep} detail={detail} />
        </div>
      </div>
    );
    // Over the whole page, never inside the sheet it was started from.
    return typeof document === 'undefined' ? progress : createPortal(progress, document.body);
  }
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='grid flex-1 gap-4 overflow-y-auto p-4'>
        {settings}
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
            <div role='group' aria-label='Make your own' className='grid gap-2 sm:grid-cols-2'>
              {(['new', 'described', 'freeform'] as const)
                .filter((kind) => kind !== 'freeform' || !mechanical)
                .map((kind) => (
                  <button
                    key={kind}
                    type='button'
                    aria-pressed={make?.kind === kind}
                    onClick={() => {
                      setMake((now) => (now?.kind === kind ? null : { kind, name: now?.name ?? '' }));
                      setPlaying(null);
                      setParty(null);
                    }}
                    className={cn(
                      'min-h-11 rounded-lg border px-3 py-2 text-left',
                      make?.kind === kind && 'border-primary bg-primary/10',
                    )}
                  >
                    <span className='block font-medium'>{MAKE_KINDS[kind].label}</span>
                    <span className='block text-xs text-muted-foreground'>{MAKE_KINDS[kind].hint}</span>
                  </button>
                ))}
            </div>
            {make !== null && (
              <Input
                aria-label='Their name'
                placeholder='Their name'
                className='h-11'
                autoFocus
                value={make.name}
                onChange={(event) => setMake({ ...make, name: event.target.value })}
              />
            )}
            {make?.kind === 'described' && (
              <Textarea
                aria-label='Who they are'
                placeholder='Who they are: "a sly halfling who grew up running cargo on the docks, quick with a knife"'
                rows={3}
                maxLength={LIMITS.persona_description_characters}
                value={make.concept ?? ''}
                onChange={(event) => setMake({ ...make, concept: event.target.value })}
              />
            )}
            <Input
              aria-label='Find a character'
              placeholder='Find a character'
              className='h-11'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div role='group' aria-label='Characters to play' className='grid max-h-72 gap-3 overflow-y-auto'>
              {[
                ...seatGroups(
                  found
                    .filter((character) => !character.tags.includes(PREGEN_TAG))
                    .map((character) => ({ ...character, pc: character.tags.includes(PARTY_TAG) })),
                ),
                ...(found.some((character) => character.tags.includes(PREGEN_TAG))
                  ? [
                      {
                        label: 'Setting characters',
                        members: found.filter((character) => character.tags.includes(PREGEN_TAG)),
                      },
                    ]
                  : []),
              ].map((group) => (
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
                          setMake(null);
                          setParty(null);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ))}
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
                  character.id !== playingId &&
                  (character.tags.includes(PARTY_TAG) ||
                    character.tags.includes(PREGEN_TAG) ||
                    chosenParty.includes(character.id)),
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
      <div className='grid gap-3 border-t p-4'>
        <Button
          type='button'
          className='h-11 w-full'
          disabled={!ready || starting || loading}
          onClick={() =>
            onStart({
              seat,
              playing: playingId,
              party: chosenParty.filter((id) => id !== playingId),
              ...(seat === 'player' && make !== null
                ? {
                    make: {
                      kind: make.kind,
                      name: make.name.trim(),
                      ...(make.kind === 'described' ? { concept: (make.concept ?? '').trim() } : {}),
                    },
                  }
                : {}),
            })
          }
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
  return {
    seat: choice.seat,
    playing: choice.playing === null ? null : to(choice.playing),
    party: choice.party.map(to),
    ...(choice.make === undefined ? {} : { make: choice.make }),
  };
}

export function CampaignStart({ campaignId, onStarted }: { campaignId: string; onStarted: () => void }): ReactElement {
  const campaign = worlds.useOne(campaignId);
  // Only the scenario's own people (and, as the wiki adds them, its setting's pregens): no cards.
  const cast = useCast(campaignId, { cards: false });
  const notes = journals.useList({ campaign_id: campaignId });
  const { create: createChat } = chats.useActions();
  const { create: createMessage } = messages.useActions();
  const { create: createPlay } = campaignPlays.useActions();
  const { create: createSession } = chatSessions.useActions();
  const { create: createPerson, update: updatePerson } = people.useActions();
  const router = useRouter();
  const client = useClient();
  const { mutate } = useSWRConfig();
  const [starting, setStarting] = useState(false);
  const [step, setStep] = useState(0);
  const [creep, setCreep] = useState(0);
  // The copy's own step, as the server reports it ("copying people", …).
  const [copyStep, setCopyStep] = useState<string | null>(null);
  // The setting's own characters to pick from, on top of the scenario's (the operator, 2026-11-21:
  // "setting generic characters … a couple variants per class"): the wiki's pregens.
  const settingId = (campaign.data as { setting_id?: string | null } | undefined)?.setting_id ?? null;
  const pregenFetch = useSWR(settingId === null ? null : ['rpg-ai', 'pregens', settingId], async () => {
    const answer = Reflect.get(Object(await client.get(`/v1/setting/${settingId}/pregen`)), 'pregens');
    return Array.isArray(answer) ? answer : [];
  });
  const pregenList = useMemo(
    () =>
      (pregenFetch.data ?? []).flatMap((raw): Character[] => {
        const id = Reflect.get(Object(raw), 'id');
        const name = Reflect.get(Object(raw), 'name');
        if (typeof id !== 'string' || typeof name !== 'string') return [];
        const tags = Reflect.get(Object(raw), 'tags');
        const picture = Reflect.get(Object(raw), 'picture_url');
        const summary = Reflect.get(Object(raw), 'summary');
        const base = personAsCast({ id, name, description: '', kind: 'pc', created_at: '', updated_at: '' });
        return [
          {
            ...base,
            // Not the scenario's party by default: picked by hand.
            tags: [PREGEN_TAG, ...(Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [])],
            avatar: typeof picture === 'string' && picture !== '' ? picture : null,
            folder: typeof summary === 'string' ? summary : '',
          },
        ];
      }),
    [pregenFetch.data],
  );
  const all = useMemo(() => [...(cast.data ?? []), ...pregenList], [cast.data, pregenList]);

  /**
   * The opening, told (the operator, 2026-11-21: "It should also not ask where I am. It should tell
   * me."): the framing's situation, then where the seat's character starts and who is there with them,
   * from the playthrough's own records. The situation alone when they can't be read.
   */
  const toldOpening = async (campaignId: string, seated: string | null, situation: string): Promise<string> => {
    try {
      const page = await client.get('/v1/world_entity', { campaign_id: campaignId, limit: '200' });
      const rows = Reflect.get(Object(page), 'world_entities');
      const entities = Array.isArray(rows) ? (rows as OpeningEntity[]) : [];
      // A seat with no place starts where the opening says, or where the people are, and is put there
      // in the wiki so the map, presence and the narrator agree (the Sullenmire start had no place).
      const seat = entities.find((entity) => entity.id === seated);
      let placed: string | null = null;
      if (seated !== null && seat !== undefined && (seat.location_id ?? null) === null) {
        placed = startPlace(situation, entities);
        if (placed !== null) {
          const person = Reflect.get(Object(await client.get(`/v1/person/${seated}`).catch(() => null)), 'person');
          if (person !== undefined && person !== null)
            await updatePerson(
              person as Parameters<typeof updatePerson>[0],
              { location_id: placed } as Parameters<typeof updatePerson>[1],
            ).catch(() => null);
        }
      }
      return openingFor(seated, situation, entities, null, placed).text || situation || OPENING_PLACEHOLDER;
    } catch {
      return situation || OPENING_PLACEHOLDER;
    }
  };

  /**
   * The copy, asynchronous (the operator, 2026-11-21: "make it async with the progress bar and auto
   * load it when it's done"): the server answers at once and copies in the background; its reports
   * drive the bar (done of total, and the step) until it is done or failed. A server that still
   * answers synchronously (the campaign and id map at once) is taken as done.
   */
  const copyScenario = async (
    scenarioId: string,
    name: string,
    pregens: readonly string[] = [],
  ): Promise<{ campaign: { id: string }; id_map: Record<string, string> }> => {
    const answer = Object(
      await client.post(`/v1/campaign/${scenarioId}/instantiate`, {
        // The setting's pregens picked are copied into the playthrough too (the setting's stay pristine).
        instantiate: { name, ...(pregens.length > 0 ? { pregens } : {}) },
      }),
    );
    const done = instantiated.safeParse(answer);
    if (done.success) return done.data;
    const startId = Reflect.get(Object(Reflect.get(answer, 'start')), 'id');
    if (typeof startId !== 'string') throw new Error('The scenario was not copied');
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const report = Object(Reflect.get(Object(await client.get(`/v1/campaign_start/${startId}`)), 'campaign_start'));
      const state: unknown = Reflect.get(report, 'state');
      const count = Number(Reflect.get(report, 'done') ?? 0);
      const total = Number(Reflect.get(report, 'total') ?? 0);
      const stepName: unknown = Reflect.get(report, 'step');
      setCreep(total > 0 ? Math.min(0.99, count / total) : 0);
      setCopyStep(typeof stepName === 'string' ? stepName : null);
      if (state === 'failed') throw new Error(String(Reflect.get(report, 'error') ?? 'The scenario was not copied'));
      if (state === 'done') {
        const raw: unknown = Reflect.get(report, 'id_map');
        const idMap = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, string>;
        return { campaign: { id: String(Reflect.get(report, 'campaign_id')) }, id_map: idMap ?? {} };
      }
    }
  };

  /**
   * What a start already made, so a start that stalls (the operator, 2026-11-22: "When I switch tabs
   * during campaign generation it seems to freeze on the next step") goes on from there when tried
   * again, never copying the scenario twice or making a second chat.
   */
  const made = useRef<{
    copy?: { campaign: { id: string }; id_map: Record<string, string> };
    chat?: Chat;
    opening?: ChatMessage;
    person?: { id: string };
  }>({});
  const start = async (choice: StartChoice) => {
    const scenario = campaign.data;
    if (scenario === undefined) {
      // Never a press that does nothing (live test, 2026-11-24): the scenario isn't read yet.
      notify('The scenario is still loading', 'Press Start again in a moment.');
      return;
    }
    setStarting(true);
    setStep(0);
    setCreep(0);
    try {
      // The playthrough: the scenario's own copy, its cast remapped to the copies.
      const picked = new Set([...(choice.playing === null ? [] : [choice.playing]), ...choice.party]);
      const copy =
        made.current.copy ??
        (await copyScenario(
          scenario.id,
          scenario.name,
          pregenList.filter((one) => picked.has(one.id)).map((one) => one.id),
        ));
      made.current.copy = copy;
      const world = { ...scenario, id: copy.campaign.id };
      const remapped = remapChoice(choice, copy.id_map);
      const { seat, party } = remapped;
      // A character made for this campaign: a player character of the playthrough, played from the start.
      // New: the builder fills their sheet (the Context panel's character sheet opens on it). Freeform:
      // a name only, filled in as play shows who they are.
      const made_person =
        choice.make === undefined
          ? null
          : (made.current.person ??
            (await stalls(
              createPerson({
                name: choice.make.name.slice(0, LIMITS.name_characters),
                kind: 'pc',
                campaign_id: world.id,
                summary:
                  choice.make.kind === 'freeform'
                    ? 'A freeform character: who they are grows in play.'
                    : (choice.make.concept ?? '').slice(0, LIMITS.persona_description_characters),
              } as Parameters<typeof createPerson>[0]),
            )));
      if (made_person !== null && made.current.person === undefined && choice.make?.kind === 'described') {
        // The builder's picks from who they are, by the decision model among the builder's options; a
        // system without a builder, or no decision model, leaves the picks to the person.
        await client
          .post('/v1/ai_chat/builder_pick', {
            builder_pick: { person_id: made_person.id, concept: choice.make.concept ?? '' },
          })
          .catch(() => undefined);
      }
      if (made_person !== null) made.current.person = made_person;
      const playing = made_person?.id ?? remapped.playing;
      // The campaign's story is one chat: the party (and whoever the person starts as) are its cast.
      const members = playing === null || party.includes(playing) ? party : [...party, playing];
      setStep(1);
      setCreep(0);
      const chat =
        made.current.chat ??
        (await stalls(
          createChat({
            title: world.name.slice(0, LIMITS.chat_title_characters),
            character_ids: members.slice(0, LIMITS.characters_per_chat),
            mode: members.length > 1 ? 'group' : 'character',
            seat,
            campaign_id: world.id,
            folder: world.name.slice(0, LIMITS.name_characters),
            // The decision model runs the table by default (the operator, 2026-11-21): who speaks next,
            // the GM interjecting, or a pause for the person.
            group_settings: { order: 'decide' },
          }),
        ));
      made.current.chat = chat;
      setStep(2);
      // What the records say of the start; nothing (or only pointers to other notes): the narrator writes it.
      const situation = openingLine(scenario, notes.data ?? []);
      // The starting scene's banner is its own record, before the opening (the operator, 2026-11-24: the banner
      // "shouldn't be part of the narrative stream"; it marks the VTT's scene, here the one play starts on).
      const told = made.current.opening === undefined ? await stalls(toldOpening(world.id, playing, situation)) : '';
      const [bannerLine, story] = splitBanner(told);
      const banner =
        made.current.opening !== undefined || bannerLine === null
          ? null
          : await stalls(
              createMessage({ chat_id: chat.id, parent_id: null, role: 'narrator', channel: 'ic', swipes: [bannerLine] }),
            );
      const opening =
        made.current.opening ??
        (await stalls(
          createMessage({
            chat_id: chat.id,
            parent_id: banner?.id ?? null,
            role: 'narrator',
            channel: 'ic',
            swipes: [story],
          }),
        ));
      made.current.opening = opening;
      setStep(3);
      await stalls(createPlay({ chat_id: chat.id, playing_id: playing }));
      // The party on the scene's map from the start, so who is present (who may speak) is real in round one.
      if ((await placeParty(chat.id)) === null)
        notify('The party is not on the map yet', 'Place their tokens from the Map before play.');
      await stalls(createSession({ chat_id: chat.id, number: 1, start_message_id: opening.id }));
      made.current = {};
      // Open the session first, then close the sheet: never a closed sheet onto nothing (the
      // operator, 2026-11-21); the scenarios list reads chats afresh.
      router.push(`/play/${chat.id}${situation.trim() === '' ? '?open=1' : ''}`);
      void mutate((key) => Array.isArray(key) || (typeof key === 'string' && key.startsWith('/v1/chat')));
      onStarted();
    } catch (error) {
      // Never a silent hang (the operator, 2026-11-21: "Start the campaign now hangs"): say why.
      notify(
        'The campaign was not started',
        `${error instanceof Error ? error.message : ''} Start again to carry on from where it stopped.`.trim(),
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <CampaignStartForm
      cast={all}
      starting={starting}
      step={step}
      creep={creep}
      detail={copyStep}
      loading={campaign.data === undefined}
      settings={<StartingLevel campaignId={campaignId} />}
      onStart={(choice) => void start(choice)}
    />
  );
}

/**
 * A step that hangs (a phone suspends a page in the background and its request may never answer)
 * fails after a while instead, so Start can be pressed again and carry on.
 */
function stalls<T>(work: Promise<T>, seconds = 60): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('A step took too long (the page may have been in the background).')),
        seconds * 1000,
      ),
    ),
  ]);
}
