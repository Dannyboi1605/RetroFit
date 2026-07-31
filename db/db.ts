import Dexie, { type Table } from "dexie";

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
  syncQueue!: Table<{ client_id: string; table: "meals" | "weightLogs"; op: "insert" | "delete"; created_at: string }, string>;

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
      source: "manual",
      created_at: now,
      synced: 0,
      deleted: 0,
    });
    await db.syncQueue.add({ client_id, table: "meals", op: "insert", created_at: now });
  });
  return client_id;
}

export async function deleteMeal(clientId: string): Promise<void> {
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    await db.meals.update(clientId, { deleted: 1 });
    await db.syncQueue.add({
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
