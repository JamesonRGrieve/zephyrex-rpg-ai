// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { campaignPlays } from '~/lib/sessionRecords';

// GET /v1/campaign_play (?chat_id=) and POST /v1/campaign_play: which chats are campaigns, and their seats.
export const { GET, POST } = collectionRoutes(campaignPlays, localOwner);
