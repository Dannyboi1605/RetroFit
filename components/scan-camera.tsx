"use client";

import { useEffect, useRef, useState } from "react";

const MAX_IMAGE_DIMENSION = 1024;

// ponytail: downscale client-side so the data URL stays under the 1MB server
// action body limit (full-res photos blow past it and fail before the action
// runs) and under OpenRouter's per-image cap. The camera path already does
// this via canvas, which is why uploads were the only failing path.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

export default function ScanCamera({
  onCapture,
  onError,
}: {
  onCapture: (dataUrl: string) => void;
  onError: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.8));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      onCapture(await fileToDataUrl(file));
    } catch {
      onError("Could not read that file — try another photo");
    }
  }

  if (cameraFailed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="w-full border-2 border-dashed border-outline-variant bg-surface-container p-6 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
          Camera Unavailable — use the file picker
        </div>
        <label className="pixel-btn w-full cursor-pointer">
          <span className="material-symbols-outlined text-base">photo_library</span>
          Choose Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden border-2 border-outline-variant bg-surface-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ opacity: cameraReady ? 1 : 0 }}
        />
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
            Starting camera...
          </div>
        )}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-4 top-4 h-1 border-x-2 border-t-2 border-tertiary" />
          <div className="absolute inset-x-4 bottom-4 h-1 border-x-2 border-b-2 border-tertiary" />
          <div className="absolute inset-y-4 left-4 w-1 border-y-2 border-l-2 border-tertiary" />
          <div className="absolute inset-y-4 right-4 w-1 border-y-2 border-r-2 border-tertiary" />
        </div>
        {cameraReady && <div className="scanline-anim pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/60" />}
      </div>
      <button className="pixel-btn w-full" onClick={capture} disabled={!cameraReady}>
        <span className="material-symbols-outlined text-base">camera_alt</span>
        Capture
      </button>
      <style>{`@keyframes scanline-anim { 0% { top: 0% } 100% { top: 100% } } .scanline-anim { animation: scanline-anim 2.5s linear infinite; }`}</style>
    </div>
  );
}
