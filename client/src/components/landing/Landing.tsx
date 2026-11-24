// SPDX-License-Identifier: AGPL-3.0-or-later
import { CtaBand, FaqList, FeatureCard, Hero, Section, SiteFooter, SiteHeader } from '@zephyrex/marketing';
import type { ReactElement } from 'react';
import { RpgAiLogo } from '~/brand/RpgAiLogo';
import { CLOSING, COMPARE, FAQS, FEATURES, FOOTER, HERO, NAV, START } from '~/content/marketing';
import { APP_NAME } from '~/zephyrex.config';
import { SampleScene } from './SampleScene';

/** What the app is, for a visitor, and the way in. */
export function Landing({
  start = START,
  signIn,
}: {
  start?: { label: string; href: string };
  /** The header's way in for someone with an account (the hosted build: the hero's is the waitlist). */
  signIn?: { label: string; href: string };
}): ReactElement {
  return (
    <div className='flex min-h-svh w-full min-w-0 flex-col'>
      <SiteHeader
        brand={
          <>
            <RpgAiLogo />
            {APP_NAME}
          </>
        }
        nav={NAV}
        cta={signIn ?? start}
      />
      <main className='mx-auto w-full min-w-0 max-w-5xl space-y-20 px-4 pb-safe'>
        <Hero
          title={HERO.title}
          lead={HERO.lead}
          primary={start}
          secondary={{ label: 'See what it does', href: '#features' }}
          sample={<SampleScene />}
        />
        <Section id='features' title='What it does' eyebrow='Features'>
          <div className='grid gap-4 sm:grid-cols-2'>
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        </Section>
        <Section id='compare' title='Coming from SillyTavern?' eyebrow='How it compares'>
          {/* Scrolls sideways on a phone: focusable and named, so a keyboard can scroll it (WCAG 2.1.1). */}
          <div
            className='overflow-x-auto rounded-xl border focus-visible:outline-2 focus-visible:outline-ring'
            role='region'
            aria-label='How it compares with SillyTavern'
            tabIndex={0}
          >
            <table className='w-full min-w-[32rem] text-left text-sm'>
              <thead className='bg-muted/50'>
                <tr>
                  <th scope='col' className='p-3 font-semibold'>
                    <span className='sr-only'>Feature</span>
                  </th>
                  <th scope='col' className='p-3 font-semibold'>
                    {APP_NAME}
                  </th>
                  <th scope='col' className='p-3 font-semibold'>
                    SillyTavern
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {COMPARE.map((row) => (
                  <tr key={row.point}>
                    <th scope='row' className='p-3 font-medium'>
                      {row.point}
                    </th>
                    <td className='p-3'>{row.us}</td>
                    <td className='p-3 text-muted-foreground'>{row.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section id='faq' title='Questions' eyebrow='FAQ'>
          <FaqList faqs={FAQS} />
        </Section>
        <CtaBand title={CLOSING.title} body={CLOSING.body} action={start} />
        <SiteFooter columns={FOOTER} note={`${APP_NAME} is open source under the AGPL.`} />
      </main>
    </div>
  );
}
