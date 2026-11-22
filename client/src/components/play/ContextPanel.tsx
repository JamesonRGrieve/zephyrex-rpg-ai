// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The play screen's context (the operator, 2026-11-21: "Any and all contextual information (combat
 * order, inventory, looting, characters, etc) belongs in the right popout context menu", with "The
 * sections of the right popout should be mutually exclusive accordions"). Who is here, where everyone
 * else was last seen, the sheet, and the dice; combat order, inventory and loot join as the VTT ships
 * them.
 */
import {
  AbilityScores,
  CampaignSeats,
  CharacterSheet,
  CombatOrder,
  CreationChoices,
  CurrentSceneTokens,
  DiceReplay,
  DiceTray,
  Inventory,
  Loot,
  SceneList,
} from '@zephyrex/vtt-play';
import { type ReactElement, useMemo, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from 'zephyrex/ui/accordion';
import { type Presence, presentCast } from '~/features/chat/turnDecision';

export interface PanelMember {
  id: string;
  name: string;
  line: string;
}

interface Entity {
  id: string;
  kind: string;
  name: string;
  location_id?: string | null;
  parent_id?: string | null;
}

/** Who is present, and where the rest were last placed, from the playthrough's records and the story. */
export function whereabouts(
  cast: readonly PanelMember[],
  seatId: string | null,
  entities: readonly Entity[],
  recent: Presence['recent'],
): { here: PanelMember[]; away: { member: PanelMember; place: string | null }[] } {
  const places = new Map(entities.filter((one) => one.kind === 'location').map((one) => [one.id, one]));
  const located = new Map(entities.filter((one) => one.kind === 'person').map((one) => [one.id, one.location_id ?? null]));
  const sceneLocation = seatId === null ? null : (located.get(seatId) ?? null);
  const presence: Presence = {
    tokens: null,
    vox: [],
    scene_location: sceneLocation,
    location_parents: Object.fromEntries([...places.values()].map((one) => [one.id, one.parent_id ?? null])),
    person_locations: Object.fromEntries(located),
    recent,
  };
  const { present } = presentCast(cast, presence);
  const here = cast.filter((member) => member.id === seatId || present.includes(member.id));
  const away = cast
    .filter((member) => !here.includes(member))
    .map((member) => ({ member, place: places.get(located.get(member.id) ?? '')?.name ?? null }));
  return { here, away };
}

/**
 * The RAW builder's ability scores (the VTT's rpg_builder), where the game system has methods for
 * them: 5e today. A system without them (DH2) shows nothing rather than an error.
 */
function BuilderStep({ personId }: { personId: string }): ReactElement | null {
  const client = useClient();
  const answers = (path: string, body: Parameters<typeof client.post>[1]) =>
    client.post(path, body).then(
      () => true,
      () => false,
    );
  // Each step shows only where the game system has it (5e today; DH2 answers 422).
  const choices = useSWR(['rpg-ai', 'builder-choices', personId], () =>
    answers('/v1/builder/choices', { choices: { person_id: personId } }),
  );
  const options = useSWR(['rpg-ai', 'builder-options', personId], () =>
    answers('/v1/builder/options', { options: { person_id: personId } }),
  );
  if (choices.data !== true && options.data !== true) return null;
  return (
    <div className='grid gap-4'>
      {choices.data === true && <CreationChoices personId={personId} />}
      {options.data === true && <AbilityScores personId={personId} />}
    </div>
  );
}

function Member({ member, note }: { member: PanelMember; note?: string | null }): ReactElement {
  return (
    <li className='rounded-md border px-3 py-2'>
      <span className='block font-medium'>{member.name}</span>
      {note ? <span className='block text-xs text-muted-foreground'>Last seen: {note}</span> : null}
      {member.line !== '' && <span className='line-clamp-2 block text-xs text-muted-foreground'>{member.line}</span>}
    </li>
  );
}

export interface ContextPanelProps {
  campaignId: string | null;
  cast: readonly PanelMember[];
  seatId: string | null;
  recent: Presence['recent'];
  /** The latest decided roll, as the VTT answered it: its dice tumble again here. */
  lastRoll?: unknown;
}

/**
 * The open chat's context, handed to the app wrapper's right-hand sidebar (the framework's
 * SidebarContext, a pop-out from the right as the navigation is from the left). The chat writes its
 * props here; the sidebar, outside the chat's tree, reads them.
 */
let current: ContextPanelProps | null = null;
const listeners = new Set<() => void>();
export function setContextPanel(next: ContextPanelProps | null): void {
  current = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What the right-hand sidebar shows while a chat is open. */
export function ContextSidebar(): ReactElement | null {
  const props = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return props === null ? null : <ContextPanel {...props} />;
}

export function ContextPanel({ campaignId, cast, seatId, recent, lastRoll = null }: ContextPanelProps): ReactElement {
  const client = useClient();
  const entities = useSWR(campaignId !== null ? ['rpg-ai', 'panel-entities', campaignId] : null, async () => {
    const page = await client.get('/v1/world_entity', { campaign_id: campaignId ?? '', limit: '500' });
    const rows = Reflect.get(Object(page), 'world_entities');
    return Array.isArray(rows) ? (rows as Entity[]) : [];
  });
  const { here, away } = useMemo(
    () => whereabouts(cast, seatId, entities.data ?? [], recent),
    [cast, seatId, entities.data, recent],
  );
  const sheetFor = seatId ?? cast[0]?.id ?? null;
  return (
    <div className='grid gap-2'>
      <p className='px-2 text-xs text-muted-foreground'>
        Who is here, where the rest are, your sheet, what you carry and the dice.
      </p>
      <div className='px-2'>
        <Accordion type='single' defaultValue='here'>
          <AccordionItem value='here'>
            <AccordionTrigger>Here ({here.length})</AccordionTrigger>
            <AccordionContent>
              <ul className='grid gap-2'>
                {here.map((member) => (
                  <Member key={member.id} member={member} />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='away'>
            <AccordionTrigger>Elsewhere ({away.length})</AccordionTrigger>
            <AccordionContent>
              <ul className='grid gap-2'>
                {away.map(({ member, place }) => (
                  <Member key={member.id} member={member} note={place ?? 'unknown'} />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
          {campaignId !== null && (
            // The fight in progress (the VTT's rpg_combat): its round, the initiative order, whose
            // turn it is; the GM rolls, starts, advances and ends it here.
            <AccordionItem value='combat'>
              <AccordionTrigger>Combat order</AccordionTrigger>
              <AccordionContent>
                <CombatOrder campaignId={campaignId} />
              </AccordionContent>
            </AccordionItem>
          )}
          {campaignId !== null && (
            // The table (the operator, 2026-11-21: tables belong in the play area): the campaign's
            // scenes (the GM makes one current), its seats, and what's on the current map.
            <AccordionItem value='table'>
              <AccordionTrigger>Table</AccordionTrigger>
              <AccordionContent>
                <div className='grid gap-4'>
                  <SceneList campaignId={campaignId} />
                  <CampaignSeats campaignId={campaignId} />
                  <CurrentSceneTokens campaignId={campaignId} />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {sheetFor !== null && (
            <AccordionItem value='sheet'>
              <AccordionTrigger>Character sheet</AccordionTrigger>
              <AccordionContent>
                <div className='grid gap-4'>
                  <BuilderStep personId={sheetFor} />
                  <CharacterSheet personId={sheetFor} />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {sheetFor !== null && (
            <AccordionItem value='inventory'>
              <AccordionTrigger>Inventory</AccordionTrigger>
              <AccordionContent>
                <Inventory personId={sheetFor} />
              </AccordionContent>
            </AccordionItem>
          )}
          {sheetFor !== null && (
            // What lies where the character is (the operator: looting belongs in the context panel).
            <AccordionItem value='loot'>
              <AccordionTrigger>Loot here</AccordionTrigger>
              <AccordionContent>
                <Loot personId={sheetFor} />
              </AccordionContent>
            </AccordionItem>
          )}
          {sheetFor !== null && (
            <AccordionItem value='dice'>
              <AccordionTrigger>Dice</AccordionTrigger>
              <AccordionContent>
                <div className='grid gap-4'>
                  {lastRoll !== null && (
                    // The latest decided roll, replayed (the operator: "The dice tray / animation could
                    // also be in the right popout").
                    <DiceReplay result={lastRoll} />
                  )}
                  <DiceTray personId={sheetFor} />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  );
}
