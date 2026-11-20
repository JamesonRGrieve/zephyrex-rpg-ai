// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { scenarios } from '~/lib/campaignRecords';

// GET /v1/scenario (list, by name) and POST /v1/scenario (create).
export const { GET, POST } = collectionRoutes(scenarios, localOwner);
