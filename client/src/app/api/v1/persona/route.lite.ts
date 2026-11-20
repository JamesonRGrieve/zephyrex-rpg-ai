// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { personas } from '~/lib/rpgRecords';

// GET /v1/persona (list) and POST /v1/persona (create), as server-framework answers them.
export const { GET, POST } = collectionRoutes(personas, localOwner);
