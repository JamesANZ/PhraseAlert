# PhraseAlert User Documentation

Generated 2026-07-23T05:45:23.107Z

## POST /api/billing/checkout:1

_app/api/billing/checkout/route.ts:1_

Start Stripe subscription, Stripe prepaid, or Helio checkout; returns redirect URL.

- **@custom:auth** Required session

## GET /api/billing/status:1

_app/api/billing/status/route.ts:1_

Returns plan, watch limit, active watch count, and billing period for the session user.

- **@custom:auth** Required session

## GET|POST /api/checks/run:1

_app/api/checks/run/route.ts:1_

Cron endpoint: run checks for all watches in `watching` status.

- **@dev** Vercel Cron invokes GET; POST kept for manual runs. Protected by
- **@dev** Authorization: Bearer CRON_SECRET when CRON_SECRET is set.
- **@custom:env** TAVILY_API_KEY, CRON_SECRET (optional)

## app/api/checks/run/route.ts:7

_app/api/checks/run/route.ts:7_

Batch check all active watches.

- **@return** 200 { ok, checked, triggered, errors, results } | 401 bad cron secret | 503 no Tavily

## POST /api/watch/[id]/check:1

_app/api/watch/[id]/check/route.ts:1_

Manually run one check now for a watching watch (dev / dashboard "Check now").

- **@dev** Full pipeline: Tavily retrieve → filter → detect → decide → persist.
- **@custom:auth** Required session
- **@custom:env** TAVILY_API_KEY

## app/api/watch/[id]/check/route.ts:8

_app/api/watch/[id]/check/route.ts:8_

Run check for one watch owned by the user.

- **@return** 200 check summary with evidence | 404 | 409 non-watching | 503 no Tavily key

## /api/watch/[id]:1

_app/api/watch/[id]/route.ts:1_

Get, pause/resume, or delete a single watch owned by the session user.

- **@custom:auth** Required session

## app/api/watch/[id]/route.ts:11

_app/api/watch/[id]/route.ts:11_

GET — fetch one watch by id.

## app/api/watch/[id]/route.ts:33

_app/api/watch/[id]/route.ts:33_

PATCH — pause or resume watch. Resume may 403 if at active watch limit.

## app/api/watch/[id]/route.ts:68

_app/api/watch/[id]/route.ts:68_

DELETE — permanently remove watch.

## POST /api/watch/confirm:1

_app/api/watch/confirm/route.ts:1_

Finalize and persist a watch after the user has clarified a CLEAR sentence.

- **@dev** Re-runs vagueness on clarified text, compiles WatchSpec, inserts watch row.
- **@custom:auth** Required session

## app/api/watch/confirm/route.ts:13

_app/api/watch/confirm/route.ts:13_

Compile and save watch.

- **@return** 200 { watch } | 400 still VAGUE | 403 watch limit | 401 unauthorized

## POST /api/watch/create:1

_app/api/watch/create/route.ts:1_

Assess vagueness of a watch sentence before saving (clarification step).

- **@dev** Does not persist a watch. Returns VaguenessResult for the WatchCreator UI.
- **@custom:auth** Required session

## app/api/watch/create/route.ts:12

_app/api/watch/create/route.ts:12_

Run vagueness classification on raw_input.

- **@return** 200 VaguenessResult | 401 unauthorized | 400 validation error

## Landing page:1

_app/page.tsx:1_

Marketing home with hero alert box, example alerts, and how-it-works sections.

## Alerts dashboard:1

_app/watches/page.tsx:1_

Server-rendered list of the user's alerts with plan/limit banner.

## HeroWatchBox:3

_components/HeroWatchBox.tsx:3_

Landing page watch input with rotating examples; routes to /watches/new with the sentence.

## WatchCreator:3

_components/WatchCreator.tsx:3_

Multi-step UI: enter sentence → clarify if vague → confirm and save watch.

- **@dev** Calls POST /api/watch/create for vagueness and POST /api/watch/confirm to persist.

## WatchList:3

_components/WatchList.tsx:3_

Dashboard list of saved watches with pause, resume, delete, and check-now actions.

- **@dev** Client component; mutates via /api/watch/[id] PATCH and DELETE.

## Eval harness CLI:1

