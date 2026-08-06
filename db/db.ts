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

class RetroFitDB extends Dexie {
  meals!: Table<Meal, string>;
  weightLogs!: Table<WeightLog, string>;
  syncQueue!: Table<{ client_id: string; table: "meals" | "weightLogs"; op: "insert" | "delete" | "update"; created_at: string }, string>;

  constructor() {
    super("retrofit");
    this.version(1).stores({
      meals: "client_id, logged_date, synced, deleted",
      weightLogs: "client_id, logged_date, synced, deleted",
      syncQueue: "client_id, created_at",
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
