import Link from "next/link";
import { HeroWatchBox } from "@/components/HeroWatchBox";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const EXAMPLE_GROUPS = [
  {
    label: "Everyday watches",
    description: "Broad topics anyone might care about.",
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
    description: "Hyper-specific — the weirder, the better.",
    tone: "specific" as const,
    examples: [
      {
        sentence: "Tell me if Australian partner visa fees increase.",
        tag: "Immigration & visas",
      },
      {
        sentence:
          "Notify me when a direct Sydney–Ulaanbaatar flight is announced.",
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
          Describe any future event in an ordinary sentence. bellweather watches
          the web, and tells you if and when it actually happens.
        </p>
        <HeroWatchBox />
        <p className="hero-note">3 watches free · No credit card required</p>
      </section>

      <RevealOnScroll>
        <section className="section" id="examples">
          <p className="eyebrow mono">Watch almost anything</p>
          <h2>One sentence is the whole setup.</h2>
          <p className="section-sub">
            No categories to pick, no rules to configure. From everyday news to
            oddly specific obsessions — if you can describe it, you can watch
            for it.
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
                    {group.tone === "generic" ? "Broad" : "Hyper-specific"}
                  </span>
                </div>
                <div className="example-grid">
                  {group.examples.map((item) => (
                    <article
                      key={item.sentence}
                      className={`example-card example-card-${group.tone}`}
                    >
                      <p className="example-sentence mono">
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
          <p className="eyebrow mono">Not a keyword alert</p>
          <h2>
            We watch for the event,
            <br />
            not the words.
          </h2>
          <p className="section-sub">
            Keyword alerts fire on any page that contains the right words. A
            watch fires when credible new information shows the thing has
            actually happened.
          </p>
          <div className="compare reveal">
            <p className="compare-watch mono">
              Watch: &quot;{COMPARE_WATCH}&quot;
            </p>
            <div className="compare-cols">
              <div className="compare-col compare-col-keyword">
                <h3 className="compare-title">Keyword alert</h3>
                <ul className="feed">
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Complete guide to mortgage rates in 2026
                    </span>
                    <span className="feed-verdict mono">
                      Alert sent: just a guide
                    </span>
                  </li>
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Forum thread: will rates ever drop below 5%?
                    </span>
                    <span className="feed-verdict mono">
                      Alert sent: forum post
                    </span>
                  </li>
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Fed cuts rates; average 30-year mortgage now 4.8%
                    </span>
                    <span className="feed-verdict mono">
                      Alert sent: buried in noise
                    </span>
                  </li>
                </ul>
                <p className="compare-tally mono">3 alerts · 1 that mattered</p>
              </div>
              <div className="compare-col compare-col-watch">
                <h3 className="compare-title">bellweather watch</h3>
                <ul className="feed">
                  <li className="feed-item skipped">
                    <span className="feed-headline">
                      Complete guide to mortgage rates in 2026
                    </span>
                    <span className="feed-verdict mono">
                      Checked, no change
                    </span>
                  </li>
                  <li className="feed-item skipped">
                    <span className="feed-headline">
                      Forum thread: will rates ever drop below 5%?
                    </span>
                    <span className="feed-verdict mono">
                      Checked, no change
                    </span>
                  </li>
                  <li className="feed-item fired-signal">
                    <span className="feed-headline">
                      Fed cuts rates; average 30-year mortgage now 4.8%
                    </span>
                    <span className="feed-verdict mono">
                      Notified: rate below 5%
                    </span>
                  </li>
                </ul>
                <p className="compare-tally compare-tally-signal mono">
                  1 alert · the one that mattered
                </p>
              </div>
            </div>
            <p className="compare-footnote">
              Watches are timestamped when you create them, so you hear about
              new developments, not old articles that happen to match.
            </p>
          </div>
        </section>

        <section className="section" id="how">
          <p className="eyebrow mono">How it works</p>
          <h2>Three steps. Two of them are ours.</h2>
          <div className="steps">
            <div className="step reveal">
              <p className="step-label mono">Describe it</p>
              <p className="step-body">
                Write a sentence describing exactly what you want to know.
              </p>
            </div>
            <div className="step reveal">
              <p className="step-label mono">We watch</p>
              <p className="step-body">
                bellweather checks for new developments relevant to your watch.
              </p>
            </div>
            <div className="step reveal">
              <p className="step-label mono">You know</p>
              <p className="step-body">
                When the event actually happens, you get notified. Until then,
                silence.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <p className="eyebrow mono">Pricing</p>
          <h2>Start free. Stay free if you like.</h2>
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
            Stop checking.
            <br />
            <em>Start knowing.</em>
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
