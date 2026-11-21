// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The campaign brief (A58): the frame shown to the players: premise, tone, what matters, the
 * setting truths and the characters. It carries no secrets: a frame holds none.
 */
import type { ReactElement } from 'react';
import { CAMPAIGN } from '~/contract';
import type { Campaign } from '~/features/data/records';

const tone = (campaign: Campaign) =>
  CAMPAIGN.dials.flatMap((dial) => {
    const value = campaign.dials[dial.id] ?? 0;
    if (value === 0) return [];
    return [`${Math.abs(value) >= 2 ? 'very ' : ''}${value < 0 ? dial.left : dial.right}`];
  });

/** The scenario's title and genre: the page's h1. */
export function CampaignBriefTitle({ campaign }: { campaign: Campaign }): ReactElement {
  return (
    <header className='grid gap-1'>
      <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>{campaign.name}</h1>
      {campaign.genre !== '' && <p className='text-base text-muted-foreground sm:text-lg'>{campaign.genre}</p>}
    </header>
  );
}

/** The brief; `titled={false}` when the page shows CampaignBriefTitle itself, at its top. */
export function CampaignBrief({ campaign, titled = true }: { campaign: Campaign; titled?: boolean }): ReactElement {
  const words = tone(campaign);
  const weights = CAMPAIGN.pillars.filter((pillar) => (campaign.pillars[pillar] ?? 0) > 0);
  return (
    <article className='grid w-full min-w-0 gap-6 leading-relaxed break-words [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6'>
      {titled && <CampaignBriefTitle campaign={campaign} />}
      {campaign.premise !== '' && <p className='whitespace-pre-wrap'>{campaign.premise}</p>}
      {(words.length > 0 || campaign.themes.length > 0) && (
        <section aria-labelledby='brief-tone'>
          <h2 id='brief-tone'>Tone and themes</h2>
          {words.length > 0 && <p>It feels {words.join(', ')}.</p>}
          {campaign.themes.length > 0 && <p>It is about {campaign.themes.join(', ')}.</p>}
        </section>
      )}
      {(weights.length > 0 || campaign.structure !== null) && (
        <section aria-labelledby='brief-play'>
          <h2 id='brief-play'>How it plays</h2>
          {weights.length > 0 && (
            <ul>
              {weights.map((pillar) => (
                <li key={pillar}>
                  {pillar[0]?.toUpperCase() + pillar.slice(1)}: {CAMPAIGN.pillar_words[campaign.pillars[pillar] ?? 0]}
                </li>
              ))}
            </ul>
          )}
          {campaign.structure !== null && <p>The campaign is {CAMPAIGN.structure_words[campaign.structure]}.</p>}
          {campaign.resolution_mode !== null && <p>Resolution: {campaign.resolution_mode}.</p>}
        </section>
      )}
      {campaign.truths.length > 0 && (
        <section aria-labelledby='brief-truths'>
          <h2 id='brief-truths'>What is true</h2>
          <ul>
            {campaign.truths.map((truth) => (
              <li key={truth}>{truth}</li>
            ))}
          </ul>
        </section>
      )}
      {campaign.characters !== '' && (
        <section aria-labelledby='brief-characters'>
          <h2 id='brief-characters'>The characters</h2>
          <p className='whitespace-pre-wrap'>{campaign.characters}</p>
        </section>
      )}
    </article>
  );
}
