// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { lorebooks } from '~/lib/loreRecords';

// GET /v1/lorebook (list) and POST /v1/lorebook (create), as server-framework answers them.
export const { GET, POST } = collectionRoutes(lorebooks, localOwner);
