"use client";

/**
 * @title WatchCreator
 * @notice Multi-step UI: enter sentence → clarify if vague → confirm and save watch.
 * @dev Calls POST /api/watch/create for vagueness and POST /api/watch/confirm to persist.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VaguenessResult } from "@/types";

type Step = "input" | "clarify" | "compiling" | "done";

const MAX_CLARIFY_TURNS = 5;

export function WatchCreator({ initialInput = "" }: { initialInput?: string }) {
  const router = useRouter();
  const [rawInput, setRawInput] = useState(initialInput);
  const [currentStatement, setCurrentStatement] = useState(initialInput);
  const [step, setStep] = useState<Step>(initialInput ? "compiling" : "input");
  const [vagueness, setVagueness] = useState<VaguenessResult | null>(null);
  const [clarifyTrail, setClarifyTrail] = useState<string[]>([]);
  const [clarifyTurns, setClarifyTurns] = useState(0);
  const [selectedInterpretation, setSelectedInterpretation] = useState("");
  const [customClarification, setCustomClarification] = useState("");
  const [error, setError] = useState("");
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (initialInput && !started) {
      setStarted(true);
      void assessInput(initialInput, { isOriginal: true });
    }
  }, [initialInput, started]);

  function resetClarifyState() {
    setVagueness(null);
    setClarifyTrail([]);
    setClarifyTurns(0);
    setSelectedInterpretation("");
    setCustomClarification("");
  }

  async function assessInput(
    input: string,
    options: {
      isOriginal?: boolean;
      trail?: string[];
      turns?: number;
      originalInput?: string;
    } = {},
  ) {
    const { isOriginal = false, trail, turns, originalInput } = options;
    const original = isOriginal
      ? input
      : (originalInput ?? (rawInput || input));
    setLoading(true);
    setError("");
    setUpgradeUrl(null);
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
        if (data.upgradeUrl) setUpgradeUrl(data.upgradeUrl);
        throw new Error(data.error ?? "Failed to assess alert");
      }

      if (isOriginal) {
        setRawInput(input);
        setClarifyTrail([]);
        setClarifyTurns(0);
      }

      setCurrentStatement(input);
      setSelectedInterpretation("");
      setCustomClarification("");

      if (data.classification === "VAGUE") {
        const nextTurns = turns ?? (isOriginal ? 1 : clarifyTurns + 1);
        setClarifyTurns(nextTurns);
        if (trail) setClarifyTrail(trail);
        setVagueness(data);
        setStep("clarify");
        if (nextTurns >= MAX_CLARIFY_TURNS) {
          setError(
            "Still too vague after several rounds. Write a more specific sentence with entity, outcome, and scope.",
          );
        }
        return;
      }

      await confirmWatch(original, input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep(vagueness ? "clarify" : "input");
    } finally {
      setLoading(false);
    }
  }

  async function confirmWatch(originalInput: string, clarified: string) {
    setLoading(true);
    setError("");
    setUpgradeUrl(null);
    setStep("compiling");
    try {
      const res = await fetch("/api/watch/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_input: originalInput,
          clarified_statement: clarified,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login?callbackUrl=/watches/new");
          return;
        }
        if (data.upgradeUrl) setUpgradeUrl(data.upgradeUrl);

        if (data.classification === "VAGUE") {
          setCurrentStatement(clarified);
          setVagueness({
            classification: "VAGUE",
            interpretations: data.interpretations,
            reasoning: data.reasoning,
          });
          setClarifyTurns((t) => t + 1);
          setError(
            data.error ??
              "That alert is still too vague. Pick a more specific option.",
          );
          setStep("clarify");
          return;
        }

        throw new Error(data.error ?? "Failed to create alert");
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

  function continueWithClarification() {
    const clarified = customClarification.trim() || selectedInterpretation;
    if (!clarified) {
      setError("Pick an option or write a clarification.");
      return;
    }
    if (clarifyTurns >= MAX_CLARIFY_TURNS && !customClarification.trim()) {
      setError(
        "Write a more specific phrase. A topic name alone is not enough for an alert.",
      );
      return;
    }
    const nextTrail = [...clarifyTrail, currentStatement];
    setClarifyTrail(nextTrail);
    void assessInput(clarified, {
      trail: nextTrail,
      turns: clarifyTurns + 1,
      originalInput: rawInput,
    });
  }

  if (step === "compiling" || (loading && step !== "clarify")) {
    return (
      <div className="clarify-panel">
        <p className="loading mono">
          {step === "compiling"
            ? "Creating your alert…"
            : "Checking specificity…"}
        </p>
      </div>
    );
  }

  if (step === "clarify" && vagueness) {
    const options = vagueness.interpretations ?? [];
    return (
      <div className="clarify-panel">
        <div className="page-header">
          <h1>Make the phrase more specific</h1>
          <p>
            We need one clear outcome to watch for. Pick the closest match, or
            rewrite the phrase in your own words.
          </p>
        </div>
        {error && (
          <div className="error-banner">
            {error}
            {upgradeUrl && (
              <>
                {" "}
                <Link href={upgradeUrl}>Upgrade to Plus</Link>
              </>
            )}
          </div>
        )}
        {clarifyTrail.length > 0 && (
          <ol className="clarify-trail mono">
            {clarifyTrail.map((item) => (
              <li key={item}>&quot;{item}&quot;</li>
            ))}
          </ol>
        )}
        <p className="clarify-current">
          You said: &quot;{currentStatement}&quot;
        </p>
        <div className="clarify-options">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`clarify-option${selectedInterpretation === option ? " selected" : ""}`}
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
          Or describe it more specifically
        </label>
        <textarea
          id="custom-clarify"
          className="clarify-custom"
          placeholder="Or write a more specific phrase…"
          value={customClarification}
          onChange={(e) => {
            setCustomClarification(e.target.value);
            setSelectedInterpretation("");
          }}
        />
        <div className="form-actions">
          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="button"
              disabled={loading}
              onClick={continueWithClarification}
            >
              Continue
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setStep("input");
                resetClarifyState();
                setError("");
              }}
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="clarify-panel">
      <div className="page-header">
        <h1>Create an alert</h1>
        <p>
          Write what you want to get alerted on in plain English. We&apos;ll ask
          if it&apos;s unclear.
        </p>
      </div>
      {error && (
        <div className="error-banner">
          {error}
          {upgradeUrl && (
            <>
              {" "}
              <Link href={upgradeUrl}>Upgrade to Plus</Link>
            </>
          )}
        </div>
      )}
      <div className={`watch-box${rawInput ? " is-focused" : ""}`}>
        <div className="watch-input-row">
          <input
            className="watch-input"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Tell me when mortgage rates drop below 5%"
            onKeyDown={(e) => {
              if (e.key === "Enter" && rawInput.trim()) {
                void assessInput(rawInput.trim(), { isOriginal: true });
              }
            }}
          />
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading || !rawInput.trim()}
            onClick={() =>
              void assessInput(rawInput.trim(), { isOriginal: true })
            }
          >
            Continue
          </button>
        </div>
      </div>
      <p className="hero-note" style={{ marginTop: 16 }}>
        <Link href="/watches">Back to my alerts</Link>
      </p>
    </div>
  );
}
