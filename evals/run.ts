/**
 * @title Eval harness CLI
 * @notice Scores compiler, detector, filter, decide, dialogues, and live Tavily retrieval against fixtures.
 * @dev Run via `npm run eval` with flags: --compiler-only, --detector-only, --dialogues-only, --retrieval-only, --smoke.
 * @custom:phase 1
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessVagueness, compileWatchSpec } from "../lib/compiler";
import { decideFromEvidence } from "../lib/decide";
import { detectEvent } from "../lib/detector";
import { applyRetrievalFilters } from "../lib/filter";
import { getModel } from "../lib/inference";
import { retrieveCandidates } from "../lib/retrieval";
import {
  EvalDialoguesFileSchema,
  EvalEventsFileSchema,
  LiveRetrievalFileSchema,
  type EvalDialogue,
  type EvalEvent,
  type EvalScores,
  type LiveRetrievalCase,
  type Verdict,
} from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Mode =
  | "full"
  | "compiler-only"
  | "detector-only"
  | "dialogues-only"
  | "retrieval-only"
  | "smoke";

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--compiler-only")) return "compiler-only";
  if (args.includes("--detector-only")) return "detector-only";
  if (args.includes("--dialogues-only")) return "dialogues-only";
  if (args.includes("--retrieval-only")) return "retrieval-only";
  if (args.includes("--smoke")) return "smoke";
  return "full";
}

function loadEvents(): EvalEvent[] {
  const raw = readFileSync(join(__dirname, "events.json"), "utf-8");
  return EvalEventsFileSchema.parse(JSON.parse(raw)).events;
}

function loadDialogues(): EvalDialogue[] {
  const raw = readFileSync(join(__dirname, "dialogues.json"), "utf-8");
  return EvalDialoguesFileSchema.parse(JSON.parse(raw)).dialogues;
}

function loadLiveRetrievalCases(): LiveRetrievalCase[] {
  const raw = readFileSync(join(__dirname, "live-retrieval.json"), "utf-8");
  return LiveRetrievalFileSchema.parse(JSON.parse(raw)).cases;
}

function requireTavily(): void {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error(
      "TAVILY_API_KEY is required for live retrieval evals. Add it to .env.",
    );
  }
}

function verdictMatches(
  expected: Verdict | undefined,
  actual: Verdict,
): boolean {
  if (!expected) return true;
  return expected === actual;
}

function suggestionsMatchKeywords(
  interpretations: string[] | undefined,
  keywords: string[] | undefined,
): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = (interpretations ?? []).join(" ").toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

function domainsMatchKeywords(
  domains: string[],
  keywords: string[] | undefined,
): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = domains.join(" ").toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

/** Prefer authoritative domains when selecting which live candidates to judge. */
function prioritizeForJudging<T extends { domain: string }>(
  candidates: T[],
  authoritativeDomains: string[],
  limit: number,
): T[] {
  const auth = new Set(
    authoritativeDomains.map((d) => d.toLowerCase().replace(/^www\./, "")),
  );
  const isAuth = (domain: string) => {
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    return [...auth].some(
      (a) => normalized === a || normalized.endsWith(`.${a}`),
    );
  };
  const preferred = candidates.filter((c) => isAuth(c.domain));
  const rest = candidates.filter((c) => !isAuth(c.domain));
  return [...preferred, ...rest].slice(0, limit);
}

