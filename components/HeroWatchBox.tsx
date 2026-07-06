"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  "Tell me if Australian partner visa fees increase…",
  "Notify me when Bitcoin passes $100,000…",
  "Tell me if Australia announces another lockdown…",
  "Let me know if Singapore changes its remote work visa rules…",
  "Tell me when a direct Sydney–Ulaanbaatar flight is announced…",
  "Notify me if this company announces an IPO…",
];

export function HeroWatchBox({ initialInput = "" }: { initialInput?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialInput);
  const [focused, setFocused] = useState(false);
  const [stamp, setStamp] = useState("");
  const [typeText, setTypeText] = useState("");
  const [ghostHidden, setGhostHidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({
    index: 0,
    char: 0,
    deleting: false,
    stopped: false,
  });

  useEffect(() => {
    const now = new Date();
    setStamp(
      `watching from ${now.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    );
  }, []);

  useEffect(() => {
    if (initialInput) {
      stateRef.current.stopped = true;
      setGhostHidden(true);
    }
  }, [initialInput]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || initialInput) {
      setTypeText(EXAMPLES[0]);
      return;
    }

    const TYPE_MS = 42;
    const DELETE_MS = 16;
    const HOLD_MS = 2100;
    const GAP_MS = 500;

    function tick() {
      if (stateRef.current.stopped) return;
      const sentence = EXAMPLES[stateRef.current.index];

      if (!stateRef.current.deleting) {
        stateRef.current.char += 1;
        setTypeText(sentence.slice(0, stateRef.current.char));
        if (stateRef.current.char === sentence.length) {
          stateRef.current.deleting = true;
          timerRef.current = setTimeout(tick, HOLD_MS);
          return;
        }
        timerRef.current = setTimeout(tick, TYPE_MS);
      } else {
        stateRef.current.char -= 1;
        setTypeText(sentence.slice(0, stateRef.current.char));
        if (stateRef.current.char === 0) {
          stateRef.current.deleting = false;
          stateRef.current.index =
            (stateRef.current.index + 1) % EXAMPLES.length;
          timerRef.current = setTimeout(tick, GAP_MS);
          return;
        }
        timerRef.current = setTimeout(tick, DELETE_MS);
      }
    }

    timerRef.current = setTimeout(tick, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [initialInput]);

  function stopTypewriter() {
    stateRef.current.stopped = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setGhostHidden(true);
  }

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitting(true);
    router.push(`/watches/new?input=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className={`watch-box${focused ? " is-focused" : ""}`}>
      <div className="watch-box-top">
        <span className="status-dot" aria-hidden="true" />
        <span className="watch-box-label">New watch</span>
        <span className="watch-box-stamp mono">{stamp}</span>
      </div>
      <div className="watch-input-row">
        <label className="visually-hidden" htmlFor="watch-input">
          Describe what you want to know about
        </label>
        <div className="watch-input-wrap">
          <input
            id="watch-input"
            className="watch-input mono"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              stopTypewriter();
              setValue(e.target.value);
            }}
            onFocus={() => {
              setFocused(true);
              stopTypewriter();
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            aria-label="Describe what you want to know about"
          />
          <span
            className={`type-ghost mono${ghostHidden || value ? " hidden" : ""}`}
            aria-hidden="true"
          >
            <span>{typeText}</span>
            <span className="cursor" />
          </span>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Starting…" : "Create watch"}
        </button>
      </div>
    </div>
  );
}
