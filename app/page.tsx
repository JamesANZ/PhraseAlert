/**
 * @title Landing page
 * @notice Marketing home with hero alert box, example alerts, and how-it-works sections.
 */
import Link from "next/link";
import { HeroWatchBox } from "@/components/HeroWatchBox";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const EXAMPLE_GROUPS = [
  {
    label: "Everyday alerts",
    description: "Rates, sales, tours, company news.",
    tone: "generic" as const,
    examples: [
      {
        sentence: "Notify me when mortgage rates drop below 5%.",
        tag: "Money & rates",
      },
      {
        sentence: "Tell me if this product goes on sale.",
        tag: "Shopping",
      },
      {
        sentence: "Let me know when my favorite artist announces a tour.",
        tag: "Entertainment",
      },
      {
        sentence: "Tell me when a company I follow gets acquired.",
        tag: "Business",
      },
    ],
  },
  {
    label: "Specific events",
    description: "Visa fees, drug approvals, product launches.",
    tone: "specific" as const,
    examples: [
      {
        sentence: "Tell me if Australian partner visa fees increase.",
        tag: "Immigration & visas",
      },
      {
        sentence:
          "Notify me when a direct Sydney to Ulaanbaatar flight is announced.",
        tag: "Travel & routes",
      },
      {
        sentence:
          "Let me know when FDA approves donanemab for early Alzheimer’s.",
        tag: "Science & medicine",
      },
      {
        sentence: "Tell me when Raspberry Pi 6 is officially released.",
        tag: "Technology",
      },
    ],
  },
];

export default function HomePage() {
  return (
    <main id="top">
      <section className="hero">
        <p className="hero-brand">PhraseAlert</p>
        <h1>Get alerted on anything.</h1>
        <p className="hero-sub">
          Write what you want to know in plain English. PhraseAlert watches the
          web and notifies you when it happens, not every time the topic is
          mentioned.
        </p>
        <HeroWatchBox />
        <div className="hero-signal" aria-hidden="true">
          <svg viewBox="0 0 416 208" fill="none">
            <path
              d="M0 150.5C28 150.5 33.5 132.5 54 132.5C78 132.5 81 165 107 165C132.5 165 141.5 96 173 96C205 96 206.5 120 234 120C261 120 260 57 291 57C316.5 57 326.5 83.5 347.5 83.5C373 83.5 377 37 416 37"
              className="hero-signal-line"
            />
            <path
              d="M0 150.5C28 150.5 33.5 132.5 54 132.5C78 132.5 81 165 107 165C132.5 165 141.5 96 173 96C205 96 206.5 120 234 120C261 120 260 57 291 57C316.5 57 326.5 83.5 347.5 83.5C373 83.5 377 37 416 37V208H0V150.5Z"
              className="hero-signal-fill"
            />
            <circle cx="291" cy="57" r="5" className="hero-signal-node" />
            <circle cx="416" cy="37" r="5" className="hero-signal-node" />
          </svg>
        </div>
        <p className="hero-note">3 free alerts · No credit card</p>
      </section>

      <RevealOnScroll>
        <section className="section" id="examples">
          <p className="eyebrow">Examples</p>
          <h2>What you can get alerted on</h2>
          <p className="section-sub">
            One sentence is the whole setup. No keywords or filters.
          </p>
          <div className="example-groups">
            {EXAMPLE_GROUPS.map((group) => (
              <div key={group.label} className="example-group reveal">
                <div className="example-group-header">
                  <h3 className="example-group-title">{group.label}</h3>
                  <p className="example-group-desc">{group.description}</p>
                </div>
                <div className="example-grid">
                  {group.examples.map((item) => (
                    <article
                      key={item.sentence}
                      className={`example-item example-item-${group.tone}`}
                    >
                      <p className="example-sentence">{item.sentence}</p>
                      <p className="example-tag">{item.tag}</p>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="difference">
          <p className="eyebrow">Your alert</p>
          <h2>Get alerted when any future event happens.</h2>
          <p className="section-sub">
            Set an alert for something you care about. We&apos;ll let you know
            when it happens.
          </p>
        </section>

        <section className="section" id="how">
          <p className="eyebrow">How it works</p>
          <h2>Three steps</h2>
          <div className="steps">
            <div className="step reveal">
              <p className="step-num" aria-hidden="true">
                01
              </p>
              <p className="step-label">Write your alert</p>
              <p className="step-body">
                Describe what you want to know in plain English. One sentence is
                enough.
              </p>
            </div>
            <div className="step reveal">
              <p className="step-num" aria-hidden="true">
                02
              </p>
              <p className="step-label">We check the web</p>
              <p className="step-body">
                PhraseAlert looks for credible evidence that the event has
                occurred.
              </p>
            </div>
            <div className="step reveal">
              <p className="step-num" aria-hidden="true">
                03
              </p>
              <p className="step-label">You get notified</p>
              <p className="step-body">
                When it happens, we email you. Until then, nothing.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <p className="eyebrow">Pricing</p>
          <h2>Free to start. Plus if you need more alerts.</h2>
          <div className="pricing-grid">
            <div className="plan reveal">
              <h3 className="plan-name">Free</h3>
              <p className="plan-price">
                <span className="plan-amount">$0</span>
              </p>
              <ul className="plan-features">
                <li>3 active alerts</li>
                <li>Email notifications</li>
                <li>No credit card required</li>
              </ul>
              <Link className="btn btn-ghost" href="/watches/new">
                Create an alert
              </Link>
            </div>
            <div className="plan plan-featured reveal">
              <h3 className="plan-name">Plus</h3>
              <p className="plan-price">
                <span className="plan-amount">$9</span>
                <span className="plan-period">/month</span>
              </p>
              <ul className="plan-features">
                <li>25 active alerts</li>
                <li>More frequent checks</li>
                <li>Push, SMS, and webhook notifications</li>
                <li>Alert history and evidence trail</li>
              </ul>
              <Link className="btn btn-primary" href="/billing">
                Upgrade to Plus
              </Link>
            </div>
          </div>
        </section>

        <section className="section final-cta">
          <p className="hero-brand reveal">PhraseAlert</p>
          <h2 className="reveal">Get alerted on anything.</h2>
          <Link
            className="btn btn-primary btn-large reveal"
            href="/watches/new"
          >
            Create an alert
          </Link>
          <p className="hero-note">3 free alerts · No credit card</p>
        </section>
      </RevealOnScroll>
    </main>
  );
}