_evals/run.ts:1_

Scores compiler, detector, filter, decide, dialogues, and live Tavily retrieval against fixtures.

- **@dev** Run via `npm run eval` with flags: --compiler-only, --detector-only, --dialogues-only, --retrieval-only, --smoke.
- **@custom:phase** 1

## Session helpers:1

_lib/auth/session.ts:1_

Thin wrappers around NextAuth `auth()` for API route user id enforcement.

## lib/auth/session.ts:4

_lib/auth/session.ts:4_

Require an authenticated session and return the user id.

- **@dev** Throws "Unauthorized" — map to HTTP 401 in route catch blocks.
- **@return** Session user id string.

## lib/auth/session.ts:14

_lib/auth/session.ts:14_

Return the current session user or null when logged out.

## NextAuth server configuration:1

_lib/auth.ts:1_

Auth.js setup with Drizzle adapter and Postgres user/session tables.

- **@dev** Exports handlers, auth, signIn, signOut. Schema ensure starts at module load.

## Downgrade watch enforcement:1

_lib/billing/enforce-limits.ts:1_

Pauses newest active watches when a user drops to free tier over the cap.

## lib/billing/enforce-limits.ts:13

_lib/billing/enforce-limits.ts:13_

Called when Plus expires so free users retain their 3 most recently created active watches.

- **@param** userId User whose excess watches should be paused.
- **@return** Summary of watches that were paused.

## Billing entitlements:1

_lib/billing/entitlements.ts:1_

Resolves effective plan, watch limits, and Plus grant/revoke for a user.

- **@dev** Plus is active for subscription (until period end) or prepaid (until planPeriodEnd).

## lib/billing/entitlements.ts:10

_lib/billing/entitlements.ts:10_

Snapshot returned by GET /api/billing/status.

## lib/billing/entitlements.ts:54

_lib/billing/entitlements.ts:54_

Active watch cap for a user id (free default if user missing).

## Check orchestrator:1

_lib/check.ts:1_

Runs one full retrieval → filter → detect → decide cycle for a single watch.

- **@dev** Phase 1+2 bridge. Persists check and evidence rows; updates watch status on notification.
- **@custom:pipeline** step 5 — check (orchestrates retrieve, filter, detect, decide)

## lib/check.ts:31

_lib/check.ts:31_

Execute a scheduled or manual check for one watch.

- **@dev** Skips already-seen URLs, evaluates up to MAX_CANDIDATES_TO_EVALUATE survivors, marks watch triggered when decision says notify.
- **@param** watch WatchRow with embedded WatchSpec.
- **@return** CheckRunResult with persisted check id and decision summary.

## Check and evidence persistence:1

_lib/checks.ts:1_

Records each check run and per-source evidence for audit trails and URL deduplication.

- **@dev** Phase 2. Confidence stored as 0–100 integer; evidence snippets truncated at insert.

## lib/checks.ts:28

_lib/checks.ts:28_

Insert a check record and return its id.

- **@dev** Id format: `chk_<uuid12>`. Confidence clamped to [0,1] then stored as percent.
- **@param** input Aggregated check metadata.
- **@return** New check id.

## lib/checks.ts:52

_lib/checks.ts:52_

Bulk-insert evidence rows for a check.

- **@param** checkId Parent check id from createCheck.
- **@param** rows Per-candidate detection outcomes.

## lib/checks.ts:73

_lib/checks.ts:73_

Normalized URLs previously stored as evidence for any check on this watch.

- **@dev** Used by applyRetrievalFilters to skip re-judging the same article.
- **@param** watchId Watch id.
- **@return** Set of normalized URLs.

## Watch compiler:1

_lib/compiler.ts:1_

Turns a plain-language watch sentence into a structured WatchSpec, with a vagueness gate first.

- **@dev** Phase 1 judgment layer. Uses Hugging Face chat completion via `completeJson` with strict system prompts.
- **@custom:pipeline** step 1 — compile

## lib/compiler.ts:66

_lib/compiler.ts:66_

Classify whether a watch sentence is specific enough to monitor.

- **@dev** First step in watch creation. Returns VAGUE with suggested concrete alternatives when rejected.
- **@param** rawInput User's watch sentence (3–500 chars at API layer).
- **@return** VaguenessResult with CLEAR or VAGUE classification.

