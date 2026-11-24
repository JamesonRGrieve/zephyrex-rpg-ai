// SPDX-License-Identifier: AGPL-3.0-or-later
import { SiteHeader, WaitlistForm } from '@zephyrex/marketing';
import type { ReactElement } from 'react';
import { RpgAiLogo } from '~/brand/RpgAiLogo';
import { NAV } from '~/content/marketing';
import appConfig, { APP_NAME } from '~/zephyrex.config';

/** Accounts on the hosted service, waitlist only for now: the form, and sign-in for those who have one. */
export function Waitlist(): ReactElement {
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
        cta={{ label: 'Sign in', href: appConfig.auth?.authPath ?? '/user' }}
      />
      <main className='mx-auto w-full min-w-0 max-w-2xl px-4 pt-12 pb-safe'>
        <WaitlistForm
          level={1}
          title='Accounts are waitlist only for now'
          body={
            <p>
              An account keeps your characters, campaigns and chats on every device, with an AI game master that plays by
              your VTT&apos;s rules. Leave your email and we&apos;ll write when accounts open. Already have one? Sign in
              above.
            </p>
          }
        />
      </main>
    </div>
  );
}
