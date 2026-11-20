// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { quickReplies } from '~/lib/quickReplyRecords';

// GET /v1/quick_reply (list, in order) and POST /v1/quick_reply (create).
export const { GET, POST } = collectionRoutes(quickReplies, localOwner);