## lib/compiler.ts:77

_lib/compiler.ts:77_

Compile a cleared watch sentence into a full WatchSpec ready for persistence.

- **@dev** Assigns id, user_id, created_at, check_frequency, and status unless overridden in options.
- **@param** rawInput Original user input (preserved on the spec).
- **@param** options.clarifiedStatement Final unambiguous statement after clarification.
- **@param** options.createdAt ISO timestamp anchoring the post-watch-only filter.
- **@param** options.id Optional watch id (defaults to `w_<uuid8>`).
- **@param** options.userId Owner user id.
- **@return** Validated WatchSpec.

## lib/compiler.ts:112

_lib/compiler.ts:112_

Combined vagueness check and compile for eval harness and smoke tests.

- **@dev** Skips compilation when classification is VAGUE.
- **@param** rawInput Watch sentence.
- **@param** createdAt Fixed timestamp for reproducible eval runs.
- **@return** Vagueness result and optional compiled spec.

## Product constants:1

_lib/constants.ts:1_

Tier limits and billing amounts shared across entitlements and UI.

- **@dev** Single source of truth for free vs plus watch caps and prepaid period length.

## lib/constants.ts:3

_lib/constants.ts:3_

Maximum active (non-paused) watches on the free plan.

## lib/constants.ts:6

_lib/constants.ts:6_

Maximum active watches when Plus is active.

## lib/constants.ts:9

_lib/constants.ts:9_

Plus subscription price in US cents ($9.00/month).

## Neon Postgres database bootstrap:1

_lib/db/index.ts:1_

Drizzle client over Neon's serverless HTTP driver, plus idempotent schema ensure.

- **@dev** Requires DATABASE_URL (Neon). Call await initDb() before first API use.

## lib/db/index.ts:26

_lib/db/index.ts:26_

Create tables if missing (safe on every cron/API cold start).

- **@dev** Idempotent; concurrent callers share one in-flight init.

## Database schema (Drizzle Postgres / Neon):1

_lib/db/schema.ts:1_

Table definitions for auth, billing, watches, checks, and evidence.

- **@dev** WatchSpec stored as JSONB on watches.spec. NextAuth adapter tables follow Auth.js conventions.

## lib/db/schema.ts:15

_lib/db/schema.ts:15_

NextAuth user row extended with plan and Stripe/Helio billing fields.

## watches:125

_lib/db/schema.ts:125_

User-created event watches with embedded compiled WatchSpec JSON.

## Notification decision layer:1

_lib/decide.ts:1_

Aggregates per-source detection verdicts and decides whether to notify the user.

- **@dev** Phase 1 judgment layer. Implements corroboration: authoritative high-confidence OR two independent triggers.
- **@custom:pipeline** step 4 — decide

## lib/decide.ts:37

_lib/decide.ts:37_

Decide whether evidence from a check warrants user notification.

- **@dev** Notification paths: (1) authoritative source ≥0.75 confidence TRIGGERED, or (2) ≥2 TRIGGERED from distinct domains.
- **@dev** Single non-authoritative trigger sets needs_corroboration without notifying.
- **@param** spec Watch spec (for authoritative domain list).
- **@param** evidence Filtered candidates with detection results from this check.
- **@return** DecideResult with should_notify, top verdict, and human-readable reasoning.

## Event detector:1

_lib/detector.ts:1_

Judges whether a single web source shows the watched event actually occurred.

- **@dev** Phase 1 judgment layer. Not keyword matching — requires credible evidence of the event post-watch.
- **@custom:pipeline** step 3 — detect

## lib/detector.ts:26

_lib/detector.ts:26_

Run detection for one retrieval candidate against a WatchSpec.

- **@dev** Includes trigger/non-trigger conditions and watch creation timestamp in the user prompt.
- **@param** spec Compiled watch specification.
- **@param** candidate Filtered web source to evaluate.
- **@return** DetectionResult plus the HF model id used for this call.

## Retrieval filters:1

_lib/filter.ts:1_

Drops candidates that are too old, already evaluated, or on a denylist before detection.

