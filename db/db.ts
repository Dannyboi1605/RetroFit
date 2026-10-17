import Dexie, { type Table } from "dexie";
import { dateStr } from "@/lib/date";

export type MealIngredient = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  amount?: string;
  unit?: string;
};

export type Meal = {
  client_id: string;
  user_id?: string;
  logged_date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "manual" | "ai_scan" | "barcode" | "custom_favorite";
  ingredients?: MealIngredient[];
  created_at: string;
  synced: 0 | 1;
  deleted: 0 | 1;
};

export type WeightLog = {
  client_id: string;
  logged_date: string;
  weight_kg: number;
  note?: string;
  created_at: string;
  synced: 0 | 1;
  deleted: 0 | 1;
};

export type Favorite = {
  client_id: string;
  name: string;
  name_key: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients?: MealIngredient[];
  created_at: string;
  deleted: 0 | 1;
};

export type RecentFood = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients?: MealIngredient[];
};

export function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase();
}

class RetroFitDB extends Dexie {
  meals!: Table<Meal, string>;
  weightLogs!: Table<WeightLog, string>;
  favorites!: Table<Favorite, string>;
  syncQueue!: Table<{ client_id: string; table: "meals" | "weightLogs"; op: "insert" | "delete" | "update"; created_at: string }, string>;

  constructor() {
    super("retrofit");
    this.version(1).stores({
      meals: "client_id, logged_date, synced, deleted",
      weightLogs: "client_id, logged_date, synced, deleted",
      syncQueue: "client_id, created_at",
    });
    this.version(2).stores({
      meals: "client_id, logged_date, synced, deleted",
      weightLogs: "client_id, logged_date, synced, deleted",
      syncQueue: "client_id, created_at",
      favorites: "client_id, name_key, deleted",
    });
  }
}

export const db = new RetroFitDB();

export async function addMeal(input: {
  logged_date: string;
  meal_type: Meal["meal_type"];
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source?: Meal["source"];
  ingredients?: MealIngredient[];
}): Promise<string> {
  const client_id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    await db.meals.add({
      client_id,
      logged_date: input.logged_date,
      meal_type: input.meal_type,
      name: input.name,
      calories: input.calories,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
      source: input.source ?? "manual",
      ingredients: input.ingredients,
      created_at: now,
      synced: 0,
      deleted: 0,
    });
    await db.syncQueue.add({ client_id, table: "meals", op: "insert", created_at: now });
  });
  return client_id;
}

export async function updateMeal(clientId: string, patch: Partial<Meal>): Promise<void> {
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    const row = await db.meals.get(clientId);
    if (!row || row.deleted === 1) return;
    const now = new Date().toISOString();
    await db.meals.update(clientId, { ...patch, created_at: row.created_at });
    if (row.synced === 1) {
      // ponytail: put not add — queue holds one op per client_id, latest op wins
      await db.syncQueue.put({ client_id: clientId, table: "meals", op: "update", created_at: now });
    }
  });
}

export async function deleteMeal(clientId: string): Promise<void> {
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    await db.meals.update(clientId, { deleted: 1 });
    await db.syncQueue.put({
      client_id: clientId,
      table: "meals",
      op: "delete",
      created_at: new Date().toISOString(),
    });
  });
}

export async function listMeals(date: string): Promise<Meal[]> {
  return db.meals
    .where("logged_date")
    .equals(date)
    .filter((m) => m.deleted === 0)
    .sortBy("created_at");
}

