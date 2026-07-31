# PhraseAlert

**Write a phrase. Get alerted when it's true.**

PhraseAlert monitors the web for specific future events. You write a phrase like "Tell me if Australian partner visa fees increase" or "Notify me when Bitcoin passes $100,000". PhraseAlert checks for credible evidence that the phrase has become true. If it has, you get notified. If not, you hear nothing.

## The problem

Most alert tools are keyword matchers. Google Alerts, RSS filters, and social listening fire whenever a page mentions the right words. That means:

- A guide titled "Complete guide to partner visa fees in 2026" triggers an alert, even though nothing changed.
- A forum thread asking "how much did your visa cost?" triggers an alert.
- The article that actually matters ("Home Affairs confirms fee increase from 1 July") shows up buried in noise you stopped reading weeks ago.

You end up checking manually anyway, or turning alerts off.

## What PhraseAlert does differently

PhraseAlert watches for your phrase coming true, not every mention of the topic.

| Keyword alert                                   | PhraseAlert                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Fires on any page containing related terms      | Fires only when credible evidence shows the event happened       |
| Cannot distinguish a guide from an announcement | Compiles explicit trigger and non-trigger conditions at creation |
| Surfaces old articles that happen to match      | Timestamped at creation; only post-watch information counts      |
| No reasoning trail                              | Stores what was found, what was evaluated, and why               |

A watch fires when the event happened, not when a page mentions related words. Each watch is timestamped at creation. Only information with a confirmed event date on or after that point can trigger a notification.

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

| Source                                                        | Keyword alert                | PhraseAlert           |
| ------------------------------------------------------------- | ---------------------------- | --------------------- |
| "Complete guide to partner visa fees in 2026"                 | Alert sent                   | Checked, no change    |
| "Forum: how much did your partner visa cost?"                 | Alert sent                   | Checked, no change    |
| "Home Affairs confirms partner visa fee increase from 1 July" | Alert sent (buried in noise) | Notified: fee changed |

Three keyword alerts. One mattered. PhraseAlert sent that one.

## How it works

1. **Describe it.** Write a specific future event in one sentence. Topic keywords alone (e.g. "Bitcoin") are rejected.
2. **Clarify until clear.** If the sentence is vague, PhraseAlert suggests more specific alert sentences and will not save until it is unambiguous.
3. **Compile.** A model produces a structured watch spec: trigger conditions, non-triggers, search queries, authoritative domains, and a monitoring plan (baseline queries, follow-ups, optional page revisits).
4. **Watch.** A 15-minute cron runs due checks based on the owner's plan. Each round retrieves web content via Tavily, filters out pre-watch and irrelevant results, evaluates candidates, and may dig deeper (follow-up queries / re-fetch known pages) when evidence is thin.
5. **Notify.** When credible evidence confirms the event occurred _after_ the alert was created, you get email (and SMS on Plus/Max if a phone is saved). The same findings appear on the alert detail page.

## This repository

PhraseAlert is a Next.js App Router product with a judgment layer, live retrieval, plan-gated check cadence, email + SMS notifications, Stripe/Helio billing, and a dashboard.

**Judgment layer**

- Watch compiler (strict vagueness + structured watch spec + monitoring plan)
- Detection and decision pipeline (high-confidence confirmation or two independent triggers)
- AI monitoring planner: after a non-notify round, may dig deeper once or schedule an earlier recheck (clamped to the plan ceiling)
- Hard lock: notify only when TRIGGERED evidence has a parseable event date on/after watch creation
- Backdated eval harness with historical fixtures, multi-turn dialogue smoke, page-revisit cases, and live Tavily retrieval
- Hugging Face Inference Providers (default `meta-llama/Llama-3.3-70B-Instruct`)

**Product**

- Landing page with hero alert composer and Free / Plus / Max pricing
- Create flow with clarification at `/watches/new`
- Dashboard at `/watches` (“My alerts”) with Active / Triggered filters, pause, resume, delete, and check-now
- Alert detail / findings page at `/watches/[id]` (same content as the trigger email)
- Billing at `/billing`: current plan, checkout (card or crypto), Stripe portal, optional SMS phone
- Google sign-in via NextAuth
- Neon Postgres via Drizzle (Vercel-ready)
- Checks cron every 15 minutes at `GET|POST /api/checks/run` (plan baseline / ceiling + time budget)
- HTML trigger emails via Resend; optional SMS via Twilio on Plus/Max

In the UI, saved items are called **alerts**. In code and APIs they are still **watches**.

Auth uses NextAuth with Google sign-in only. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI for local development.

## Billing (Free / Plus / Max)

Premium is fully wired: three tiers, Stripe card checkout (subscription + prepaid), Helio crypto prepaid, Twilio SMS on paid plans, and automatic pause-on-downgrade. Caps and cadences live in `lib/constants.ts`.

