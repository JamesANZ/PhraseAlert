import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileWatchSpec } from "../lib/compiler";
import { decideFromEvidence } from "../lib/decide";
import { detectEvent } from "../lib/detector";
import { applyRetrievalFilters } from "../lib/filter";
import { getModel } from "../lib/inference";
import {
  EvalEventsFileSchema,
  type EvalEvent,
  type EvalScores,
  type Verdict,
} from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Mode = "full" | "compiler-only" | "detector-only";

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--compiler-only")) return "compiler-only";
  if (args.includes("--detector-only")) return "detector-only";
  return "full";
}

function loadEvents(): EvalEvent[] {
  const raw = readFileSync(join(__dirname, "events.json"), "utf-8");
  return EvalEventsFileSchema.parse(JSON.parse(raw)).events;
}

function verdictMatches(
  expected: Verdict | undefined,
  actual: Verdict,
): boolean {
  if (!expected) return true;
  return expected === actual;
}

async function runCompilerEval(events: EvalEvent[]): Promise<void> {
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

  for (const event of events) {
    console.log(`--- ${event.id}: ${event.description}`);

    const spec = await compileWatchSpec(event.raw_input, {
      createdAt: event.created_at,
      clarifiedStatement: event.clarified_statement,
      id: `w_eval_${event.id}`,
    });

    const candidates = event.fixtures.map((f) => f.candidate);
    const filtered = applyRetrievalFilters(candidates, event.created_at);
    const dropped = candidates.length - filtered.length;
    if (dropped > 0) {
      console.log(`  filter: dropped ${dropped} pre-watch fixture(s)`);
    }

    const evidence = [];
    for (const fixture of event.fixtures) {
      if (!filtered.some((c) => c.url === fixture.candidate.url)) continue;

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
  };
}

function printSummary(scores: EvalScores): void {
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

  const targets = {
    detection: scores.detection_rate >= 0.9,
    falsePositive: scores.false_positive_rate <= 0.05,
    fixtureAccuracy: scores.filter_precision >= 0.85,
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
}

async function main(): Promise<void> {
  const mode = parseMode();
  const events = loadEvents();

  console.log(`Bellweather eval harness — ${events.length} events`);
  console.log(`Mode: ${mode}`);

  if (mode === "compiler-only") {
    await runCompilerEval(events);
    return;
  }

  if (mode === "detector-only") {
    const scores = await runDetectorEval(events);
    printSummary(scores);
    return;
  }

  await runCompilerEval(events);
  const scores = await runDetectorEval(events);
  printSummary(scores);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
