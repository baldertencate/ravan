import { useEffect, useMemo, useRef, useState } from "react";
import wordsData from "./data/words.json";

type Mode = "meaning" | "transliteration";
type Tab = "learn" | "journey" | "words";
type Word = {
  id: string;
  persian: string;
  transliteration: string;
  meaning: string;
  level: number;
  rank: number;
  letters: string[];
};
type WordProgress = {
  seen: number;
  correct: number;
  wrong: number;
  interval: number;
  dueAt: number;
  avgMs: number;
};
type Progress = {
  words: Record<string, WordProgress>;
  totalCorrect: number;
  totalAnswers: number;
  totalMs: number;
  streak: number;
  bestStreak: number;
  dayStreak: number;
  lastStudyDay: string;
  activeLevel: number;
  highestLevel: number;
};
type Question = { word: Word; options: Word[]; mode: Mode };

const WORDS = wordsData as Word[];
const STORAGE_KEY = "ravan-progress-v1";
const LEVELS = [
  { title: "First shapes", copy: "Short, frequent words · ا ب د م ن" },
  { title: "Joining letters", copy: "Everyday connectors and core verbs" },
  { title: "Useful patterns", copy: "Longer words and similar letterforms" },
  { title: "Daily reading", copy: "Common nouns, places, and descriptions" },
  { title: "Fluent recognition", copy: "Longer, less predictable vocabulary" },
];

const emptyProgress: Progress = {
  words: {},
  totalCorrect: 0,
  totalAnswers: 0,
  totalMs: 0,
  streak: 0,
  bestStreak: 0,
  dayStreak: 0,
  lastStudyDay: "",
  activeLevel: 1,
  highestLevel: 1,
};

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyProgress, ...JSON.parse(raw) } : emptyProgress;
  } catch {
    return emptyProgress;
  }
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dayDifference(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) /
      86_400_000,
  );
}

