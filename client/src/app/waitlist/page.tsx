// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Waitlist } from '~/components/landing/Waitlist';
import appConfig, { HOME_PATH } from '~/zephyrex.config';

export const metadata: Metadata = { title: 'Waitlist' };

/** The accounts waitlist. Lite has no accounts, so the one person goes straight to their chats. */
export default function WaitlistPage(): ReactNode {
  if (appConfig.auth?.enabled === false) redirect(HOME_PATH);
  return <Waitlist />;
}
