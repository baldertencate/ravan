import { trackEvent } from "./analytics";
import type { ReactNode } from "react";

const APP_URL = `${import.meta.env.BASE_URL}app/`;
const BUD_IMAGE = `${import.meta.env.BASE_URL}mastery/bud.png`;

function PracticeLink({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={APP_URL}
      onClick={() => trackEvent("Landing Practice Click", { placement: className })}
    >
      {children}
    </a>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-brand" href={import.meta.env.BASE_URL} aria-label="Ravân home">
          <span className="brand-mark" lang="fa" dir="rtl">روان</span>
          <span><strong>Ravân</strong><small>Learn to Read Farsi</small></span>
        </a>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="eyebrow">INTERACTIVE FARSI READING PRACTICE</span>
            <h1>Helpful practice for learning to read Farsi.</h1>
            <p>
              Ravân complements courses, tutors, textbooks, and language apps with interactive
              exercises that track and grow your Persian reading skills.
            </p>
            <div className="landing-actions">
              <PracticeLink className="landing-primary">
                Start practicing <span aria-hidden="true">→</span>
              </PracticeLink>
            </div>
            <div className="landing-trust">
              <span><b>✓</b> No account</span>
              <span><b>✓</b> Progress stays on your device</span>
              <span><b>✓</b> Works on any platform: Android, iPhone, desktop (web)</span>
            </div>
          </div>

          <div className="landing-demo-showcase">
            <div className="landing-demo" aria-label="Example Ravân reading exercise">
              <div className="landing-demo-top">
                <span>LEVEL 1</span>
                <span>Read the word</span>
              </div>
              <div className="landing-demo-card">
                <span className="landing-demo-mode">SOUND BRIDGE</span>
                <strong lang="fa" dir="rtl">آب</strong>
                <small>Choose the correct pronunciation</small>
              </div>
              <div className="landing-demo-options">
                <span>1 <b>âb</b></span>
                <span>2 <b>bad</b></span>
                <span>3 <b>dar</b></span>
                <span>4 <b>man</b></span>
              </div>
              <p><span aria-hidden="true">✦</span> Exercises adapt as your reading grows.</p>
            </div>

            <div
              className="landing-unlock-demo"
              aria-label="Example Barikala celebration showing Level 2 unlocked"
            >
              <div className="landing-unlock-screen">
                <div className="landing-unlock-ghost" aria-hidden="true">
                  <span />
                  <span />
                  <i />
                </div>
                <div className="landing-unlock-card">
                  <img src={BUD_IMAGE} alt="" aria-hidden="true" />
                  <span className="eyebrow">A NEW READING STEP</span>
                  <h2>
                    Barikala <small lang="fa" dir="rtl">(باریکلا)</small>
                  </h2>
                  <strong>Level 2 unlocked!</strong>
                  <div>
                    <b>Your flower is now a bud.</b>
                    <span>Stay on Level 1 to keep growing it.</span>
                  </div>
                  <span className="landing-unlock-primary">
                    Go to Level 2 <b aria-hidden="true">→</b>
                  </span>
                  <small className="landing-unlock-stay">Stay and grow my flower</small>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
