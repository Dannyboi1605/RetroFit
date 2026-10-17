"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone permission denied — allow access or type your meal instead",
  "service-not-allowed": "Speech recognition is blocked in this browser — type your meal instead",
  "audio-capture": "No microphone found — type your meal instead",
  network: "Speech recognition needs a network connection",
  "no-speech": "Didn't catch that — try speaking again",
};

const noopSubscribe = () => () => {};

export default function VoiceInput({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (text: string) => void;
  onError: (msg: string) => void;
}) {
  // null until hydrated: Web Speech support lives only on the client.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
    () => null as boolean | null
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // recognition callbacks are bound once per session, so read the latest typed
  // text through a ref rather than a stale closure.
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function start() {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      onError("Voice input is not supported in this browser — type your meal instead");
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      setInterim("");
      setListening(true);
    };
    recognition.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const chunk = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (finalText) {
        const current = valueRef.current.trimEnd();
        onChange(current ? `${current} ${finalText.trim()}` : finalText.trim());
      }
      setInterim(interimText);
    };
    recognition.onerror = (ev) => {
      onError(ERROR_MESSAGES[ev.error] ?? `Speech recognition error (${ev.error})`);
      setInterim("");
      setListening(false);
    };
    recognition.onend = () => {
      setInterim("");
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // start() throws if a session is already active — ignore
    }
  }

  function stop() {
    recognitionRef.current?.stop();
  }

  if (supported === false) {
    return (
      <div className="border-2 border-dashed border-outline-variant bg-surface-container p-4 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
        Voice not supported in this browser — type your meal below
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className={`w-full ${listening ? "pixel-btn-danger" : "pixel-btn"}`}
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        disabled={supported === null}
      >
        <span className="material-symbols-outlined text-base">{listening ? "stop_circle" : "mic"}</span>
        {listening ? "Listening... tap to stop" : "Tap to Speak"}
      </button>
      <div aria-live="polite" className="min-h-[1.5rem] px-1 font-mono text-xs text-tertiary">
        {listening && (
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined animate-pulse text-base">graphic_eq</span>
            {interim || "Listening..."}
          </span>
        )}
      </div>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
        Transcript (edit before analyzing)
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder='e.g. "two roti canai and a teh tarik"'
          className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm normal-case text-on-surface outline-none focus:border-primary-container"
        />
      </label>
    </div>
  );
}