async function runCompilerEval(events: EvalEvent[]): Promise<boolean> {
  console.log("\n=== Compiler eval ===\n");
  let ok = 0;

  for (const event of events) {
    process.stdout.write(`  ${event.id} ... `);
    try {
      const spec = await compileWatchSpec(event.raw_input, {
        createdAt: event.created_at,
        clarifiedStatement: event.clarified_statement,
        id: `w_eval_${event.id}`,
      });

      const hasTriggers = spec.trigger_conditions.length > 0;
      const hasNonTriggers = spec.non_triggers.length > 0;
      const hasQueries = spec.search_queries.length > 0;

      if (hasTriggers && hasNonTriggers && hasQueries) {
        ok++;
        console.log("OK");
        console.log(
          `    clarified: ${spec.clarified_statement.slice(0, 80)}...`,
        );
      } else {
        console.log("FAIL (incomplete spec)");
      }
    } catch (err) {
      console.log(`FAIL (${err instanceof Error ? err.message : err})`);
    }
  }

  console.log(`\nCompiler: ${ok}/${events.length} produced valid specs`);
  return ok === events.length;
}

async function runDetectorEval(events: EvalEvent[]): Promise<EvalScores> {
  console.log("\n=== Detector + pipeline eval ===\n");
  console.log(`Model: ${getModel()}\n`);

  let fixtureTotal = 0;
  let fixtureCorrect = 0;
  let shouldTriggerEvents = 0;
  let shouldTriggerDetected = 0;
  let shouldNotTriggerEvents = 0;
  let shouldNotTriggerFalsePositives = 0;
  let distractorsTotal = 0;
  let distractorsDropped = 0;

  for (const event of events) {
    console.log(`--- ${event.id}: ${event.description}`);

    const spec = await compileWatchSpec(event.raw_input, {
      createdAt: event.created_at,
      clarifiedStatement: event.clarified_statement,
      id: `w_eval_${event.id}`,
    });

    const distractors = event.fixtures.filter((f) => f.label === "distractor");
    const candidates = event.fixtures.map((f) => f.candidate);
    const filtered = applyRetrievalFilters(candidates, event.created_at);
    const filteredUrls = new Set(filtered.map((c) => c.url));

    for (const d of distractors) {
      distractorsTotal++;
      if (!filteredUrls.has(d.candidate.url)) {
        distractorsDropped++;
        console.log(
          `  ✓ [distractor] dropped pre-watch — ${d.candidate.title.slice(0, 60)}`,
        );
      } else {
        console.log(
          `  ✗ [distractor] NOT dropped — ${d.candidate.title.slice(0, 60)}`,
        );
      }
    }

    const dropped = candidates.length - filtered.length;
    if (dropped > 0) {
      console.log(`  filter: dropped ${dropped} pre-watch fixture(s)`);
    }

    const evidence = [];
    for (const fixture of event.fixtures) {
      if (fixture.label === "distractor") continue;
      if (!filteredUrls.has(fixture.candidate.url)) continue;

      const detection = await detectEvent(spec, fixture.candidate);
      const match = verdictMatches(fixture.expect_verdict, detection.verdict);
      fixtureTotal++;
      if (match) fixtureCorrect++;

      const mark = match ? "✓" : "✗";
      console.log(
        `  ${mark} [${fixture.label}] ${detection.verdict} (${detection.confidence.toFixed(2)}) — ${fixture.candidate.title.slice(0, 60)}`,
      );
      if (!match) {
        console.log(
          `      expected: ${fixture.expect_verdict}, got: ${detection.verdict}`,
        );
        console.log(`      reasoning: ${detection.reasoning.slice(0, 120)}...`);
      }

      evidence.push({ candidate: fixture.candidate, detection });
    }

    const decision = decideFromEvidence(spec, evidence);

    if (event.expected_outcome === "should_trigger") {
      shouldTriggerEvents++;
      if (decision.should_notify) {
        shouldTriggerDetected++;
        console.log(`  → EVENT: TRIGGERED (notify)`);
      } else {
        console.log(`  → EVENT: MISSED (no notify) — ${decision.reasoning}`);
      }
    } else {
      shouldNotTriggerEvents++;
      if (decision.should_notify) {
        shouldNotTriggerFalsePositives++;
        console.log(`  → EVENT: FALSE POSITIVE`);
      } else {
        console.log(`  → EVENT: correctly silent`);
      }
    }

    console.log();
  }

  const detectionRate =
    shouldTriggerEvents === 0 ? 0 : shouldTriggerDetected / shouldTriggerEvents;
  const falsePositiveRate =
    shouldNotTriggerEvents === 0
      ? 0
      : shouldNotTriggerFalsePositives / shouldNotTriggerEvents;
  const filterPrecision =
    fixtureTotal === 0 ? 0 : fixtureCorrect / fixtureTotal;

  return {
    detection_rate: detectionRate,
    false_positive_rate: falsePositiveRate,
    filter_precision: filterPrecision,
    total_fixtures: fixtureTotal,
    triggered_count: fixtureCorrect,
    should_trigger_events: shouldTriggerEvents,
    should_trigger_detected: shouldTriggerDetected,
    should_not_trigger_events: shouldNotTriggerEvents,
    should_not_trigger_false_positives: shouldNotTriggerFalsePositives,
    distractors_dropped: distractorsDropped,
    distractors_total: distractorsTotal,
  };
}

