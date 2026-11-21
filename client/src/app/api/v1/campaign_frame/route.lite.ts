// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { campaigns } from '~/lib/campaignRecords';

// GET /v1/campaign_frame (list, by name) and POST /v1/campaign_frame (create).
export const { GET, POST } = collectionRoutes(campaigns, localOwner);
