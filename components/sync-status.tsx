"use client";

import { useEffect, useState } from "react";
import { db } from "@/db/db";
import { initSync, pushPending } from "@/lib/sync";
import SaveToast from "@/components/save-toast";

export default function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    initSync();
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    let stopped = false;
    async function poll() {
      if (stopped) return;
      setPending(await db.syncQueue.count());
      setTimeout(poll, 5000);
    }
    poll();

    return () => {
      stopped = true;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div className="snes-window flex flex-col gap-4 p-4">
      <h2 className="flex items-center gap-2 border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
        <span className="material-symbols-outlined text-xl">sync</span>
        Sync Status
      </h2>
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
          Queue
        </div>
        <div className="font-mono text-base font-bold text-primary">{pending} pending</div>
      </div>
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
          Network
        </div>
        <div className={`font-mono text-base font-bold ${online ? "text-tertiary" : "text-error"}`}>
          {online ? "ONLINE" : "OFFLINE"}
        </div>
      </div>
      <button
        className="pixel-btn w-full"
        disabled={pushing || pending === 0}
        onClick={async () => {
          setPushing(true);
          try {
            await pushPending();
            setFlash("Synced!");
          } finally {
            setPushing(false);
          }
          setPending(await db.syncQueue.count());
        }}
      >
        <span className="material-symbols-outlined text-base">cloud_upload</span>
        {pushing ? "Pushing..." : "Push Now"}
      </button>

      {flash && <SaveToast key={flash} message={flash} onDone={() => setFlash(null)} />}
    </div>
  );
}