| Plan | Active alerts | Quiet baseline | Fastest AI follow-up | Notifications | Price        |
| ---- | ------------- | -------------- | -------------------- | ------------- | ------------ |
| Free | 3             | ~daily (23h)   | ~daily (23h)         | Email         | $0           |
| Plus | 25            | Every 6h       | Hourly               | Email + SMS   | $9.99/month  |
| Max  | 100           | Hourly         | Every 15 minutes     | Email + SMS   | $39.99/month |

Only alerts with status `watching` count toward the limit. Triggered and paused alerts do not.

### What paid unlocks

- **More active alerts** — Free 3 → Plus 25 → Max 100
- **Faster checks** — Plus baseline every 6h (AI can pull forward to hourly); Max baseline hourly (AI can pull forward to every 15 minutes)
- **SMS** — Plus and Max can save an E.164 phone on `/billing` and receive a short Twilio SMS when an alert triggers (email still always sends)

Free stays email-only with roughly daily checks.

### How to pay

Checkout is `POST /api/billing/checkout` with `{ method, plan }` where `plan` is `plus` or `max`:

| Method           | Provider                 | Mode                     | Notes                                    |
| ---------------- | ------------------------ | ------------------------ | ---------------------------------------- |
| `stripe_sub`     | Stripe Checkout          | Recurring monthly        | Manage/cancel via Stripe Customer Portal |
| `stripe_prepaid` | Stripe Checkout          | One-time (30-day access) | Top up before `planPeriodEnd`            |
| `helio`          | Helio / MoonPay Commerce | One-time crypto (30-day) | Optional dedicated Max pay link          |

Users can:

- **Subscribe** with a card for Plus or Max (or upgrade Free/Plus → Max)
- **Pay one month** with a card or crypto for Plus or Max
- **Top up** prepaid months before they expire (reminders at 7, 3, and 1 days)
- **Add a phone** on Plus/Max for SMS (`PUT /api/billing/phone`; optional test SMS)

When a paid plan expires unpaid (or a Stripe subscription is canceled), the account returns to Free and newest active (`watching`) alerts are paused until at most 3 remain (oldest stay active). Downgrades use the same pause-newest rule when moving to a lower cap.

Checks cron runs every 15 minutes (`vercel.json`). Each watch is due from the owner's plan baseline, or sooner when the planner schedules a follow-up — never faster than the plan ceiling. Each cron invocation has a soft ~50s time budget so long runs defer remaining work to the next tick.

### Stripe setup

1. Create Product “PhraseAlert Plus” with recurring monthly price ($9.99) → `STRIPE_PRICE_ID_PLUS_MONTHLY`
2. Create Product “PhraseAlert Max” with recurring monthly price ($39.99) → `STRIPE_PRICE_ID_MAX_MONTHLY`
3. Optional one-time prepaid prices → `STRIPE_PRICE_ID_PLUS_PREPAID` / `STRIPE_PRICE_ID_MAX_PREPAID` (otherwise Checkout uses inline `price_data`)
4. Add webhook endpoint `POST /api/billing/webhook/stripe` for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Enable Customer Portal in Stripe Dashboard for cancel/update card
6. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and optionally `STRIPE_PUBLISH_KEY`

### Helio setup

1. Create a Plus pay link → `HELIO_PAYLINK_ID` (optional Max pay link → `HELIO_PAYLINK_ID_MAX`; otherwise the Plus link is charged at the Max amount)
2. Public API key → `HELIO_API_KEY`, secret → `HELIO_SECRET_KEY`
3. Global webhook to `POST /api/billing/webhook/helio` → store `sharedToken` as `HELIO_WEBHOOK_SECRET`

### SMS (Twilio)

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. Users save a phone on `/billing`. Without Twilio env vars, paid users still get email; SMS is skipped with a warning log.

### Expiry emails

Set `RESEND_API_KEY` and `EMAIL_FROM`. Daily cron `GET|POST /api/billing/run` (09:00 UTC; see `vercel.json`) sends prepaid reminders and applies downgrades. Protect with `CRON_SECRET`.

## App structure

```
app/
  page.tsx                 Landing page (pricing: Free / Plus / Max)
  login/page.tsx           Google sign-in
  billing/page.tsx         Plan status + checkout + SMS phone
  watches/page.tsx         My alerts dashboard
  watches/new/page.tsx     Create + clarify flow
  watches/[id]/page.tsx    Alert detail / findings
  api/watch/create/        Vagueness check
  api/watch/confirm/       Compile + persist watch
  api/watch/[id]/          Get, pause, resume, delete
  api/watch/[id]/check/    Manual check-now
  api/billing/checkout/    Stripe / Helio checkout (plan: plus|max)
  api/billing/portal/      Stripe Customer Portal
  api/billing/status/      Plan + limit for session user
  api/billing/phone/       Save / test SMS phone (Plus/Max)
  api/billing/webhook/     Stripe + Helio webhooks
  api/billing/run/         Expiry reminders + downgrade
  api/checks/run/          Due Tavily checks every 15m (GET for Vercel Cron)
components/                UI (HeroWatchBox, WatchCreator, WatchList, findings, BillingActions)
lib/                       Compiler, detector, decide, filter, findings, monitoring-plan,
                           constants (tier caps/cadence), db, watches, billing, notifications
docs/                      Generated NatSpec user/dev docs (`npm run docs:extract`)
evals/                     Judgment-layer eval harness (incl. revisit.json)
```

