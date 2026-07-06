import Link from "next/link";
import { HeroWatchBox } from "@/components/HeroWatchBox";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const EXAMPLES = [
  {
    sentence: "Tell me if Australian partner visa fees increase.",
    tag: "Immigration & visas",
  },
  {
    sentence: "Notify me when Bitcoin passes $100,000.",
    tag: "Markets & crypto",
  },
  {
    sentence:
      "Tell me if New Zealand changes its foreign investment tax rules.",
    tag: "Government & policy",
  },
  {
    sentence: "Let me know if this company announces an IPO.",
    tag: "Companies & launches",
  },
  {
    sentence: "Tell me when a direct Sydney–Ulaanbaatar flight is announced.",
    tag: "Travel & routes",
  },
  {
    sentence:
      "Notify me when a new hair loss treatment completes Phase 3 trials.",
    tag: "Science & medicine",
  },
  {
    sentence: "Tell me when the next Raspberry Pi is released.",
    tag: "Technology",
  },
  {
    sentence: "Let me know if my council approves the new ferry terminal.",
    tag: "Local developments",
  },
];

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
          Describe any future event in an ordinary sentence. Bellwether watches
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
            No categories to pick, no rules to configure. If you can describe
            it, you can watch for it.
          </p>
          <div className="example-grid">
            {EXAMPLES.map((item) => (
              <article key={item.sentence} className="example-card reveal">
                <p className="example-sentence mono">
                  &quot;{item.sentence}&quot;
                </p>
                <p className="example-tag">{item.tag}</p>
              </article>
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
              Watch: &quot;Tell me if Australian partner visa fees
              increase.&quot;
            </p>
            <div className="compare-cols">
              <div className="compare-col compare-col-keyword">
                <h3 className="compare-title">Keyword alert</h3>
                <ul className="feed">
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Complete guide to partner visa fees in 2026
                    </span>
                    <span className="feed-verdict mono">
                      Alert sent: just a guide
                    </span>
                  </li>
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Forum thread: how much did your partner visa cost?
                    </span>
                    <span className="feed-verdict mono">
                      Alert sent: forum post
                    </span>
                  </li>
                  <li className="feed-item fired-noise">
                    <span className="feed-headline">
                      Home Affairs confirms partner visa fee increase from 1
                      July
                    </span>
                    <span className="feed-verdict mono">
                      Alert sent: buried in noise
                    </span>
                  </li>
                </ul>
                <p className="compare-tally mono">3 alerts · 1 that mattered</p>
              </div>
              <div className="compare-col compare-col-watch">
                <h3 className="compare-title">Bellwether watch</h3>
                <ul className="feed">
                  <li className="feed-item skipped">
                    <span className="feed-headline">
                      Complete guide to partner visa fees in 2026
                    </span>
                    <span className="feed-verdict mono">
                      Checked, no change
                    </span>
                  </li>
                  <li className="feed-item skipped">
                    <span className="feed-headline">
                      Forum thread: how much did your partner visa cost?
                    </span>
                    <span className="feed-verdict mono">
                      Checked, no change
                    </span>
                  </li>
                  <li className="feed-item fired-signal">
                    <span className="feed-headline">
                      Home Affairs confirms partner visa fee increase from 1
                      July
                    </span>
                    <span className="feed-verdict mono">
                      Notified: fee changed
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
                Bellwether checks for new developments relevant to your watch.
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
              <Link className="btn btn-primary" href="/watches/new">
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