async function runDialogueEval(dialogues: EvalDialogue[]): Promise<boolean> {
  console.log("\n=== Dialogue / vagueness smoke ===\n");
  console.log(`Model: ${getModel()}\n`);

  let dialoguesPassed = 0;

  for (const dialogue of dialogues) {
    console.log(`--- ${dialogue.id}: ${dialogue.description}`);
    let dialogueOk = true;

    for (let i = 0; i < dialogue.steps.length; i++) {
      const step = dialogue.steps[i]!;
      process.stdout.write(
        `  step ${i + 1}: "${step.input.slice(0, 50)}" ... `,
      );

      try {
        const vagueness = await assessVagueness(step.input);
        if (vagueness.classification !== step.expect_classification) {
          dialogueOk = false;
          console.log(
            `FAIL (expected ${step.expect_classification}, got ${vagueness.classification})`,
          );
          if (vagueness.reasoning) {
            console.log(`      reasoning: ${vagueness.reasoning}`);
          }
          continue;
        }

        if (
          step.expect_classification === "CLEAR" &&
          (vagueness.interpretations?.length ?? 0) > 0
        ) {
          dialogueOk = false;
          console.log("FAIL (CLEAR must not include suggestions)");
          console.log(
            `      got: ${(vagueness.interpretations ?? []).join(" | ")}`,
          );
          continue;
        }

        if (
          step.expect_classification === "VAGUE" &&
          !suggestionsMatchKeywords(
            vagueness.interpretations,
            step.expect_suggestion_keywords,
          )
        ) {
          dialogueOk = false;
          console.log("FAIL (suggestion keywords missing)");
          console.log(
            `      got: ${(vagueness.interpretations ?? []).join(" | ")}`,
          );
          continue;
        }

        if (step.expect_compile) {
          const spec = await compileWatchSpec(step.input, {
            createdAt: new Date().toISOString(),
            clarifiedStatement: step.input,
            id: `w_dialogue_${dialogue.id}_${i}`,
          });
          const complete =
            spec.trigger_conditions.length > 0 &&
            spec.non_triggers.length > 0 &&
            spec.search_queries.length > 0;
          if (!complete) {
            dialogueOk = false;
            console.log("FAIL (incomplete compile)");
            continue;
          }
          if (
            !domainsMatchKeywords(
              spec.authoritative_domains,
              step.expect_domain_keywords,
            )
          ) {
            dialogueOk = false;
            console.log("FAIL (authoritative domains miss expected keywords)");
            console.log(
              `      domains: ${spec.authoritative_domains.join(", ")}`,
            );
            continue;
          }
        }

        console.log(`OK (${vagueness.classification})`);
        if (vagueness.interpretations?.length) {
          console.log(
            `      suggestions: ${vagueness.interpretations.join(" | ")}`,
          );
        }
      } catch (err) {
        dialogueOk = false;
        console.log(`FAIL (${err instanceof Error ? err.message : err})`);
      }
    }

    if (dialogueOk) {
      dialoguesPassed++;
      console.log(`  → dialogue PASS\n`);
    } else {
      console.log(`  → dialogue FAIL\n`);
    }
  }

  console.log(`Dialogues: ${dialoguesPassed}/${dialogues.length} passed`);
  return dialoguesPassed === dialogues.length;
}

