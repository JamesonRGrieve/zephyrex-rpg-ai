// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { instructTemplates } from '~/lib/instructTemplateRecords';

// GET /v1/instruct_template (list, by name) and POST /v1/instruct_template (create).
export const { GET, POST } = collectionRoutes(instructTemplates, localOwner);
