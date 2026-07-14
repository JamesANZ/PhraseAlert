import Link from "next/link";
import { HeroWatchBox } from "@/components/HeroWatchBox";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const EXAMPLE_GROUPS = [
  {
    label: "Everyday watches",
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
    label: "Niche watches",
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

const COMPARE_WATCH = "Notify me when mortgage rates drop below 5%.";

export default function HomePage() {
  return (
    <main id="top">
      <section className="hero">
        <h1>
          Tell us what you&apos;re
          <br />
          <em>waiting for.</em>
        </h1>
        <p className="hero-sub">
          Write one sentence about what you want to know. We alert you when it
          happens, not when a page mentions the topic.
        </p>
        <HeroWatchBox />
        <p className="hero-note">3 watches free · No credit card required</p>
      </section>

      <RevealOnScroll>
        <section className="section" id="examples">
          <p className="eyebrow mono">Examples</p>
          <h2>One sentence. That&apos;s the setup.</h2>
          <p className="section-sub">
            No categories or rules. Describe the event and we handle the rest.
          </p>
          <div className="example-groups">
            {EXAMPLE_GROUPS.map((group) => (
              <div key={group.label} className="example-group reveal">
                <div className="example-group-header">
                  <div>
                    <h3 className="example-group-title">{group.label}</h3>
                    <p className="example-group-desc">{group.description}</p>
                  </div>
                  <span
                    className={`example-tone mono example-tone-${group.tone}`}
                  >
                    {group.tone === "generic" ? "Broad" : "Specific"}
                  </span>
                </div>
                <div className="example-grid">
                  {group.examples.map((item) => (
                    <article
                      key={item.sentence}
                      className={`example-card example-card-${group.tone}`}
                    >
                      <p className="example-sentence">
                        &quot;{item.sentence}&quot;
                      </p>
                      <p className="example-tag">{item.tag}</p>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="difference">
          <p className="eyebrow mono">Why it&apos;s different</p>
          <h2>
            Alerts when the event happens,
            <br />
            not when the words show up.
          </h2>
          <p className="section-sub">
            Keyword alerts ping you for guides, forum posts, and old articles.
            A watch only fires when new evidence shows the thing you asked for
            has happened.
          </p>
          <div className="compare reveal">
            <p className="compare-watch">
              Example watch: &quot;{COMPARE_WATCH}&quot;
            </p>
            <div className="compare-cols">
              <div className="compare-col compare-col-keyword">
                <h3 className="compare-title">Keyword alert</h3>
                <ul className="feed">
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Complete guide to mortgage rates in 2026
                    </span>
                    <span className="feed-verdict">Alert sent</span>
                  </li>
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Forum thread: will rates ever drop below 5%?
                    </span>
                    <span className="feed-verdict">Alert sent</span>
                  </li>
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Fed cuts rates; average 30-year mortgage now 4.8%
                    </span>
                    <span className="feed-verdict">Alert sent</span>
                  </li>
                </ul>
                <p className="compare-tally">3 notifications</p>
              </div>
              <div className="compare-col compare-col-watch">
                <h3 className="compare-title">bellweather watch</h3>
                <ul className="feed">
                  <li className="feed-item skipped">
                    <span className="feed-headline">
                      Complete guide to mortgage rates in 2026
                    </span>
                    <span className="feed-verdict">No change</span>
                  </li>
                  <li className="feed-item skipped">
                    <span className="feed-headline">
                      Forum thread: will rates ever drop below 5%?
                    </span>
                    <span className="feed-verdict">No change</span>
                  </li>
                  <li className="feed-item fired-signal">
                    <span className="feed-headline">
                      Fed cuts rates; average 30-year mortgage now 4.8%
                    </span>
                    <span className="feed-verdict">Notified</span>
                  </li>
                </ul>
                <p className="compare-tally compare-tally-signal">
                  1 notification
                </p>
              </div>
            </div>
            <p className="compare-footnote">
              Each watch starts from the moment you create it, so you only hear
              about new developments.
            </p>
          </div>
        </section>

        <section className="section" id="how">
          <p className="eyebrow mono">How it works</p>
          <h2>Set it up in seconds.</h2>
          <div className="steps">
            <div className="step reveal">
              <p className="step-label mono">1. Describe it</p>
              <p className="step-body">
                Write what you want to know in plain English.
              </p>
            </div>
            <div className="step reveal">
              <p className="step-label mono">2. We watch</p>
              <p className="step-body">
                We check the web for new evidence that matches your watch.
              </p>
            </div>
            <div className="step reveal">
              <p className="step-label mono">3. You get notified</p>
              <p className="step-body">
                If the event happens, we tell you. If not, you hear nothing.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <p className="eyebrow mono">Pricing</p>
          <h2>Free to start. Upgrade when you need more.</h2>
          <div className="pricing-grid">
            <div className="plan reveal">
              <h3 className="plan-name">Free</h3>
              <p className="plan-price">
                <span className="plan-amount">$0</span>
              </p>
              <ul className="plan-features">
                <li>3 active watches</li>
                <li>Email notifications</li>
                <li>No credit card required</li>
              </ul>
              <Link className="btn btn-ghost" href="/watches/new">
                Create a watch
              </Link>
            </div>
            <div className="plan plan-featured reveal">
              <h3 className="plan-name">Plus</h3>
              <p className="plan-price">
                <span className="plan-amount">$9</span>
                <span className="plan-period">/month</span>
              </p>
              <ul className="plan-features">
                <li>25 active watches</li>
                <li>More frequent checks</li>
                <li>Push, SMS and webhook notifications</li>
                <li>Watch history and evidence trail</li>
              </ul>
              <Link className="btn btn-primary" href="/billing">
                Start with Plus
              </Link>
            </div>
          </div>
        </section>

        <section className="section final-cta">
          <h2 className="reveal">
            Create a watch.
            <br />
            <em>We&apos;ll do the checking.</em>
          </h2>
          <Link
            className="btn btn-primary btn-large reveal"
            href="/watches/new"
          >
            Create your first watch
          </Link>
          <p className="hero-note">3 watches free · No credit card required</p>
        </section>
      </RevealOnScroll>
    </main>
  );
}
