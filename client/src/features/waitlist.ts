// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Accounts on the hosted service are waitlist only while sign-up is closed (operator, 2026-11-23/24; SOP
 * Zephyrex Framework App Standards → Waitlist and Sign-up Gate): a visitor leaves an email, and the app's
 * own route (app/api/waitlist/route.saas.ts) hands it to the Zephyrex ERP's CRM as a lead through rpg-ai's
 * web form. Sign-in stays open.
 */

/** The page with the waitlist form (SIGNUP_DISABLED_PATH points here when sign-up is closed). */
export const WAITLIST_PAGE = '/waitlist';

/** rpg-ai's web form in the Zephyrex ERP (asked of Zephyrex ERP, 2026-11-24). */
export const WAITLIST_WEB_FORM = 'waitlist-rpg-ai';

/** The name the lead's enquiry starts with ("Zephyrex RPG waitlist: …"), as the ERP's sales views tell apps apart. */
export const WAITLIST_APP = 'Zephyrex RPG';