function chooseQuestion(progress: Progress, excludeWordId?: string): Question {
  const fullPool = WORDS.filter((word) => word.level <= progress.activeLevel);
  const pool =
    excludeWordId && fullPool.length > 1
      ? fullPool.filter((word) => word.id !== excludeWordId)
      : fullPool;
  const now = Date.now();
  const weighted = pool.map((word) => {
    const stat = progress.words[word.id];
    if (!stat) return { word, weight: 12 + (101 - word.rank) / 30 };
    const accuracy = stat.correct / Math.max(1, stat.seen);
    const overdue = Math.max(0, now - stat.dueAt) / 3_600_000;
    return {
      word,
      weight: 1 + stat.wrong * 2.5 + (1 - accuracy) * 8 + Math.min(10, overdue),
    };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  const target =
    weighted.find((item) => {
      pick -= item.weight;
      return pick <= 0;
    })?.word ?? weighted[0].word;
  const stat = progress.words[target.id];
  const mastery = stat ? stat.correct / Math.max(3, stat.seen) : 0;
  const globalFade = Math.min(0.88, progress.totalCorrect / 140);
  const meaningChance = Math.max(0.22, Math.min(0.95, 0.25 + mastery * 0.5 + globalFade));
  const mode: Mode = Math.random() < meaningChance ? "meaning" : "transliteration";
  const distractors = shuffle(
    pool.filter((word) => word.id !== target.id && word[mode] !== target[mode]),
  ).slice(0, 3);
  return { word: target, options: shuffle([target, ...distractors]), mode };
}

function Icon({ name }: { name: "learn" | "journey" | "words" | "flame" | "clock" | "check" | "spark" }) {
  const icons = {
    learn: "◉",
    journey: "↗",
    words: "≡",
    flame: "◆",
    clock: "◷",
    check: "✓",
    spark: "✦",
  };
  return <span aria-hidden="true">{icons[name]}</span>;
}

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [tab, setTab] = useState<Tab>("learn");
  const [question, setQuestion] = useState(() => chooseQuestion(loadProgress()));
  const [selected, setSelected] = useState<string | null>(null);
  const [answeredCorrectly, setAnsweredCorrectly] = useState<boolean | null>(null);
  const [session, setSession] = useState({ correct: 0, answers: 0 });
  const [showModeHelp, setShowModeHelp] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)), [progress]);

  const unlockedLevel = progress.highestLevel;
  const graduationTarget = 15;
  const streakToGraduate = Math.max(0, graduationTarget - progress.streak);
  const canGraduate = progress.streak >= graduationTarget && progress.activeLevel < 5;
  const accuracy = progress.totalAnswers
    ? Math.round((progress.totalCorrect / progress.totalAnswers) * 100)
    : 0;
  const averageSeconds = progress.totalAnswers
    ? (progress.totalMs / progress.totalAnswers / 1000).toFixed(1)
    : "—";
  const mastered = Object.values(progress.words).filter(
    (stat) => stat.seen >= 3 && stat.correct / stat.seen >= 0.8,
  ).length;
  const dueCount = WORDS.filter((word) => {
    const stat = progress.words[word.id];
    return stat && stat.dueAt <= Date.now();
  }).length;
  const translitShare = Math.max(12, Math.round(75 - Math.min(63, progress.totalCorrect * 0.45)));

  function answer(option: Word) {
    if (selected) return;
    const correct = option.id === question.word.id;
    const elapsed = Math.min(30_000, Date.now() - startedAt.current);
    const today = dayKey();
    setSelected(option.id);
    setAnsweredCorrectly(correct);
    setSession((current) => ({
      answers: current.answers + 1,
      correct: current.correct + (correct ? 1 : 0),
    }));
    setProgress((current) => {
      const previous = current.words[question.word.id] ?? {
        seen: 0,
        correct: 0,
        wrong: 0,
        interval: 0,
        dueAt: 0,
        avgMs: 0,
      };
      const interval = correct
        ? Math.min(30, Math.max(1, previous.interval ? previous.interval * 2 : 1))
        : 0.08;
      const gap = current.lastStudyDay ? dayDifference(current.lastStudyDay, today) : 0;
      const dayStreak =
        current.lastStudyDay === today ? current.dayStreak : gap === 1 ? current.dayStreak + 1 : 1;
      const streak = correct ? current.streak + 1 : 0;
      return {
        ...current,
        words: {
          ...current.words,
          [question.word.id]: {
            seen: previous.seen + 1,
            correct: previous.correct + (correct ? 1 : 0),
            wrong: previous.wrong + (correct ? 0 : 1),
            interval,
            dueAt: Date.now() + interval * 86_400_000,
            avgMs: previous.seen
              ? Math.round((previous.avgMs * previous.seen + elapsed) / (previous.seen + 1))
              : elapsed,
          },
        },
        totalCorrect: current.totalCorrect + (correct ? 1 : 0),
        totalAnswers: current.totalAnswers + 1,
        totalMs: current.totalMs + elapsed,
        streak,
        bestStreak: Math.max(current.bestStreak, streak),
        dayStreak,
        lastStudyDay: today,
      };
    });
  }

  function nextQuestion() {
    const nextProgress = { ...progress };
    setQuestion(chooseQuestion(nextProgress, question.word.id));
    setSelected(null);
    setAnsweredCorrectly(null);
    setShowModeHelp(false);
    startedAt.current = Date.now();
  }

  function graduate() {
    if (!canGraduate) return;
    const nextLevel = Math.min(5, progress.activeLevel + 1);
    const nextProgress = {
      ...progress,
      activeLevel: nextLevel,
      highestLevel: Math.max(progress.highestLevel, nextLevel),
      streak: 0,
    };
    setProgress(nextProgress);
    setQuestion(chooseQuestion(nextProgress, question.word.id));
    setSelected(null);
    setAnsweredCorrectly(null);
    setShowModeHelp(false);
    setSession({ correct: 0, answers: 0 });
    startedAt.current = Date.now();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (tab !== "learn") return;
      const index = Number(event.key) - 1;
      if (!selected && index >= 0 && index < question.options.length) answer(question.options[index]);
      if (selected && (event.key === "Enter" || event.key === " ")) nextQuestion();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const recentWords = useMemo(
    () =>
      WORDS.filter((word) => progress.words[word.id]).sort(
        (a, b) => progress.words[b.id].seen - progress.words[a.id].seen,
      ),
    [progress.words],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("learn")} aria-label="Ravân home">
          <span className="brand-mark" lang="fa" dir="rtl">روان</span>
          <span>Ravân</span>
        </button>
        <div className="header-stats">
          <span className="streak-pill"><Icon name="flame" /> {progress.dayStreak}</span>
          <span className="level-pill">Level {progress.activeLevel}</span>
        </div>
      </header>

      <main>
        {tab === "learn" && (
          <section className="learn-view">
            <div className="session-row">
              <div>
                <span className="eyebrow">TODAY’S PRACTICE</span>
                <h1>Read the word</h1>
              </div>
              <div className="session-score">
                <strong>{session.correct}</strong><span>/ {session.answers || 0}</span>
              </div>
            </div>

            <div className="progress-track" aria-label="Session progress">
              <span style={{ width: `${Math.min(100, session.answers * 10)}%` }} />
            </div>

            <div className={`graduation-card ${canGraduate ? "ready" : ""}`}>
              <div className="streak-orb">
                <Icon name="flame" />
                <strong>{progress.streak}</strong>
              </div>
              <div className="graduation-copy">
                <div>
                  <strong>
                    {progress.activeLevel === 5
                      ? "Top-level reading streak"
                      : canGraduate
                        ? `Level ${progress.activeLevel + 1} is ready`
                        : "Current answer streak"}
                  </strong>
                  <span>
                    {progress.activeLevel === 5
                      ? `${progress.streak} correct without a miss`
                      : canGraduate
                        ? "You earned the choice to move up."
                        : `${streakToGraduate} more in a row to unlock Level ${progress.activeLevel + 1}`}
                  </span>
                </div>
                {progress.activeLevel < 5 && (
                  <div className="graduation-track" aria-label={`${progress.streak} of 15 correct answers`}>
                    <span style={{ width: `${Math.min(100, (progress.streak / graduationTarget) * 100)}%` }} />
                  </div>
                )}
              </div>
              {canGraduate && <button onClick={graduate}>Move up <span>→</span></button>}
            </div>

            <article className={`word-card ${selected ? "answered" : ""}`}>
              <div className="card-topline">
                <button
                  type="button"
                  className={`mode-tag ${question.mode}`}
                  onClick={() => setShowModeHelp((visible) => !visible)}
                  aria-expanded={showModeHelp}
                  aria-controls="question-mode-help"
                >
                  <Icon name={question.mode === "meaning" ? "spark" : "learn"} />
                  {question.mode === "meaning" ? "MEANING" : "SOUND BRIDGE"}
                  <span className="help-mark">?</span>
                </button>
                <span className="practice-level">LEVEL {progress.activeLevel} · {LEVELS[progress.activeLevel - 1].title}</span>
              </div>
              {showModeHelp && (
                <div className="mode-explainer" id="question-mode-help">
                  {question.mode === "transliteration" ? (
                    <>
                      <strong>A temporary bridge to sound</strong>
                      <span>You’re matching Persian script to its pronunciation. Ravân shows this less often as you improve, so you don’t become dependent on Latin letters.</span>
                    </>
                  ) : (
                    <>
                      <strong>Reading directly for meaning</strong>
                      <span>This is the long-term goal: recognizing the Persian word without relying on a transliteration.</span>
                    </>
                  )}
                </div>
              )}
              <div className="persian-word" lang="fa" dir="rtl">{question.word.persian}</div>
              <p className="prompt">
                Choose the correct {question.mode === "meaning" ? "meaning" : "pronunciation"}
              </p>
            </article>

            <div className="answers" aria-label="Answer options">
              {question.options.map((option, index) => {
                const isCorrect = option.id === question.word.id;
                const state = selected
                  ? isCorrect
                    ? "correct"
                    : selected === option.id
                      ? "wrong"
                      : "dim"
                  : "";
                return (
                  <button
                    key={option.id}
                    className={`answer ${state}`}
                    onClick={() => answer(option)}
                    disabled={!!selected}
                  >
                    <span className="answer-key">{index + 1}</span>
                    <span>{option[question.mode]}</span>
                    {state === "correct" && <Icon name="check" />}
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className={`feedback ${answeredCorrectly ? "success" : "retry"}`}>
                <div>
                  <strong>{answeredCorrectly ? "That’s it." : "Not quite — keep this one close."}</strong>
                  <span>
                    <b lang="fa" dir="rtl">{question.word.persian}</b>
                    {" · "}{question.word.transliteration} · {question.word.meaning}
                  </span>
                </div>
                <button onClick={nextQuestion}>Continue <span>↵</span></button>
              </div>
            )}

            {!selected && (
              <div className="adapt-note">
                <Icon name="spark" />
                <span><strong>Adapting to you.</strong> Missed words return sooner.</span>
              </div>
            )}
          </section>
        )}

        {tab === "journey" && (
          <section className="dashboard-view">
            <div className="page-intro">
              <span className="eyebrow">YOUR JOURNEY</span>
              <h1>Reading is taking shape.</h1>
              <p>Small, well-timed reviews turn unfamiliar marks into words you simply know.</p>
            </div>
            <div className="stats-grid">
              <div className="stat-card accent"><span>Accuracy</span><strong>{accuracy}%</strong><small>{progress.totalAnswers} answers</small></div>
              <div className="stat-card"><span>Average speed</span><strong>{averageSeconds}<em>s</em></strong><small>per answer</small></div>
              <div className="stat-card"><span>Best streak</span><strong>{progress.bestStreak}</strong><small>correct in a row</small></div>
              <div className="stat-card"><span>Words growing</span><strong>{mastered}</strong><small>at 80%+ accuracy</small></div>
            </div>
            <div className="section-card">
              <div className="section-heading">
                <div><span className="eyebrow">LEARNING PATH</span><h2>Five measured steps</h2></div>
                <span>{WORDS.filter((w) => w.level <= unlockedLevel).length} words available</span>
              </div>
              <div className="level-list">
                {LEVELS.map((level, index) => {
                  const number = index + 1;
                  const locked = number > unlockedLevel;
                  const active = number === progress.activeLevel;
                  return (
                    <button
                      key={level.title}
                      className={`level-row ${active ? "active" : ""}`}
                      disabled={locked}
                      onClick={() => {
                        setProgress((p) => ({ ...p, activeLevel: number }));
                        setQuestion(chooseQuestion({ ...progress, activeLevel: number }));
                        setTab("learn");
                      }}
                    >
                      <span className="level-number">{locked ? "·" : number}</span>
                      <span><strong>{level.title}</strong><small>{level.copy}</small></span>
                      <span>
                        {locked
                          ? number === progress.activeLevel + 1
                            ? `${streakToGraduate} streak left`
                            : "Locked"
                          : active
                            ? "Current"
                            : "Practise"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="bridge-card">
              <div className="bridge-ring" style={{ "--value": `${translitShare * 3.6}deg` } as React.CSSProperties}>
                <strong>{translitShare}%</strong><span>bridge</span>
              </div>
              <div>
                <span className="eyebrow">TRANSLITERATION FADE</span>
                <h2>Training your eyes, not a crutch.</h2>
                <p>Early questions connect script to sound. As your answers improve, Ravân replaces transliterations with meaning until you read Persian directly.</p>
              </div>
            </div>
          </section>
        )}

        {tab === "words" && (
          <section className="words-view">
            <div className="page-intro compact">
              <span className="eyebrow">WORD GARDEN</span>
              <h1>{recentWords.length ? "Words you’ve met" : "Your first words await."}</h1>
              <p>{dueCount} due now · {mastered} growing strong · stored only on this device</p>
            </div>
            <div className="word-table">
              {recentWords.length === 0 ? (
                <button className="empty-state" onClick={() => setTab("learn")}>
                  <span lang="fa" dir="rtl">آماده‌ای؟</span>
                  <strong>Ready?</strong>
                  <small>Start a short practice round</small>
                </button>
              ) : recentWords.map((word) => {
                const stat = progress.words[word.id];
                const score = Math.round((stat.correct / stat.seen) * 100);
                return (
                  <div className="word-row" key={word.id}>
                    <div className="mini-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><span>{score}</span></div>
                    <div><strong lang="fa" dir="rtl">{word.persian}</strong><span>{word.meaning}</span></div>
                    <div><span>{stat.seen} reviews</span><small>{stat.dueAt <= Date.now() ? "Due now" : `in ${Math.max(1, Math.ceil((stat.dueAt - Date.now()) / 86_400_000))}d`}</small></div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {(["learn", "journey", "words"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            <Icon name={item} /><span>{item === "learn" ? "Practice" : item[0].toUpperCase() + item.slice(1)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
