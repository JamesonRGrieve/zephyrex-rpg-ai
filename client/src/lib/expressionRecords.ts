// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's expression sprites (A4): one picture per expression label for a character
 * (one of the owner's), each label once per character. The same resource, fields and rules as the
 * SaaS server's. Listed by `?character_id=`.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { EXPRESSION, LIMITS } from '~/contract';
import { type Columns, columnsOf, fieldsOf, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const COLUMNS: Columns = { character_id: plain('characterId'), label: plain('label'), image: plain('image') };
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

const label = z
  .string()
  .trim()
  .min(1)
  .max(EXPRESSION.label_characters)
  .regex(/^[\p{L}\p{N} _-]+$/u, 'A label is a word or two');
const image = z.string().max(LIMITS.avatar_bytes).regex(DATA_URL, 'A sprite is a PNG, JPEG, WebP or GIF data URL');
const create = z.object({ character_id: z.string().min(1), label, image });
const update = z.object({ label, image }).partial();

type Row = Prisma.CharacterExpressionGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

async function checkLabel(ownerId: string, characterId: string, newLabel: string, exceptId: string | null): Promise<void> {
  const clash = await prisma.characterExpression.findFirst({
    where: { createdById: ownerId, characterId, label: newLabel, ...(exceptId === null ? {} : { NOT: { id: exceptId } }) },
  });
  if (clash !== null) throw validationError('That character already has a sprite for this label', 'label');
}

export const characterExpressions: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'character_expression',
  plural: 'character_expressions',
  modelName: 'CharacterExpressionModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId, query) =>
    prisma.characterExpression.findMany({
      where: {
        createdById: ownerId,
        ...(query.get('character_id') === null ? {} : { characterId: query.get('character_id') ?? '' }),
      },
      orderBy: { label: 'asc' },
    }),
  find: (id, ownerId) => prisma.characterExpression.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    if ((await prisma.character.count({ where: { id: input.character_id, createdById: ownerId } })) === 0)
      throw validationError('That character is not one of yours', 'character_id');
    if (
      (await prisma.characterExpression.count({ where: { createdById: ownerId, characterId: input.character_id } })) >=
      EXPRESSION.per_character
    ) {
      throw validationError(`At most ${EXPRESSION.per_character} sprites a character`, 'character_id');
    }
    await checkLabel(ownerId, input.character_id, input.label, null);
    return prisma.characterExpression.create({
      data: { createdById: ownerId, ...written(input, stamp) } as Prisma.CharacterExpressionUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const row = await prisma.characterExpression.findUnique({ where: { id } });
    if (row !== null && input.label !== undefined) await checkLabel(row.createdById, row.characterId, input.label, id);
    const { count } = await prisma.characterExpression.updateMany({
      where: { id, updatedAt: version },
      data: written(input, stamp, userId) as Prisma.CharacterExpressionUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.characterExpression.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.characterExpression.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};
