import { useEffect, useMemo, useRef, useState } from "react";
import wordsData from "./data/words.json";
import vowelData from "./data/vowels.json";
import patternsData from "./data/patterns.json";

type Mode = "meaning" | "transliteration";
type Tab = "learn" | "journey" | "words" | "about";
type Word = {
  id: string;
  persian: string;
  transliteration: string;
  meaning: string;
  level: number;
  rank: number;
  letters: string[];
  vowelled: string;
};
type WordProgress = {
  seen: number;
  correct: number;
  wrong: number;
  transliterationCorrect: number;
  interval: number;
  dueAt: number;
  avgMs: number;
};
type PatternProgress = {
  seen: number;
  correct: number;
  wrong: number;
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
  patternStats: Record<string, PatternProgress>;
};
type Question = { word: Word; options: Word[]; mode: Mode };
type Pattern = {
  id: string;
  form: string;
  chunk: string;
  name: string;
  meaning: string;
  level: number;
  position: "prefix" | "suffix";
  examples: { word: string; meaning: string; chunk?: string }[];
};
type PatternExercise = {
  pattern: Pattern;
  options: Pattern[];
  stage: "isolation" | "context";
  example: { word: string; meaning: string; chunk?: string };
};
type ReminderSettings = {
  enabled: boolean;
  time: string;
  interval: number;
};
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const VOWELLED = vowelData as Record<string, string>;
const WORDS = (wordsData as Omit<Word, "vowelled">[]).map((word) => ({
  ...word,
  vowelled: VOWELLED[word.id] ?? word.persian,
}));
const PATTERNS = patternsData as Pattern[];
const STORAGE_KEY = "ravan-progress-v1";
const VOWEL_KEY = "ravan-show-vowels-v1";
const ONBOARDING_KEY = "ravan-onboarding-v1";
const REMINDER_KEY = "ravan-reminder-v1";
const HAPTICS_KEY = "ravan-haptics-v1";
const APP_URL = "https://baldertencate.github.io/farsi/";
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
  patternStats: {},
};

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyProgress, ...JSON.parse(raw) } : emptyProgress;
  } catch {
    return emptyProgress;
  }
}

function loadReminder(): ReminderSettings {
  try {
    const saved = localStorage.getItem(REMINDER_KEY);
    return saved
      ? { enabled: false, time: "19:00", interval: 1, ...JSON.parse(saved) }
      : { enabled: false, time: "19:00", interval: 1 };
  } catch {
    return { enabled: false, time: "19:00", interval: 1 };
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function shouldShowOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY)) return false;
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Progress>;
    return !existing.totalAnswers;
  } catch {
    return true;
  }
}

function calendarDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function utcCalendarDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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
  const hasCorrectTransliteration = (stat?.transliterationCorrect ?? 0) >= 1;
  const mode: Mode =
    hasCorrectTransliteration && Math.random() < meaningChance ? "meaning" : "transliteration";
  const distractors = shuffle(
    pool.filter((word) => word.id !== target.id && word[mode] !== target[mode]),
  ).slice(0, 3);
  return { word: target, options: shuffle([target, ...distractors]), mode };
}

