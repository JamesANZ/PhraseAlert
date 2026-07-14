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

**Phase 1** (judgment layer):

- Watch compiler (vagueness + structured watch spec generation)
- Detection and decision pipeline
- Backdated eval harness with historical fixtures
- Hugging Face Inference integration for small-model testing

**Phase 2** (product shell, in progress):

- Next.js App Router app with landing page
- Watch creation flow with clarification step
- Dashboard at `/watches`
- SQLite database (local dev) via Drizzle
- API routes for create, confirm, pause, delete
- Cron endpoint stub at `/api/checks/run`

Not built yet: live retrieval, email notifications for watches.

Auth uses NextAuth with Google sign-in only. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI for local development.

## Billing (Plus)

Plus unlocks 25 active watches for $9/month. Users can:

- **Subscribe** with a card (Stripe Checkout subscription)
- **Pay one month** with a card (Stripe Checkout payment) or **crypto** (Helio / MoonPay Commerce)
- **Top up** prepaid months before they expire (reminders at 7, 3, and 1 days)

When prepaid Plus expires unpaid (or a Stripe subscription is canceled), the account returns to Free and newest active watches are paused until at most 3 remain.

### Stripe setup

1. Create a Product “Bellwether Plus” with a recurring monthly price ($9) → set `STRIPE_PRICE_ID_PLUS_MONTHLY`
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
  api/checks/run/          Scheduled checks (stub)
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
DATABASE_URL=./data/bellwether.db
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
HF_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
CRON_SECRET=your-secret
```

For Plus billing, copy Stripe / Helio / Resend keys from `.env.example`.

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

Phase 1 evals use fixture candidates in `evals/events.json` to test the judgment layer. Live retrieval (Tavily, Brave, RSS) is not wired into the app yet.

## Roadmap

- **Phase 2 (remaining):** live retrieval, email notifications for watches, Postgres for production
- **Phase 3 (in progress):** Stripe + Helio billing (this repo), faster checks, SMS/push/webhooks, evidence trail UI
