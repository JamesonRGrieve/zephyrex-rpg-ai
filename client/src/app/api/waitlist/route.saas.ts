// SPDX-License-Identifier: AGPL-3.0-or-later
// The hosted build's waitlist (a route only there: next.config.js's `saas.ts` page extension). It hands each
// sign-up to the Zephyrex ERP's CRM from this server, so the page's CSP stays 'self'.
import { createWaitlistRoute } from '@zephyrex/marketing';
import { WAITLIST_APP, WAITLIST_WEB_FORM } from '~/features/waitlist';

export const { POST } = createWaitlistRoute({ webForm: WAITLIST_WEB_FORM, app: WAITLIST_APP, enquiry: 'accounts' });