## Getting started

Install dependencies:

```bash
npm install
```

Create a `.env` file (see `.env.example`):

```bash
HUGGINGFACE_API_KEY=hf_...
AUTH_SECRET=generate-with-openssl-rand-base64-32
DATABASE_URL=postgresql://...  # Neon connection string
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For Google sign-in:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Create OAuth credentials in Google Cloud Console and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.

For live checks and emails:

```bash
TAVILY_API_KEY=tvly-...
RESEND_API_KEY=re_...
EMAIL_FROM="PhraseAlert <alerts@phrasealert.com>"
```

Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional:

```bash
HF_MODEL=meta-llama/Llama-3.3-70B-Instruct
CRON_SECRET=your-secret
# DATABASE_URL_UNPOOLED=...  # direct Neon URL for migrations
```

For Plus / Max billing and SMS, copy Stripe, Helio, and Twilio keys from `.env.example` (`STRIPE_PRICE_ID_PLUS_MONTHLY`, `STRIPE_PRICE_ID_MAX_MONTHLY`, Helio pay links, Twilio credentials).

Database helpers:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
```

## Unit tests

Deterministic Vitest coverage for filtering, notify decisions, findings, and compiler helpers (no API keys):

```bash
npm test
```

Same as `npm run test:unit`.

## Run evals

Golden smoke (compiler + detector + dialogues + live Tavily retrieval; recommended gate):

```bash
npm run eval:smoke
```

Full evaluation (same as smoke today):

```bash
npm run eval
```

Compiler only:

```bash
npm run eval:compiler
```

Detector and decision pipeline (fixture candidates):

```bash
npm run eval:detector
```

Multi-turn vagueness dialogues only:

```bash
npm run eval:dialogues
```

Live past-event tracking (requires `TAVILY_API_KEY` + model key). Compiles watches with backdated `created_at` (e.g. Trump 2024 from 2023), searches Tavily, and fails loudly if news is missing or the detector silently never fires:

```bash
npm run eval:retrieval
```

Page-revisit policy (authoritative URL re-admitted and re-judged within budget):

```bash
npm run eval:revisit
```

Type check:

```bash
npm run typecheck
```

Vague topic watches (e.g. `"Bitcoin"`) must stay `VAGUE` until a concrete outcome is specified. Dialogue fixtures live in `evals/dialogues.json`. Past-event fixtures (including pre-watch distractors) live in `evals/events.json`. Live search cases live in `evals/live-retrieval.json`.

## Acceptance targets (v0)

- Detection rate >= 90%
- False positive rate <= 5%
- Fixture-level verdict accuracy >= 85%
- Pre-watch distractors dropped 100%
- Post-watch event-date lock: null / unparseable / pre-watch dates never notify
- Dialogue smoke: keyword rejects + visa multi-turn + one-shot CLEAR
- Live retrieval smoke: Tavily returns candidates for backdated watches; detector finds TRIGGERED evidence and `should_notify` on known past events (zero retrieval / silent detector miss / decide-without-notify all fail the suite)

## Retrieval

Set `TAVILY_API_KEY` for live checks. Scheduled `GET|POST /api/checks/run` (every 15 minutes; due watches only) and owner `POST /api/watch/[id]/check` search via Tavily using the monitoring plan’s baseline (and optional follow-up) queries, extract top pages, filter, run the detector, optionally revisit allowed URLs, persist `checks`/`evidence`, and mark the watch triggered when evidence confirms the event. On notify: Resend HTML email always; Twilio SMS when the owner is on Plus/Max and has a saved phone.

Fixture evals in `evals/events.json` remain the stable judgment-layer gate. `evals/live-retrieval.json` exercises real Tavily search on backdated historical watches (including US election 2024 with a 2023 watch timestamp). `evals/revisit.json` covers in-place page updates. Brave and RSS providers are typed but not implemented.

## Documentation

NatSpec-style comments on routes and library modules are extracted to `docs/`:

```bash
npm run docs:extract
```

See `docs/natspec-userdoc.md` and `docs/natspec-devdoc.md`.

## Roadmap

- Push and webhook delivery (SMS is shipped for Plus/Max)
- Additional retrieval providers (Brave, RSS)
- Richer findings history across multiple checks