- **@dev** Phase 1 judgment layer. Enforces the post-watch-only rule central to PhraseAlert's value prop.
- **@custom:pipeline** step 2 — filter

## lib/filter.ts:4

_lib/filter.ts:4_

Canonicalize a URL for deduplication across check runs.

- **@dev** Strips hash fragments and trailing slashes. Invalid URLs pass through unchanged.
- **@param** url Raw candidate URL.
- **@return** Normalized URL string.

## lib/filter.ts:18

_lib/filter.ts:18_

True when the source was published on or after the watch was created.

- **@dev** Pre-watch articles (guides, old news) must not trigger alerts.
- **@param** candidate Retrieval candidate with published_at.
- **@param** watchCreatedAt ISO datetime from watch creation.

## lib/filter.ts:26

_lib/filter.ts:26_

Apply post-watch, dedup, and domain deny filters to a candidate list.

- **@dev** Called after Tavily retrieval and before detection. Order preserved from input.
- **@param** candidates Raw retrieval results.
- **@param** watchCreatedAt Watch creation timestamp for temporal filter.
- **@param** seenUrls Normalized URLs from prior checks on this watch (default empty).
- **@param** denylistDomains Hostnames to exclude (default empty).
- **@return** Filtered candidates eligible for detection.

## Hugging Face inference client:1

_lib/inference.ts:1_

Shared LLM completion layer for compiler, detector, and eval harness.

- **@dev** Uses @huggingface/inference chatCompletion with low temperature for structured JSON outputs.
- **@custom:env** HUGGINGFACE_API_KEY (required), HF_MODEL (optional override)

## lib/inference.ts:29

_lib/inference.ts:29_

Resolve the active model id from env or default.

- **@return** Model string passed to chatCompletion.

## lib/inference.ts:34

_lib/inference.ts:34_

Run a chat completion and parse the assistant message as JSON.

- **@dev** temperature 0.1, max_tokens 1200. Use Zod schemas on `parsed` at call sites.
- **@param** systemPrompt System role instructions (compiler/detect/vagueness prompts).
- **@param** userPrompt User role content (watch text, candidate source, etc.).
- **@param** model Optional model override.
- **@return** Raw text, parsed JSON, and model id.

## lib/inference.ts:55

_lib/inference.ts:55_