async function runLiveRetrievalEval(
  cases: LiveRetrievalCase[],
): Promise<boolean> {
  console.log("\n=== Live Tavily retrieval smoke ===\n");
  requireTavily();
  console.log(`Model: ${getModel()}\n`);

  let passed = 0;

  for (const liveCase of cases) {
    console.log(`--- ${liveCase.id}: ${liveCase.description}`);
    let caseOk = true;

    try {
      const spec = await compileWatchSpec(liveCase.raw_input, {
        createdAt: liveCase.created_at,
        clarifiedStatement: liveCase.clarified_statement,
        id: `w_live_${liveCase.id}`,
      });

      console.log(`  queries: ${spec.search_queries.join(" | ")}`);

      const retrieved = await retrieveCandidates(spec);
      const tavilyOk = retrieved.every((c) => c.retrieval_source === "tavily");
      const shapedOk = retrieved.every(
        (c) =>
          Boolean(c.url) &&
          Boolean(c.domain) &&
          Boolean(c.title) &&
          Boolean(c.snippet) &&
          Boolean(c.published_at),
      );

      console.log(`  retrieved: ${retrieved.length} candidate(s)`);
      if (retrieved.length === 0) {
        caseOk = false;
        console.log("  ✗ silent miss: no candidates from Tavily");
      } else if (retrieved.length < liveCase.require_min_retrieved) {
        caseOk = false;
        console.log(
          `  ✗ need ≥${liveCase.require_min_retrieved} retrieved results (got ${retrieved.length})`,
        );
      } else if (!tavilyOk || !shapedOk) {
        caseOk = false;
        console.log("  ✗ candidate shape or retrieval_source invalid");
      } else {
        console.log("  ✓ retrieval shape OK (tavily)");
      }

      for (const c of retrieved.slice(0, 3)) {
        console.log(`    - ${c.domain}: ${c.title.slice(0, 70)}`);
      }

      const filtered = applyRetrievalFilters(retrieved, liveCase.created_at);
      console.log(`  after filter: ${filtered.length} candidate(s)`);
      if (filtered.length < liveCase.require_min_after_filter) {
        caseOk = false;
        console.log(
          `  ✗ need ≥${liveCase.require_min_after_filter} post-filter candidates (got ${filtered.length})`,
        );
      } else {
        console.log("  ✓ filter kept post-watch candidates");
      }

      if (liveCase.expect_any_triggered) {
        if (filtered.length === 0) {
          caseOk = false;
          console.log(
            "  ✗ silent miss: cannot detect event — no post-filter candidates",
          );
        } else {
          const toJudge = prioritizeForJudging(
            filtered,
            spec.authoritative_domains,
            liveCase.max_candidates_to_judge,
          );
          console.log(
            `  judging ${toJudge.length} candidate(s) (auth domains first)`,
          );
          const evidence = [];
          let anyTriggered = false;

          for (const candidate of toJudge) {
            const detection = await detectEvent(spec, candidate);
            evidence.push({ candidate, detection });
            const mark = detection.verdict === "TRIGGERED" ? "✓" : "·";
            console.log(
              `  ${mark} ${detection.verdict} (${detection.confidence.toFixed(2)}) — ${candidate.title.slice(0, 55)}`,
            );
            if (detection.verdict === "TRIGGERED") anyTriggered = true;
          }

          const decision = decideFromEvidence(spec, evidence);
          console.log(
            `  decision: notify=${decision.should_notify} top=${decision.top_verdict}`,
          );

          if (!anyTriggered) {
            caseOk = false;
            console.log(
              "  ✗ silent miss: news retrieved but detector never fired",
            );
          } else if (!decision.should_notify) {
            caseOk = false;
            console.log(
              "  ✗ silent miss: TRIGGERED evidence found but decide did not notify (auth/corroboration failed)",
            );
          } else {
            console.log(
              "  ✓ live detection found TRIGGERED evidence and should_notify",
            );
          }
        }
      }
    } catch (err) {
      caseOk = false;
      console.log(`  FAIL (${err instanceof Error ? err.message : err})`);
    }

    if (caseOk) {
      passed++;
      console.log(`  → live case PASS\n`);
    } else {
      console.log(`  → live case FAIL\n`);
    }
  }

  console.log(`Live retrieval: ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

function printSummary(scores: EvalScores): boolean {
  console.log("=== Summary ===\n");
  console.log(
    `Fixture verdict accuracy: ${(scores.filter_precision * 100).toFixed(1)}% (${scores.triggered_count}/${scores.total_fixtures})`,
  );
  console.log(
    `Detection rate: ${(scores.detection_rate * 100).toFixed(1)}% (${scores.should_trigger_detected}/${scores.should_trigger_events} events)`,
  );
  console.log(
    `False positive rate: ${(scores.false_positive_rate * 100).toFixed(1)}% (${scores.should_not_trigger_false_positives}/${scores.should_not_trigger_events} never-events)`,
  );
  console.log(
    `Distractors dropped: ${scores.distractors_dropped}/${scores.distractors_total}`,
  );

  const targets = {
    detection: scores.detection_rate >= 0.9,
    falsePositive: scores.false_positive_rate <= 0.05,
    fixtureAccuracy: scores.filter_precision >= 0.85,
    distractors:
      scores.distractors_total === 0 ||
      scores.distractors_dropped === scores.distractors_total,
  };

  console.log("\nAcceptance targets (v0):");
  console.log(
    `  Detection ≥ 90%:        ${targets.detection ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  False positive ≤ 5%:    ${targets.falsePositive ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  Fixture accuracy ≥ 85%: ${targets.fixtureAccuracy ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  Pre-watch distractors:  ${targets.distractors ? "PASS" : "FAIL"}`,
  );

  return (
    targets.detection &&
    targets.falsePositive &&
    targets.fixtureAccuracy &&
    targets.distractors
  );
}

async function main(): Promise<void> {
  const mode = parseMode();
  const events = loadEvents();
  const dialogues = loadDialogues();
  const liveCases = loadLiveRetrievalCases();

  console.log(
    `PhraseAlert eval harness — ${events.length} events, ${dialogues.length} dialogues, ${liveCases.length} live retrieval cases`,
  );
  console.log(`Mode: ${mode}`);
  console.log(`Model: ${getModel()}`);

  let ok = true;

  if (mode === "compiler-only") {
    ok = (await runCompilerEval(events)) && ok;
    process.exit(ok ? 0 : 1);
  }

  if (mode === "detector-only") {
    const scores = await runDetectorEval(events);
    ok = printSummary(scores) && ok;
    process.exit(ok ? 0 : 1);
  }

  if (mode === "dialogues-only") {
    ok = (await runDialogueEval(dialogues)) && ok;
    process.exit(ok ? 0 : 1);
  }

  if (mode === "retrieval-only") {
    ok = (await runLiveRetrievalEval(liveCases)) && ok;
    process.exit(ok ? 0 : 1);
  }

  if (mode === "smoke" || mode === "full") {
    ok = (await runCompilerEval(events)) && ok;
    const scores = await runDetectorEval(events);
    ok = printSummary(scores) && ok;
    ok = (await runDialogueEval(dialogues)) && ok;
    ok = (await runLiveRetrievalEval(liveCases)) && ok;
    process.exit(ok ? 0 : 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
