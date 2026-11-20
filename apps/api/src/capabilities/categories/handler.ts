import { asc, eq } from 'drizzle-orm';
import type { Category, CreateCategoryInput } from '@repo/contracts';
import type { AppDb } from '../../core/db/client';
import { categories } from '../../core/db/schema';
import { generateId, mapCategoryRow } from '../shared/tx-helpers';

export async function listCategories(
  db: AppDb,
  userId: string,
): Promise<Category[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.defaultOrder), asc(categories.createdAt));

  return rows.map(mapCategoryRow);
}

export async function createCustomCategory(
  db: AppDb,
  userId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId));

  const [inserted] = await db
    .insert(categories)
    .values({
      id: generateId('cat'),
      userId,
      systemKey: null,
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      usageCount: 1,
      defaultOrder: existing.length,
      isCustom: true,
    })
    .returning();

  return mapCategoryRow(inserted);
}