function choosePatternExercise(progress: Progress): PatternExercise {
  const available = PATTERNS.filter((pattern) => pattern.level <= progress.activeLevel);
  const weighted = available.map((pattern) => {
    const stat = progress.patternStats[pattern.id];
    return {
      pattern,
      weight: stat ? 1 + stat.wrong * 3 + (1 - stat.correct / stat.seen) * 6 : 12,
    };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  const pattern =
    weighted.find((item) => {
      pick -= item.weight;
      return pick <= 0;
    })?.pattern ?? available[0];
  const stat = progress.patternStats[pattern.id];
  const stage: "isolation" | "context" =
    stat && stat.seen >= 3 && stat.correct / stat.seen >= 0.67 ? "context" : "isolation";
  const example = pattern.examples[(stat?.seen ?? 0) % pattern.examples.length];
  const distractors = shuffle(PATTERNS.filter((item) => item.id !== pattern.id)).slice(0, 3);
  return { pattern, options: shuffle([pattern, ...distractors]), stage, example };
}

function Icon({ name }: { name: "learn" | "journey" | "words" | "about" | "flame" | "clock" | "check" | "spark" }) {
  const icons = {
    learn: "◉",
    journey: "↗",
    words: "≡",
    about: "i",
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
  const [showVowels, setShowVowels] = useState(() => localStorage.getItem(VOWEL_KEY) === "true");
  const [exerciseKind, setExerciseKind] = useState<"word" | "pattern">("word");
  const [patternExercise, setPatternExercise] = useState<PatternExercise | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [reminder, setReminder] = useState<ReminderSettings>(loadReminder);
  const [haptics, setHaptics] = useState(() => localStorage.getItem(HAPTICS_KEY) !== "false");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const startedAt = useRef(Date.now());

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)), [progress]);
  useEffect(() => localStorage.setItem(VOWEL_KEY, String(showVowels)), [showVowels]);
  useEffect(() => localStorage.setItem(REMINDER_KEY, JSON.stringify(reminder)), [reminder]);
  useEffect(() => localStorage.setItem(HAPTICS_KEY, String(haptics)), [haptics]);
  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function markInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstallHelp(false);
    }
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const displayWord = (word: Word) => showVowels ? word.vowelled : word.persian;

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
  const matchedPattern = PATTERNS.find(
    (pattern) =>
      pattern.level <= progress.activeLevel &&
      pattern.chunk.length > 1 &&
      question.word.persian.includes(pattern.chunk),
  );

  function highlightPattern(text: string, pattern: Pattern, exampleChunk?: string) {
    const chunk = exampleChunk ?? pattern.chunk;
    const index = pattern.position === "suffix" ? text.lastIndexOf(chunk) : text.indexOf(chunk);
    if (index < 0) return text;
    return (
      <>
        {text.slice(0, index)}
        <mark>{text.slice(index, index + chunk.length)}</mark>
        {text.slice(index + chunk.length)}
      </>
    );
  }

  function hapticFeedback(correct: boolean) {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate(correct ? 18 : [28, 36, 28]);
  }

  async function installApp() {
    if (installed) return;
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  function downloadReminder() {
    const [savedHour, savedMinute] = reminder.time.split(":").map(Number);
    const hour = Number.isFinite(savedHour) ? savedHour : 19;
    const minute = Number.isFinite(savedMinute) ? savedMinute : 0;
    const start = new Date();
    start.setSeconds(0, 0);
    start.setHours(hour, minute, 0, 0);
    if (start.getTime() <= Date.now()) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 15 * 60_000);
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Ravan//Farsi Reading Practice//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:ravan-practice-${Date.now()}@baldertencate.github.io`,
      `DTSTAMP:${utcCalendarDate(new Date())}`,
      `DTSTART:${calendarDate(start)}`,
      `DTEND:${calendarDate(end)}`,
      `RRULE:FREQ=DAILY;INTERVAL=${reminder.interval}`,
      "SUMMARY:Ravân — Farsi reading practice",
      "DESCRIPTION:A short Persian reading practice with Ravân.",
      `URL:${APP_URL}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ravan-practice-reminder.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function finishOnboarding() {
    if (reminder.enabled) downloadReminder();
    localStorage.setItem(ONBOARDING_KEY, "complete");
    setShowOnboarding(false);
    setOnboardingStep(0);
    setTab("learn");
  }

  async function shareApp() {
    const shareData = {
      title: "Ravân: Learn to Read Farsi",
      text: "Learn to read Persian script through short, adaptive practice.",
      url: APP_URL,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus("Shared");
      } else {
        await navigator.clipboard.writeText(APP_URL);
        setShareStatus("Link copied");
      }
    } catch {
      setShareStatus("");
    }
  }

  function answer(option: Word) {
    if (selected) return;
    const correct = option.id === question.word.id;
    const elapsed = Math.min(30_000, Date.now() - startedAt.current);
    const today = dayKey();
    hapticFeedback(correct);
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
        transliterationCorrect: 0,
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
            transliterationCorrect:
              question.mode === "meaning" && !correct
                ? 0
                : (previous.transliterationCorrect ?? 0) +
                  (correct && question.mode === "transliteration" ? 1 : 0),
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

  function answerPattern(option: Pattern) {
    if (selected || !patternExercise) return;
    const correct = option.id === patternExercise.pattern.id;
    const elapsed = Math.min(30_000, Date.now() - startedAt.current);
    const today = dayKey();
    hapticFeedback(correct);
    setSelected(option.id);
    setAnsweredCorrectly(correct);
    setSession((current) => ({
      answers: current.answers + 1,
      correct: current.correct + (correct ? 1 : 0),
    }));
    setProgress((current) => {
      const previous = current.patternStats[patternExercise.pattern.id] ?? {
        seen: 0,
        correct: 0,
        wrong: 0,
      };
      const gap = current.lastStudyDay ? dayDifference(current.lastStudyDay, today) : 0;
      const dayStreak =
        current.lastStudyDay === today ? current.dayStreak : gap === 1 ? current.dayStreak + 1 : 1;
      const streak = correct ? current.streak + 1 : 0;
      return {
        ...current,
        patternStats: {
          ...current.patternStats,
          [patternExercise.pattern.id]: {
            seen: previous.seen + 1,
            correct: previous.correct + (correct ? 1 : 0),
            wrong: previous.wrong + (correct ? 0 : 1),
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
    const patternNext = progress.activeLevel >= 2 && (session.answers + 1) % 4 === 0;
    if (patternNext) {
      setPatternExercise(choosePatternExercise(nextProgress));
      setExerciseKind("pattern");
    } else {
      setQuestion(chooseQuestion(nextProgress, question.word.id));
      setExerciseKind("word");
    }
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
    setExerciseKind("word");
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
      if (!selected && exerciseKind === "word" && index >= 0 && index < question.options.length) {
        answer(question.options[index]);
      }
      if (
        !selected &&
        exerciseKind === "pattern" &&
        patternExercise &&
        index >= 0 &&
        index < patternExercise.options.length
      ) {
        answerPattern(patternExercise.options[index]);
      }
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

  if (showOnboarding) {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <header className="onboarding-brand">
            <span className="brand-mark" lang="fa" dir="rtl">روان</span>
            <span><strong>Ravân</strong><small>Learn to Read Farsi</small></span>
          </header>
          <div className="onboarding-steps" aria-label={`Introduction step ${onboardingStep + 1} of 3`}>
            {[0, 1, 2].map((step) => <i className={step <= onboardingStep ? "active" : ""} key={step} />)}
          </div>

          {onboardingStep === 0 && (
            <div className="onboarding-panel">
              <span className="eyebrow">PERSIAN SCRIPT, MADE APPROACHABLE</span>
              <div className="onboarding-word" lang="fa" dir="rtl">بخوان</div>
              <h1>Learn to read Farsi, one word at a time.</h1>
              <p>Short, adaptive exercises train your eyes to recognize Persian words without becoming dependent on Latin letters.</p>
              <div className="onboarding-benefits">
                <span><b>01</b> Connect script to pronunciation</span>
                <span><b>02</b> Recognize useful visual patterns</span>
                <span><b>03</b> Read directly for meaning</span>
              </div>
              <button className="primary-action" onClick={() => setOnboardingStep(1)}>
                See how it works <span>→</span>
              </button>
            </div>
          )}

          {onboardingStep === 1 && (
            <div className="onboarding-panel">
              <span className="eyebrow">A BRIDGE YOU GRADUALLY LEAVE BEHIND</span>
              <h1>Built to outgrow transliteration.</h1>
              <p>Ravân starts by connecting Persian spelling to sound, then shifts toward English meaning as each word becomes familiar.</p>
              <div className="method-preview">
                <div><span>در</span><strong>Sound bridge</strong><small>First match the script to <i>dar</i>.</small></div>
                <div><span>می‌ـ</span><strong>Pattern checks</strong><small>Learn recurring chunks as visual units.</small></div>
                <div><span>کتاب</span><strong>Read for meaning</strong><small>Eventually recognize “book” directly.</small></div>
              </div>
              <button className="primary-action" onClick={() => setOnboardingStep(2)}>
                Make it yours <span>→</span>
              </button>
              <button className="text-action" onClick={() => setOnboardingStep(0)}>Back</button>
            </div>
          )}

          {onboardingStep === 2 && (
            <div className="onboarding-panel">
              <span className="eyebrow">READY WHEN YOU ARE</span>
              <h1>Make practice easy to return to.</h1>
              <p>Add Ravân to your Home Screen for an app-like experience. You can also create a recurring calendar reminder without making an account.</p>

              {!installed && (
                <div className="onboarding-install">
                  <div><strong>Add to Home Screen</strong><small>Opens full-screen and stays one tap away.</small></div>
                  <button onClick={installApp}>Add</button>
                </div>
              )}
              {showInstallHelp && !installed && (
                <div className="install-help">
                  <strong>Install from your browser</strong>
                  <span>On iPhone or iPad: tap Share, then “Add to Home Screen.”</span>
                  <span>On Android: open the browser menu and choose “Install app” or “Add to Home screen.”</span>
                </div>
              )}

              <label className="reminder-choice">
                <input
                  type="checkbox"
                  checked={reminder.enabled}
                  onChange={(event) => setReminder((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span><strong>Create a practice reminder</strong><small>Uses your phone’s calendar so it works even when the web app is closed.</small></span>
              </label>
              {reminder.enabled && (
                <div className="reminder-controls">
                  <label>
                    <span>Time</span>
                    <input
                      type="time"
                      value={reminder.time}
                      onChange={(event) => setReminder((current) => ({ ...current, time: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Repeat</span>
                    <select
                      value={reminder.interval}
                      onChange={(event) => setReminder((current) => ({ ...current, interval: Number(event.target.value) }))}
                    >
                      <option value={1}>Every day</option>
                      <option value={2}>Every 2 days</option>
                      <option value={3}>Every 3 days</option>
                      <option value={7}>Every week</option>
                    </select>
                  </label>
                </div>
              )}
              <button className="primary-action" onClick={finishOnboarding}>
                Start practicing <span>→</span>
              </button>
              <button className="text-action" onClick={() => setOnboardingStep(1)}>Back</button>
            </div>
          )}

          <button className="skip-intro" onClick={finishOnboarding}>Skip introduction</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("learn")} aria-label="Ravân home">
          <span className="brand-mark" lang="fa" dir="rtl">روان</span>
          <span className="brand-copy"><strong>Ravân</strong><small>Learn to Read Farsi</small></span>
        </button>
        <div className="header-stats">
          <span className="streak-pill">{progress.dayStreak} day streak</span>
          <button
            type="button"
            className="level-pill"
            onClick={() => setTab("journey")}
            aria-label={`Open Journey. Current level ${progress.activeLevel}`}
          >
            Level {progress.activeLevel} <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>

      <main>
        {tab === "learn" && (
          <section className="learn-view">
            <div className="session-row">
              <div>
                <span className="eyebrow">TODAY’S PRACTICE</span>
                <h1>{exerciseKind === "pattern" ? "Spot the pattern" : "Read the word"}</h1>
              </div>
              <div className="session-tools">
                <div className="session-score">
                  <strong>{session.correct}</strong><span>/ {session.answers || 0}</span>
                </div>
              </div>
            </div>

            <div className="progress-track" aria-label="Session progress">
              <span style={{ width: `${Math.min(100, session.answers * 10)}%` }} />
            </div>

            <div className={`graduation-card ${canGraduate ? "ready" : ""}`}>
              <div className="current-level">
                <span>LEVEL</span>
                <strong>{progress.activeLevel}</strong>
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
                    <b>{progress.streak} / {graduationTarget} correct</b>
                  </div>
                )}
              </div>
              {canGraduate && <button onClick={graduate}>Move up <span>→</span></button>}
            </div>

            {exerciseKind === "word" ? (
              <>
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
                    <button
                      type="button"
                      className="vowel-toggle card-vowel-toggle"
                      role="switch"
                      aria-checked={showVowels}
                      onClick={() => setShowVowels((visible) => !visible)}
                    >
                      <span className="toggle-track"><span /></span>
                      Vowel marks
                    </button>
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
                  <div className="persian-word" lang="fa" dir="rtl">
                    {!showVowels && matchedPattern
                      ? highlightPattern(question.word.persian, matchedPattern)
                      : displayWord(question.word)}
                  </div>
                  {matchedPattern && (
                    <div className="word-pattern-note">
                      <span lang="fa" dir="rtl">{matchedPattern.form}</span>
                      <strong>{matchedPattern.name}</strong>
                      <small>{matchedPattern.meaning}</small>
                    </div>
                  )}
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
              </>
            ) : patternExercise ? (
              <>
                <article className={`word-card pattern-question-card ${selected ? "answered" : ""}`}>
                  <div className="card-topline">
                    <span className="mode-tag pattern-mode"><Icon name="spark" /> PATTERN CHECK</span>
                    <span className="pattern-stage">
                      {patternExercise.stage === "isolation" ? "SHAPE FIRST" : "IN CONTEXT"}
                    </span>
                  </div>
                  <div className="pattern-question-word" lang="fa" dir="rtl">
                    {patternExercise.stage === "isolation"
                      ? patternExercise.pattern.form
                      : highlightPattern(
                          patternExercise.example.word,
                          patternExercise.pattern,
                          patternExercise.example.chunk,
                        )}
                  </div>
                  {patternExercise.stage === "context" && (
                    <span className="pattern-example-meaning">{patternExercise.example.meaning}</span>
                  )}
                  <p className="prompt">
                    {patternExercise.stage === "isolation"
                      ? "What does this visual pattern signal?"
                      : "What does the highlighted chunk signal?"}
                  </p>
                </article>
                <div className="answers pattern-answers" aria-label="Pattern answer options">
                  {patternExercise.options.map((option, index) => {
                    const isCorrect = option.id === patternExercise.pattern.id;
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
                        onClick={() => answerPattern(option)}
                        disabled={!!selected}
                      >
                        <span className="answer-key">{index + 1}</span>
                        <span>{option.name}</span>
                        {state === "correct" && <Icon name="check" />}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {selected && (
              <div className={`feedback ${answeredCorrectly ? "success" : "retry"}`}>
                <div>
                  <strong>{answeredCorrectly ? "That’s it." : "Not quite — keep this one close."}</strong>
                  <span>
                    {exerciseKind === "word" ? (
                      <>
                        <b lang="fa" dir="rtl">{displayWord(question.word)}</b>
                        {" · "}{question.word.transliteration} · {question.word.meaning}
                      </>
                    ) : patternExercise ? (
                      <>
                        <b lang="fa" dir="rtl">{patternExercise.pattern.form}</b>
                        {" · "}{patternExercise.pattern.name} · {patternExercise.pattern.meaning}
                      </>
                    ) : null}
                  </span>
                </div>
                <button onClick={nextQuestion}>Continue <span>↵</span></button>
              </div>
            )}

            {!selected && (
              <div className="adapt-note">
                <Icon name="spark" />
                <span>
                  <strong>Adapting to you.</strong>{" "}
                  {exerciseKind === "pattern" ? "Missed patterns return sooner." : "Missed words return sooner."}
                </span>
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
                        setExerciseKind("word");
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
            <div className="section-card pattern-library">
              <div className="section-heading">
                <div><span className="eyebrow">PATTERN LIBRARY</span><h2>Read in useful chunks</h2></div>
                <span>{PATTERNS.filter((pattern) => pattern.level <= unlockedLevel).length} unlocked</span>
              </div>
              <div className="pattern-grid">
                {PATTERNS.map((pattern) => {
                  const locked = pattern.level > unlockedLevel;
                  return (
                    <div className={`pattern-tile ${locked ? "locked" : ""}`} key={pattern.id}>
                      <div><strong lang="fa" dir="rtl">{locked ? "—" : pattern.form}</strong><span>Level {pattern.level}</span></div>
                      <h3>{pattern.name}</h3>
                      <p>{locked ? "Graduate to reveal this pattern." : pattern.meaning}</p>
                    </div>
                  );
                })}
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
                    <div><strong lang="fa" dir="rtl">{displayWord(word)}</strong><span>{word.meaning}</span></div>
                    <div><span>{stat.seen} reviews</span><small>{stat.dueAt <= Date.now() ? "Due now" : `in ${Math.max(1, Math.ceil((stat.dueAt - Date.now()) / 86_400_000))}d`}</small></div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "about" && (
          <section className="about-view">
            <div className="page-intro">
              <span className="eyebrow">ABOUT RAVÂN</span>
              <h1>Learn to read Farsi—not lean on transliteration.</h1>
              <p>Ravân is a calm, adaptive path from unfamiliar Persian shapes to words you recognize directly.</p>
            </div>

            <div className="about-hero">
              <span className="about-mark" lang="fa" dir="rtl">روان</span>
              <div>
                <span className="eyebrow">THE METHOD</span>
                <h2>A bridge from sound to meaning</h2>
                <p>Each word begins with a pronunciation match. Once that connection is secure, Ravân increasingly asks for meaning and revisits anything you miss.</p>
              </div>
            </div>

            <div className="about-method">
              <div><b>1</b><strong>Sound bridge</strong><span>Connect Persian spelling to pronunciation.</span></div>
              <div><b>2</b><strong>Pattern recognition</strong><span>Spot recurring chunks inside real words.</span></div>
              <div><b>3</b><strong>Direct reading</strong><span>Gradually respond without Latin letters.</span></div>
            </div>

            <div className="settings-card">
              <div className="settings-heading">
                <div><span className="eyebrow">ON YOUR PHONE</span><h2>{installed ? "Ravân is installed" : "Keep Ravân one tap away"}</h2></div>
                {!installed && <button className="small-action" onClick={installApp}>Add to Home Screen</button>}
              </div>
              <p>{installed ? "You’re using Ravân as a Home Screen app." : "Install the web app for a full-screen, app-like experience without an app store."}</p>
              {showInstallHelp && !installed && (
                <div className="install-help">
                  <strong>Install from your browser</strong>
                  <span>On iPhone or iPad: tap Share, then “Add to Home Screen.”</span>
                  <span>On Android: open the browser menu and choose “Install app” or “Add to Home screen.”</span>
                </div>
              )}
              <button className="secondary-action" onClick={shareApp}>Share Ravân</button>
              {shareStatus && <span className="action-status">{shareStatus}</span>}
            </div>

            <div className="settings-card">
              <div className="settings-heading">
                <div><span className="eyebrow">PRACTICE REMINDER</span><h2>Return on your rhythm</h2></div>
                <button
                  type="button"
                  className="vowel-toggle settings-toggle"
                  role="switch"
                  aria-checked={reminder.enabled}
                  onClick={() => setReminder((current) => ({ ...current, enabled: !current.enabled }))}
                >
                  <span className="toggle-track"><span /></span>
                  {reminder.enabled ? "On" : "Off"}
                </button>
              </div>
              <p>Static websites cannot reliably send scheduled notifications while closed. Ravân can instead add a recurring event to your phone’s calendar.</p>
              {reminder.enabled && (
                <>
                  <div className="reminder-controls">
                    <label>
                      <span>Time</span>
                      <input
                        type="time"
                        value={reminder.time}
                        onChange={(event) => setReminder((current) => ({ ...current, time: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Repeat</span>
                      <select
                        value={reminder.interval}
                        onChange={(event) => setReminder((current) => ({ ...current, interval: Number(event.target.value) }))}
                      >
                        <option value={1}>Every day</option>
                        <option value={2}>Every 2 days</option>
                        <option value={3}>Every 3 days</option>
                        <option value={7}>Every week</option>
                      </select>
                    </label>
                  </div>
                  <button className="secondary-action" onClick={downloadReminder}>Add reminder to calendar</button>
                </>
              )}
            </div>

            <div className="settings-card">
              <div className="settings-heading">
                <div><span className="eyebrow">PREFERENCES</span><h2>Make practice comfortable</h2></div>
              </div>
              <div className="preference-list">
                <div>
                  <span><strong>Vowel marks</strong><small>Show teaching marks when available.</small></span>
                  <button
                    type="button"
                    className="vowel-toggle settings-toggle"
                    role="switch"
                    aria-checked={showVowels}
                    onClick={() => setShowVowels((visible) => !visible)}
                  >
                    <span className="toggle-track"><span /></span>
                    {showVowels ? "On" : "Off"}
                  </button>
                </div>
                <div>
                  <span><strong>Gentle haptics</strong><small>Short feedback taps on supported Android phones.</small></span>
                  <button
                    type="button"
                    className="vowel-toggle settings-toggle"
                    role="switch"
                    aria-checked={haptics}
                    onClick={() => setHaptics((enabled) => !enabled)}
                  >
                    <span className="toggle-track"><span /></span>
                    {haptics ? "On" : "Off"}
                  </button>
                </div>
              </div>
            </div>

            <div className="privacy-card">
              <div><span aria-hidden="true">✓</span><strong>Private by default</strong></div>
              <p>Your learning progress and preferences stay in this browser on this device. Ravân has no account, advertising, or tracking.</p>
            </div>

            <button
              className="replay-intro"
              onClick={() => {
                setOnboardingStep(0);
                setShowOnboarding(true);
              }}
            >
              Replay the introduction
            </button>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {(["learn", "journey", "words", "about"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            <Icon name={item} />
            <span>{item === "learn" ? "Practice" : item[0].toUpperCase() + item.slice(1)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
