// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { lorebookEntries } from '~/lib/loreRecords';

// GET /v1/lorebook_entry (list) and POST /v1/lorebook_entry (create), as server-framework answers them.
export const { GET, POST } = collectionRoutes(lorebookEntries, localOwner);