export async function addWeight(input: {
  logged_date: string;
  weight_kg: number;
  note?: string;
}): Promise<string> {
  const client_id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.transaction("rw", [db.weightLogs, db.syncQueue], async () => {
    const existing = await db.weightLogs.where("logged_date").equals(input.logged_date).first();
    if (existing) {
      const queued = await db.syncQueue.where("client_id").equals(existing.client_id).toArray();
      await db.syncQueue.bulkDelete(queued.map((q) => q.client_id));
      if (existing.synced === 1) {
        await db.syncQueue.add({ client_id: existing.client_id, table: "weightLogs", op: "delete", created_at: now });
      }
      await db.weightLogs.delete(existing.client_id);
    }
    await db.weightLogs.add({
      client_id,
      logged_date: input.logged_date,
      weight_kg: input.weight_kg,
      note: input.note,
      created_at: now,
      synced: 0,
      deleted: 0,
    });
    await db.syncQueue.add({ client_id, table: "weightLogs", op: "insert", created_at: now });
  });
  return client_id;
}

export async function deleteWeight(clientId: string): Promise<void> {
  await db.transaction("rw", [db.weightLogs, db.syncQueue], async () => {
    await db.weightLogs.update(clientId, { deleted: 1 });
    await db.syncQueue.put({
      client_id: clientId,
      table: "weightLogs",
      op: "delete",
      created_at: new Date().toISOString(),
    });
  });
}

export async function listWeightLogs(rangeDays?: number): Promise<WeightLog[]> {
  const all = await db.weightLogs
    .filter((w) => w.deleted === 0)
    .sortBy("logged_date");
  if (!rangeDays) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = dateStr(cutoff);
  return all.filter((w) => w.logged_date >= cutoffStr);
}

export async function addFavorite(input: {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients?: MealIngredient[];
}): Promise<string> {
  const name_key = normalizeFoodName(input.name);
  const now = new Date().toISOString();
  return db.transaction("rw", db.favorites, async () => {
    const existing = await db.favorites
      .where("name_key")
      .equals(name_key)
      .filter((f) => f.deleted === 0)
      .first();
    if (existing) {
      await db.favorites.update(existing.client_id, { ...input, name_key, created_at: now });
      return existing.client_id;
    }
    const client_id = crypto.randomUUID();
    await db.favorites.add({ client_id, name_key, ...input, created_at: now, deleted: 0 });
    return client_id;
  });
}

export async function deleteFavorite(clientId: string): Promise<void> {
  await db.favorites.update(clientId, { deleted: 1 });
}

export async function listFavorites(): Promise<Favorite[]> {
  const all = await db.favorites.filter((f) => f.deleted === 0).sortBy("created_at");
  return all.reverse();
}

export async function toggleFavorite(meal: {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients?: MealIngredient[];
}): Promise<boolean> {
  const name_key = normalizeFoodName(meal.name);
  const existing = await db.favorites
    .where("name_key")
    .equals(name_key)
    .filter((f) => f.deleted === 0)
    .first();
  if (existing) {
    await deleteFavorite(existing.client_id);
    return false;
  }
  await addFavorite(meal);
  return true;
}

export async function listRecentFoods(limit = 8): Promise<RecentFood[]> {
  const all = await db.meals.filter((m) => m.deleted === 0).sortBy("created_at");
  all.reverse();
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const m of all) {
    const key = normalizeFoodName(m.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: m.name,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      ingredients: m.ingredients,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function previousLoggedDate(beforeDate: string): Promise<string | null> {
  const all = await db.meals
    .filter((m) => m.deleted === 0 && m.logged_date < beforeDate)
    .sortBy("logged_date");
  if (all.length === 0) return null;
  return all[all.length - 1].logged_date;
}

export async function copyMeals(
  fromDate: string,
  toDate: string,
  mealType?: Meal["meal_type"]
): Promise<number> {
  let source = await listMeals(fromDate);
  if (mealType) source = source.filter((m) => m.meal_type === mealType);
  if (source.length === 0) return 0;
  for (const m of source) {
    await addMeal({
      logged_date: toDate,
      meal_type: m.meal_type,
      name: m.name,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      source: m.source,
      ingredients: m.ingredients ? JSON.parse(JSON.stringify(m.ingredients)) : undefined,
    });
  }
  return source.length;
}
