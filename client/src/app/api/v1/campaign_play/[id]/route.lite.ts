// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { campaignPlays } from '~/lib/sessionRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/campaign_play/{id}.
export const { GET, PUT, DELETE } = recordRoutes(campaignPlays, localOwner);
