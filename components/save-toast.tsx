"use client";

import { useEffect } from "react";

export default function SaveToast({
  message,
  onDone,
  actionLabel,
  onAction,
  durationMs = 2500,
}: {
  message: string;
  onDone: () => void;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [onDone, durationMs]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-20 z-[60] w-full max-w-app -translate-x-1/2 px-4"
    >
      <div className="flex items-center justify-center gap-3 border-2 border-tertiary bg-surface-container-lowest/70 px-4 py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-tertiary backdrop-blur-md">
        <span>{message}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            className="pointer-events-auto border-2 border-tertiary-container px-2 py-0.5 text-tertiary-container transition-colors hover:bg-tertiary-container hover:text-background"
            onClick={() => {
              onAction();
              onDone();
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
