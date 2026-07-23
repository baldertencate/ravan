import { trackEvent } from "./analytics";
import type { ReactNode } from "react";

const APP_URL = `${import.meta.env.BASE_URL}app/`;

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
        <nav aria-label="Landing page">
          <a href="#how-it-works">How it works</a>
          <a href="#about">About</a>
          <PracticeLink className="landing-nav-cta">Start practising</PracticeLink>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="eyebrow">INTERACTIVE FARSI READING PRACTICE</span>
            <h1>Turn Persian script into words you recognise.</h1>
            <p>
              Ravân helps people who are learning to read Farsi. It complements courses,
              tutors, textbooks, and language apps with helpful interactive exercises that
              track and grow your reading skills.
            </p>
            <div className="landing-actions">
              <PracticeLink className="landing-primary">
                Try a 2-minute lesson <span aria-hidden="true">→</span>
              </PracticeLink>
              <a className="landing-secondary" href="#how-it-works">See how it works</a>
            </div>
            <div className="landing-trust">
              <span><b>✓</b> No account</span>
              <span><b>✓</b> Progress stays on your device</span>
              <span><b>✓</b> Works on mobile</span>
            </div>
          </div>

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
        </section>

        <section className="landing-intro" id="about">
          <span className="eyebrow">PRACTICE THAT FILLS THE GAP</span>
          <h2>Learning a language and learning to read it are different skills.</h2>
          <p>
            Lessons and vocabulary apps can teach you Farsi while leaving too little time for
            the script itself. Ravân adds focused reading practice, so familiar sounds and
            meanings become Persian words you can recognise on sight.
          </p>
        </section>

        <section className="landing-method" id="how-it-works">
          <div className="landing-section-heading">
            <div>
              <span className="eyebrow">HOW RAVÂN HELPS</span>
              <h2>A measured bridge into Persian script.</h2>
            </div>
            <p>Short, adaptive exercises train your eyes to recognize Persian words.</p>
          </div>
          <div className="landing-method-grid">
            <article>
              <span className="landing-step">01</span>
              <div lang="fa" dir="rtl">در</div>
              <h3>Connect script to pronunciation, then to meaning</h3>
              <p>
                Begin by matching a Persian word to its sound. Once you recognise that word,
                exercises increasingly ask for its English meaning.
              </p>
            </article>
            <article>
              <span className="landing-step">02</span>
              <div lang="fa" dir="rtl">می‌ـ</div>
              <h3>Recognise useful visual patterns</h3>
              <p>
                Learn frequent chunks first on their own, then spot them inside everyday
                words and inflected verbs.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-features">
          <div>
            <span aria-hidden="true">↻</span>
            <h3>Adaptive review</h3>
            <p>Missed words and patterns return sooner; secure ones make room for new material.</p>
          </div>
          <div>
            <span aria-hidden="true">↗</span>
            <h3>Visible progress</h3>
            <p>Track accuracy, speed, answer streaks, levels, and the words you have met.</p>
          </div>
          <div>
            <span aria-hidden="true">□</span>
            <h3>Made for your phone</h3>
            <p>Install it from your browser for an app-like, offline-capable experience.</p>
          </div>
        </section>

        <section className="landing-cta">
          <span className="eyebrow">START WHERE YOU ARE</span>
          <h2>Give your eyes two minutes of Persian.</h2>
          <p>No account or setup required. Your first reading exercise is ready.</p>
          <PracticeLink className="landing-primary landing-primary-light">
            Start reading <span aria-hidden="true">→</span>
          </PracticeLink>
        </section>
      </main>

      <footer className="landing-footer" id="privacy">
        <div className="landing-brand">
          <span className="brand-mark" lang="fa" dir="rtl">روان</span>
          <span><strong>Ravân</strong><small>Learn to Read Farsi</small></span>
        </div>
        <p>
          Learning progress stays in your browser. Ravân has no account or advertising and
          uses only anonymous, aggregate usage analytics to improve the experience.
        </p>
        <div>
          <a href="#privacy">Privacy</a>
          <a href="https://github.com/baldertencate/ravan">GitHub</a>
          <PracticeLink className="landing-footer-link">Open the app</PracticeLink>
        </div>
      </footer>
    </div>
  );
}
