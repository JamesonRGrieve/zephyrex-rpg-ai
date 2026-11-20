// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { campaigns } from '~/lib/campaignRecords';

// GET /v1/campaign (list, by name) and POST /v1/campaign (create).
export const { GET, POST } = collectionRoutes(campaigns, localOwner);
