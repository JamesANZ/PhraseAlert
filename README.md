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

| Source                                                        | Keyword alert                | PhraseAlert           |
| ------------------------------------------------------------- | ---------------------------- | --------------------- |
| "Complete guide to partner visa fees in 2026"                 | Alert sent                   | Checked, no change    |
| "Forum: how much did your partner visa cost?"                 | Alert sent                   | Checked, no change    |
| "Home Affairs confirms partner visa fee increase from 1 July" | Alert sent (buried in noise) | Notified: fee changed |

Three keyword alerts. One mattered. PhraseAlert sent that one.

## How it works

1. **Describe it.** Write a specific future event in one sentence. Topic keywords alone (e.g. "Bitcoin") are rejected.
2. **Clarify until clear.** If the sentence is vague, PhraseAlert suggests more specific watch sentences and will not save the watch until it is unambiguous.
3. **Compile.** A model produces a structured watch spec: trigger conditions, non-triggers, search queries, authoritative domains.
4. **Watch.** On a schedule, the system retrieves new web content, filters out pre-watch and irrelevant results, and evaluates each candidate.
5. **Notify.** When credible evidence confirms the event occurred, you get an alert with the evidence trail.

## This repository

**Phase 1** (judgment layer):

- Watch compiler (strict vagueness + structured watch spec generation)
- Detection and decision pipeline
- Backdated eval harness with historical fixtures + multi-turn dialogue smoke
- Hugging Face Inference Providers (default `meta-llama/Llama-3.3-70B-Instruct`)

**Phase 2** (product shell, in progress):

- Next.js App Router app with landing page
- Watch creation flow with clarification step
- Dashboard at `/watches`
- Neon Postgres via Drizzle (works on Vercel)
- API routes for create, confirm, pause, delete, check-now
- Cron endpoint at `/api/checks/run` with Tavily live retrieval

Not built yet: email notifications for watches.

Auth uses NextAuth with Google sign-in only. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI for local development.

## Billing (Plus)

Plus unlocks 25 active watches for $9/month. Users can:

- **Subscribe** with a card (Stripe Checkout subscription)
- **Pay one month** with a card (Stripe Checkout payment) or **crypto** (Helio / MoonPay Commerce)
- **Top up** prepaid months before they expire (reminders at 7, 3, and 1 days)

When prepaid Plus expires unpaid (or a Stripe subscription is canceled), the account returns to Free and newest active watches are paused until at most 3 remain.

### Stripe setup

1. Create a Product “PhraseAlert Plus” with a recurring monthly price ($9) → set `STRIPE_PRICE_ID_PLUS_MONTHLY`
2. Optional one-time $9 price → `STRIPE_PRICE_ID_PLUS_PREPAID` (otherwise Checkout uses inline `price_data`)
3. Add webhook endpoint `POST /api/billing/webhook/stripe` for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Enable Customer Portal in Stripe Dashboard for cancel/update card

### Helio setup

1. Create a $9 pay link in the Helio / MoonPay Commerce dashboard → `HELIO_PAYLINK_ID`
2. Public API key → `HELIO_API_KEY`, secret → `HELIO_SECRET_KEY`
3. Global webhook to `POST /api/billing/webhook/helio` → store `sharedToken` as `HELIO_WEBHOOK_SECRET`

### Expiry emails

Set `RESEND_API_KEY` and `EMAIL_FROM`. Daily cron `POST /api/billing/run` (see `vercel.json`) sends reminders and applies downgrades. Protect with `CRON_SECRET`.

## App structure

```
app/
  page.tsx                 Landing page
  billing/page.tsx         Plan status + checkout
  watches/page.tsx         Dashboard
  watches/new/page.tsx     Create + clarify flow
  api/watch/create/        Vagueness check
  api/watch/confirm/       Compile + persist watch
  api/watch/[id]/          Get, pause, delete
  api/billing/checkout/    Stripe / Helio checkout
  api/billing/portal/      Stripe Customer Portal
  api/billing/webhook/     Stripe + Helio webhooks
  api/billing/run/         Expiry reminders + downgrade
  api/checks/run/          Scheduled Tavily checks
  api/watch/[id]/check/    Manual check-now for a watch
components/                UI components
lib/                       Compiler, detector, db, watches, billing
evals/                     Phase 1 eval harness
```

## Getting started

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```bash
HUGGINGFACE_API_KEY=hf_...
AUTH_SECRET=generate-with-openssl-rand-base64-32
DATABASE_URL=postgresql://...  # Neon connection string from Vercel/Neon dashboard
```

For Google sign-in:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Create OAuth credentials in Google Cloud Console and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.

Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional:

```bash
HF_MODEL=meta-llama/Llama-3.3-70B-Instruct
CRON_SECRET=your-secret
```

For Plus billing, copy Stripe / Helio / Resend keys from `.env.example`.

## Unit tests

Deterministic Vitest coverage for timestamp filtering and notify decisions (no API keys):

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
- Dialogue smoke: keyword rejects + visa multi-turn + one-shot CLEAR
- Live retrieval smoke: Tavily returns candidates for backdated watches; detector finds TRIGGERED evidence and `should_notify` on known past events (zero retrieval / silent detector miss / decide-without-notify all fail the suite)

## Retrieval

Set `TAVILY_API_KEY` for live checks. Scheduled `POST /api/checks/run` (and owner `POST /api/watch/[id]/check`) search each watch’s `search_queries` via Tavily, extract top pages, filter, run the detector, persist `checks`/`evidence`, and mark the watch triggered when evidence confirms the event. Email notify is not wired yet.

Fixture evals in `evals/events.json` remain the stable judgment-layer gate. `evals/live-retrieval.json` exercises real Tavily search on backdated historical watches (including US election 2024 with a 2023 watch timestamp). Brave and RSS providers are typed but not implemented.

## Roadmap

- **Phase 2 (remaining):** email notifications for watches, Postgres for production
- **Phase 3 (in progress):** Stripe + Helio billing (this repo), faster checks, SMS/push/webhooks, evidence trail UI
