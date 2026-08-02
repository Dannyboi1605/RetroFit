"use client";

import { useEffect } from "react";

export default function SaveToast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-20 z-[60] w-full max-w-app -translate-x-1/2 px-4"
    >
      <div className="border-2 border-tertiary bg-tertiary/10 px-4 py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-tertiary">
        {message}
      </div>
    </div>
  );
}
