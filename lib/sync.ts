import { db } from "@/db/db";
import { supabase } from "@/lib/supabase/client";

const TABLES: Record<string, { table: string; columns: string }> = {
  meals: {
    table: "logged_meals",
    columns: "client_id, logged_date, meal_type, name, calories, protein_g, carbs_g, fat_g, source",
  },
  weightLogs: {
    table: "weight_logs",
    columns: "client_id, logged_date, weight_kg, note",
  },
};

const INT_COLUMNS = new Set(["calories", "protein_g", "carbs_g", "fat_g"]);

function toPayload(local: Record<string, unknown>, user: { id: string }, columns: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { user_id: user.id };
  for (const col of columns.split(", ")) {
    if (!(col in local)) continue;
    const v = local[col];
    payload[col] = INT_COLUMNS.has(col) && typeof v === "number" ? Math.round(v) : v;
  }
  return payload;
}

export async function pushPending(): Promise<number> {
  const queue = await db.syncQueue.orderBy("created_at").toArray();
  if (queue.length === 0) return 0;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  let processed = 0;
  for (const entry of queue) {
    const meta = TABLES[entry.table];
    if (!meta) continue;

    if (entry.op === "insert") {
      const local = (await db[entry.table].get(entry.client_id)) as Record<string, unknown> | undefined;
      if (!local || local.deleted === 1) continue;

      const payload = toPayload(local, user, meta.columns);

      const { error } = await supabase.from(meta.table).insert(payload);

      if (error && !error.message.includes("duplicate")) {
        console.error("sync insert failed", entry.client_id, error.message);
        continue;
      }

      await db[entry.table].update(entry.client_id, { synced: 1 });
      await db.syncQueue.delete(entry.client_id);
      processed++;
    } else if (entry.op === "update") {
      const local = (await db[entry.table].get(entry.client_id)) as Record<string, unknown> | undefined;
      if (!local || local.deleted === 1) continue;

      const payload = toPayload(local, user, meta.columns);

      const { error } = await supabase.from(meta.table).upsert(payload, { onConflict: "client_id" });

      if (error) {
        console.error("sync update failed", entry.client_id, error.message);
        continue;
      }

      await db[entry.table].update(entry.client_id, { synced: 1 });
      await db.syncQueue.delete(entry.client_id);
      processed++;
    } else if (entry.op === "delete") {
      await supabase.from(meta.table).delete().eq("client_id", entry.client_id);
      await db[entry.table].delete(entry.client_id);
      await db.syncQueue.delete(entry.client_id);
      processed++;
    }
  }

  return processed;
}

let syncStarted = false;

export function initSync() {
  if (syncStarted) return;
  syncStarted = true;

  const run = () => {
    if (navigator.onLine) pushPending();
  };

  window.addEventListener("online", run);
  setInterval(run, 15000);
}
