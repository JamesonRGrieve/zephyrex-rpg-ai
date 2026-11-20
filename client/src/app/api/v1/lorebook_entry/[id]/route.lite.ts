// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { lorebookEntries } from '~/lib/loreRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/lorebook_entry/{id}, as server-framework answers them.
export const { GET, PUT, DELETE } = recordRoutes(lorebookEntries, localOwner);