Extract JSON from model output, including fenced ```json blocks.

- **@dev** Falls back to first `{...}` substring if direct parse fails.
- **@param** text Raw assistant message.
- **@return** Parsed value cast to T (caller should validate with Zod).

## Live retrieval orchestrator:1

_lib/retrieval/index.ts:1_

Runs Tavily search and extract for a WatchSpec's search_queries and builds RetrievalCandidates.

- **@dev** Phase 2. Constrains results to post-watch window via Tavily start_date; dedupes by normalized URL.
- **@custom:pipeline** step 2 — retrieve
- **@custom:env** TAVILY_API_KEY

## lib/retrieval/index.ts:78

_lib/retrieval/index.ts:78_

Retrieve web candidates for a watch using its compiled search_queries.

- **@dev** Merges search results, optionally enriches top URLs via extract, returns RetrievalCandidate[].
- **@param** spec WatchSpec with search_queries and created_at.
- **@param** options.retrievedAt Fallback published_at when Tavily omits dates.
- **@return** Deduplicated candidates ready for applyRetrievalFilters.

## Tavily API client:1

_lib/retrieval/tavily.ts:1_

Thin fetch wrapper for Tavily /search and /extract endpoints.

- **@dev** Used by lib/retrieval/index.ts. Requires TAVILY_API_KEY in environment.
- **@custom:env** TAVILY_API_KEY

## lib/retrieval/tavily.ts:80

_lib/retrieval/tavily.ts:80_

Run a Tavily web search for one query string.

- **@param** query Search phrase from WatchSpec.search_queries.
- **@param** opts maxResults, searchDepth, startDate (YYYY-MM-DD), topic.

## lib/retrieval/tavily.ts:100

_lib/retrieval/tavily.ts:100_

Fetch full or chunked page content for a list of URLs.

- **@param** urls Up to MAX_EXTRACT_URLS in practice from retrieval layer.
- **@param** opts query + chunksPerSource for relevance-focused excerpts.

## Watch persistence:1

_lib/watches.ts:1_

CRUD and quota enforcement for user watches stored in Postgres via Drizzle.

- **@dev** Phase 2 product layer. Active watch count excludes paused; limits come from billing entitlements.

## lib/watches.ts:32

_lib/watches.ts:32_

Count non-paused watches for quota checks.

- **@param** userId Authenticated user id.

## lib/watches.ts:41

_lib/watches.ts:41_

True when user is under their plan's active watch limit.

## lib/watches.ts:46

_lib/watches.ts:46_

True when resuming a paused watch would not exceed the limit.

## lib/watches.ts:51

_lib/watches.ts:51_

List all watches for a user, newest first.

- **@param** userId Owner id.

## lib/watches.ts:61

_lib/watches.ts:61_

Fetch one watch scoped to owner.

- **@return** WatchRow or null if not found / wrong user.

## lib/watches.ts:75

_lib/watches.ts:75_

Persist a compiled WatchSpec as a new watch.

- **@dev** Throws if watch limit exceeded. Embeds user_id on the stored spec JSON.
- **@param** spec Compiled WatchSpec from compiler.
- **@param** userId Owner id.
- **@return** Created WatchRow.

## lib/watches.ts:108

_lib/watches.ts:108_

Update watch lifecycle status (pause, resume, or mark triggered).

- **@dev** Resume enforces active watch limit. Setting triggered records triggeredAt timestamp.
- **@return** Updated WatchRow or null if not found.

## lib/watches.ts:142

_lib/watches.ts:142_

Permanently delete a watch for the owning user.

- **@return** True if a row was deleted.

## lib/watches.ts:154

_lib/watches.ts:154_

All watches in `watching` status — used by the cron check runner.

- **@dev** Not scoped to user; internal scheduler only.

## Auth middleware:1

_middleware.ts:1_

Redirects unauthenticated users to /login for protected app routes.

- **@dev** Matcher covers /watches/* and /billing. Public landing and API routes are excluded.

## NatSpec comment extractor:1

_scripts/extract-natspec.ts:1_

Walks TypeScript sources and emits userdoc + devdoc JSON from /** ... *\/ blocks.

- **@dev** Run: npm run docs:extract — writes docs/natspec-userdoc.json and docs/natspec-devdoc.json

## PhraseAlert core types:1

_types/index.ts:1_

Shared Zod schemas and TypeScript types for watches, detection, retrieval, and eval fixtures.

- **@dev** All runtime validation flows through these schemas. API routes and the judgment pipeline import from here.
- **@custom:phase** 1

## types/index.ts:4

_types/index.ts:4_

Lifecycle state of a saved watch. @dev `paused` watches are excluded from cron checks and active-watch limits.

## types/index.ts:8

_types/index.ts:8_

How often a watch is scheduled for retrieval and judgment. @dev Hourly is reserved for future tiers.

## WatchSpec:12

_types/index.ts:12_

Structured specification produced when a user's sentence is compiled into a monitorable watch.

- **@dev** Persisted as JSON on the `watches` row. Drives search queries, detection prompts, and notification rules.
- **@custom:pipeline** compile → retrieve → filter → detect → decide

## VaguenessResult:29

_types/index.ts:29_

Outcome of the vagueness gate before a watch can be saved.

- **@dev** CLEAR proceeds to compilation; VAGUE returns up to three concrete alternative sentences.

## types/index.ts:37

_types/index.ts:37_

Per-source judgment on whether credible evidence shows the watched event occurred.

- **@dev** TRIGGERED does not alone imply notification — `decideFromEvidence` applies corroboration rules.

## types/index.ts:45

_types/index.ts:45_

LLM output for a single retrieval candidate against a WatchSpec.

## RetrievalCandidate:54

_types/index.ts:54_

A web page (or fixture) candidate passed to the detector after retrieval and filtering.

- **@dev** `published_at` must be on or after watch creation for the candidate to survive filtering.

## EvalEvent:75

_types/index.ts:75_

A historical scenario used by the eval harness to score detection quality without live retrieval.

## LiveRetrievalCase:131

_types/index.ts:131_

Integration eval that hits Tavily with real queries and exercises the full check pipeline.
