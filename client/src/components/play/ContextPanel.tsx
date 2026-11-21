// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The play screen's context (the operator, 2026-11-21: "Any and all contextual information (combat
 * order, inventory, looting, characters, etc) belongs in the right popout context menu", with "The
 * sections of the right popout should be mutually exclusive accordions"). Who is here, where everyone
 * else was last seen, the sheet, and the dice; combat order, inventory and loot join as the VTT ships
 * them.
 */
import { CharacterSheet, DiceTray } from '@zephyrex/vtt-play';
import { type ReactElement, useMemo } from 'react';
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from 'zephyrex/ui/accordion';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { type Presence, presentCast } from '~/features/chat/turnDecision';
import { useIsMobile } from 'zephyrex/hooks/useMobile';

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

function Member({ member, note }: { member: PanelMember; note?: string | null }): ReactElement {
  return (
    <li className='rounded-md border px-3 py-2'>
      <span className='block font-medium'>{member.name}</span>
      {note ? <span className='block text-xs text-muted-foreground'>Last seen: {note}</span> : null}
      {member.line !== '' && <span className='line-clamp-2 block text-xs text-muted-foreground'>{member.line}</span>}
    </li>
  );
}

export function ContextPanel({
  open,
  onOpenChange,
  campaignId,
  cast,
  seatId,
  recent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  cast: readonly PanelMember[];
  seatId: string | null;
  recent: Presence['recent'];
}): ReactElement {
  const mobile = useIsMobile();
  const client = useClient();
  const entities = useSWR(open && campaignId !== null ? ['rpg-ai', 'panel-entities', campaignId] : null, async () => {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={mobile ? 'bottom' : 'right'} className='max-h-[90svh] overflow-y-auto pb-safe'>
        <SheetHeader>
          <SheetTitle>Context</SheetTitle>
          <SheetDescription>Who is here, where the rest are, your sheet and the dice.</SheetDescription>
        </SheetHeader>
        <div className='p-4'>
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
            {sheetFor !== null && (
              <AccordionItem value='sheet'>
                <AccordionTrigger>Character sheet</AccordionTrigger>
                <AccordionContent>
                  <CharacterSheet personId={sheetFor} />
                </AccordionContent>
              </AccordionItem>
            )}
            {sheetFor !== null && (
              <AccordionItem value='dice'>
                <AccordionTrigger>Dice</AccordionTrigger>
                <AccordionContent>
                  <DiceTray personId={sheetFor} />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
