// SPDX-License-Identifier: AGPL-3.0-or-later
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Landing } from '~/components/landing/Landing';
import { WAITLIST_PAGE } from '~/features/waitlist';
import appConfig, { HOME_PATH } from '~/zephyrex.config';

/** The cookie a sign-in leaves that pages can read (the framework's CSRF echo). */
const SESSION_HINT_COOKIE = 'zx_csrf';

/**
 * The landing page, for visitors. Lite has no accounts, so the one person goes straight to their
 * chats. In the hosted build someone signed in goes there too; a stale cookie is caught by the
 * session check there, which sends them to sign in.
 */
export default async function Home(): Promise<ReactNode> {
  const accounts = appConfig.auth?.enabled !== false;
  if (!accounts || (await cookies()).has(SESSION_HINT_COOKIE)) redirect(HOME_PATH);
  // The way in is the waitlist, never sign-up (SOP Waitlist and Sign-up Gate); sign-in stays in the header.
  return (
    <Landing
      start={{ label: 'Join the waitlist', href: WAITLIST_PAGE }}
      signIn={{ label: 'Sign in', href: appConfig.auth?.authPath ?? '/user' }}
    />
  );
}
