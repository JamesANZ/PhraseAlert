"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VaguenessResult } from "@/types";

type Step = "input" | "clarify" | "compiling" | "done";

export function WatchCreator({ initialInput = "" }: { initialInput?: string }) {
  const router = useRouter();
  const [rawInput, setRawInput] = useState(initialInput);
  const [step, setStep] = useState<Step>(initialInput ? "compiling" : "input");
  const [vagueness, setVagueness] = useState<VaguenessResult | null>(null);
  const [selectedInterpretation, setSelectedInterpretation] = useState("");
  const [customClarification, setCustomClarification] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (initialInput && !started) {
      setStarted(true);
      void assessInput(initialInput);
    }
  }, [initialInput, started]);

  async function assessInput(input: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/watch/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_input: input }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login?callbackUrl=/watches/new");
          return;
        }
        throw new Error(data.error ?? "Failed to assess watch");
      }

      if (data.classification === "VAGUE") {
        setVagueness(data);
        setStep("clarify");
        return;
      }

      await confirmWatch(input, input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    } finally {
      setLoading(false);
    }
  }

  async function confirmWatch(input: string, clarified: string) {
    setLoading(true);
    setError("");
    setStep("compiling");
    try {
      const res = await fetch("/api/watch/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_input: input,
          clarified_statement: clarified,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login?callbackUrl=/watches/new");
          return;
        }
        throw new Error(data.error ?? "Failed to create watch");
      }
      setStep("done");
      router.push("/watches");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep(vagueness ? "clarify" : "input");
    } finally {
      setLoading(false);
    }
  }

  if (step === "compiling" || (loading && step !== "clarify")) {
    return (
      <div className="clarify-panel">
        <p className="loading mono">Compiling your watch…</p>
      </div>
    );
  }

  if (step === "clarify" && vagueness) {
    const options = vagueness.interpretations ?? [];
    return (
      <div className="clarify-panel">
        <div className="page-header">
          <h1>Clarify your watch</h1>
          <p>
            Your sentence could mean a few different things. Pick the closest
            match, or tweak it below.
          </p>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <p
          className="mono"
          style={{ color: "var(--brass)", fontSize: "0.9rem" }}
        >
          &quot;{rawInput}&quot;
        </p>
        <div className="clarify-options">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`clarify-option mono${selectedInterpretation === option ? " selected" : ""}`}
              onClick={() => {
                setSelectedInterpretation(option);
                setCustomClarification("");
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <label className="visually-hidden" htmlFor="custom-clarify">
          Or describe it differently
        </label>
        <textarea
          id="custom-clarify"
          className="clarify-custom"
          placeholder="Or describe it differently…"
          value={customClarification}
          onChange={(e) => {
            setCustomClarification(e.target.value);
            setSelectedInterpretation("");
          }}
        />
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading}
            onClick={() => {
              const clarified =
                customClarification.trim() || selectedInterpretation;
              if (!clarified) {
                setError("Pick an option or write a clarification.");
                return;
              }
              void confirmWatch(rawInput, clarified);
            }}
          >
            Confirm watch
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setStep("input");
              setVagueness(null);
              setError("");
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="clarify-panel">
      <div className="page-header">
        <h1>Create a watch</h1>
        <p>
          Describe a future event in one sentence. We&apos;ll compile it into a
          watch.
        </p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className={`watch-box${rawInput ? " is-focused" : ""}`}>
        <div className="watch-input-row">
          <input
            className="watch-input mono"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Tell me if Australian partner visa fees increase"
            onKeyDown={(e) => {
              if (e.key === "Enter" && rawInput.trim()) {
                void assessInput(rawInput.trim());
              }
            }}
          />
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading || !rawInput.trim()}
            onClick={() => void assessInput(rawInput.trim())}
          >
            Continue
          </button>
        </div>
      </div>
      <p className="hero-note" style={{ marginTop: 16 }}>
        <Link href="/watches">Back to your watches</Link>
      </p>
    </div>
  );
}
