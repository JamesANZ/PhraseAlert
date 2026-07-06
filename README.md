# Bellwether Alerts

**Tell us what you're waiting for. We'll tell you when it happens.**

Bellwether monitors the web for specific future events. You write a plain sentence like "Tell me if Australian partner visa fees increase" or "Notify me when Bitcoin passes $100,000". Bellwether checks for credible evidence that the event actually happened. If it did, you get notified. If not, you hear nothing.

## The problem

Most alert tools are keyword matchers. Google Alerts, RSS filters, and social listening fire whenever a page mentions the right words. That means:

- A guide titled "Complete guide to partner visa fees in 2026" triggers an alert, even though nothing changed.
- A forum thread asking "how much did your visa cost?" triggers an alert.
- The article that actually matters ("Home Affairs confirms fee increase from 1 July") shows up buried in noise you stopped reading weeks ago.

You end up checking manually anyway, or turning alerts off.

## What Bellwether does differently

Bellwether watches for the event, not the words.

| Keyword alert                                   | Bellwether watch                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Fires on any page containing related terms      | Fires only when credible evidence shows the event happened       |
| Cannot distinguish a guide from an announcement | Compiles explicit trigger and non-trigger conditions at creation |
| Surfaces old articles that happen to match      | Timestamped at creation; only post-watch information counts      |
| No reasoning trail                              | Stores what was found, what was evaluated, and why               |

A watch fires when the event happened, not when a page mentions related words. Each watch is also timestamped at creation, so only information published after that point can trigger it.

## Who it's for

Anyone waiting on a specific real-world outcome that doesn't have a clean push notification:

- Immigration and visas: fee changes, policy updates, processing time shifts
- Government and policy: legislative changes, regulatory decisions, official announcements
- Markets and crypto: price thresholds, rate decisions, earnings events
- Companies and launches: IPO announcements, product releases, route additions
- Science and medicine: trial results, drug approvals, regulatory decisions
- Local developments: council approvals, infrastructure decisions

If you can describe the event in a sentence, you can watch for it.

## Example

**Watch:** "Tell me if Australian partner visa fees increase."

| Source                                                        | Keyword alert                | Bellwether            |
| ------------------------------------------------------------- | ---------------------------- | --------------------- |
| "Complete guide to partner visa fees in 2026"                 | Alert sent                   | Checked, no change    |
| "Forum: how much did your partner visa cost?"                 | Alert sent                   | Checked, no change    |
| "Home Affairs confirms partner visa fee increase from 1 July" | Alert sent (buried in noise) | Notified: fee changed |

Three keyword alerts. One mattered. Bellwether sent that one.

## How it works

1. **Describe it.** Write a sentence for what you want to know.
2. **Compile.** A small model clarifies ambiguity and produces a structured watch spec: trigger conditions, non-triggers, search queries, authoritative domains.
3. **Watch.** On a schedule, the system retrieves new web content, filters out pre-watch and irrelevant results, and evaluates each candidate.
4. **Notify.** When credible evidence confirms the event occurred, you get an alert with the evidence trail.

## This repository

Phase 1 only:

- Watch compiler (vagueness + structured watch spec generation)
- Detection and decision pipeline
- Backdated eval harness with historical fixtures
- Hugging Face Inference integration for small-model testing

Not built yet: product UI, auth, scheduler, live retrieval APIs, billing.

## Architecture

- `lib/inference.ts` - Hugging Face chat client, model registry, JSON parsing
- `lib/compiler.ts` - user input to validated `WatchSpec`
- `lib/filter.ts` - forward-looking filter (drops pre-watch items and duplicates)
- `lib/detector.ts` - per-candidate verdict: `TRIGGERED | NOT_TRIGGERED | AMBIGUOUS`
- `lib/decide.ts` - notification logic (authoritative source or corroboration)
- `types/index.ts` - Zod schemas and shared types
- `evals/events.json` - historical events and fixture candidates
- `evals/run.ts` - eval runner with summary metrics

## Getting started

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```bash
HUGGINGFACE_API_KEY=hf_...
```

Optional model override:

```bash
HF_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
```

## Run evals

Full evaluation:

```bash
npm run eval
```

Compiler only:

```bash
npm run eval:compiler
```

Detector and decision pipeline:

```bash
npm run eval:detector
```

Type check:

```bash
npm run typecheck
```

## Acceptance targets (v0)

- Detection rate >= 90%
- False positive rate <= 5%
- Fixture-level verdict accuracy >= 85%

## Retrieval

Phase 1 evals use fixture candidates in `evals/events.json` to test the judgment layer. Live retrieval (Tavily, Brave, RSS) comes in Phase 2.

## Roadmap

- **Phase 2:** Next.js app, watch creation flow, dashboard, Postgres, cron, email notifications
- **Phase 3:** Stripe subscriptions, faster checks, SMS/push/webhooks, evidence trail UI
