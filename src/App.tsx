import { useEffect, useMemo, useRef, useState } from "react";
import wordsData from "./data/words.json";
import vowelData from "./data/vowels.json";
import patternsData from "./data/patterns.json";
import { trackEvent, trackSessionEvent } from "./analytics";

type Mode = "meaning" | "transliteration";
type Tab = "learn" | "journey" | "words" | "about";
type Word = {
  id: string;
  persian: string;
  transliteration: string;
  spokenTransliteration?: string;
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
  meaningCorrect?: number;
  lastAnswerCorrect?: boolean;
  interval: number;
  dueAt: number;
  avgMs: number;
};
type PatternProgress = {
  seen: number;
  correct: number;
  wrong: number;
  contextSeen?: number;
  isolationCorrect?: number;
  contextCorrect?: number;
  lastAnswerCorrect?: boolean;
};
type LevelMastery = {
  currentStreak: number;
  bestStreak: number;
  earnedThreshold: number;
};
type MasteryCelebration = {
  level: number;
  threshold: number;
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
  levelMastery: Record<string, LevelMastery>;
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
const APP_URL = "https://baldertencate.github.io/ravan/app/";
const LEVEL_UNLOCK_STREAK = 15;
const LEVELS = [
  { title: "First shapes", copy: "Short, frequent words · ا ب د م ن" },
  { title: "Joining letters", copy: "Everyday connectors and core verbs" },
  { title: "Useful patterns", copy: "Longer words and similar letterforms" },
  { title: "Daily reading", copy: "Common nouns, places, and descriptions" },
  { title: "Fluent recognition", copy: "Longer, less predictable vocabulary" },
];
const MASTERY_STAGES = [
  {
    threshold: 10,
    coverage: 0.25,
    name: "Sprout",
    image: `${import.meta.env.BASE_URL}mastery/sprout.png`,
  },
  {
    threshold: 15,
    coverage: 0.5,
    name: "Bud",
    image: `${import.meta.env.BASE_URL}mastery/bud.png`,
  },
  {
    threshold: 20,
    coverage: 0.75,
    name: "Bloom",
    image: `${import.meta.env.BASE_URL}mastery/bloom.png`,
  },
  {
    threshold: 25,
    coverage: 1,
    name: "Bouquet",
    image: `${import.meta.env.BASE_URL}mastery/bouquet.png`,
  },
] as const;

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
  levelMastery: {},
};

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress;
    const saved = { ...emptyProgress, ...JSON.parse(raw) } as Progress;
    if (!saved.levelMastery || !Object.keys(saved.levelMastery).length) {
      const migrated: Record<string, LevelMastery> = {};
      for (let level = 1; level < saved.highestLevel; level += 1) {
        migrated[level] = {
          currentStreak: 0,
          bestStreak: LEVEL_UNLOCK_STREAK,
          earnedThreshold: LEVEL_UNLOCK_STREAK,
        };
      }
      migrated[saved.activeLevel] = {
        currentStreak: saved.streak,
        bestStreak:
          saved.highestLevel === 1
            ? Math.max(saved.streak, saved.bestStreak)
            : saved.streak,
        earnedThreshold:
          masteryStage(
            saved.highestLevel === 1
              ? Math.max(saved.streak, saved.bestStreak)
              : saved.streak,
          )?.threshold ?? 0,
      };
      saved.levelMastery = migrated;
    }
    saved.levelMastery = Object.fromEntries(
      Object.entries(saved.levelMastery).map(([level, mastery]) => [
        level,
        {
          ...mastery,
          earnedThreshold:
            mastery.earnedThreshold ?? masteryStage(mastery.bestStreak)?.threshold ?? 0,
        },
      ]),
    );
    return saved;
  } catch {
    return emptyProgress;
  }
}

function levelMastery(progress: Progress, level = progress.activeLevel): LevelMastery {
  return progress.levelMastery[level] ?? {
    currentStreak: 0,
    bestStreak: 0,
    earnedThreshold: 0,
  };
}

function masteryStage(earnedThreshold: number) {
  return [...MASTERY_STAGES].reverse().find((stage) => earnedThreshold >= stage.threshold) ?? null;
}

function nextMasteryStage(earnedThreshold: number) {
  return MASTERY_STAGES.find((stage) => earnedThreshold < stage.threshold) ?? null;
}

function wordIsMastered(stat?: WordProgress) {
  return Boolean(
    stat &&
      stat.transliterationCorrect >= 1 &&
      (stat.meaningCorrect ?? 0) >= 1 &&
      stat.lastAnswerCorrect !== false,
  );
}

function patternIsMastered(stat?: PatternProgress) {
  return Boolean(
    stat &&
      (stat.isolationCorrect ?? 0) >= 1 &&
      (stat.contextCorrect ?? 0) >= 1 &&
      stat.lastAnswerCorrect !== false,
  );
}

function levelEvidence(progress: Progress, level = progress.activeLevel) {
  const words = WORDS.filter((word) => word.level === level);
  const patterns = PATTERNS.filter((pattern) => pattern.level === level);
  const masteredWords = words.filter((word) => wordIsMastered(progress.words[word.id])).length;
  const masteredPatterns = patterns.filter((pattern) =>
    patternIsMastered(progress.patternStats[pattern.id]),
  ).length;
  return {
    wordCount: words.length,
    masteredWords,
    patternCount: patterns.length,
    masteredPatterns,
  };
}

function requiredWordsForStage(wordCount: number, coverage: number) {
  return Math.ceil(wordCount * coverage);
}

function highestEligibleMasteryStage(progress: Progress, level = progress.activeLevel) {
  const mastery = levelMastery(progress, level);
  const evidence = levelEvidence(progress, level);
  return (
    [...MASTERY_STAGES].reverse().find((stage) => {
      const wordsReady =
        evidence.masteredWords >= requiredWordsForStage(evidence.wordCount, stage.coverage);
      const patternsReady =
        stage.threshold < MASTERY_STAGES.at(-1)!.threshold ||
        evidence.masteredPatterns >= evidence.patternCount;
      return mastery.bestStreak >= stage.threshold && wordsReady && patternsReady;
    }) ?? null
  );
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

function answerVariants(word: Word, mode: Mode) {
  const answers =
    mode === "transliteration"
      ? [word.transliteration, word.spokenTransliteration]
      : [word.meaning];
  return answers
    .filter((answer): answer is string => Boolean(answer))
    .flatMap((answer) =>
      answer
        .trim()
        .toLocaleLowerCase()
        .split(/\s*\/\s*/)
        .filter(Boolean),
    );
}

function transliterationLabel(word: Word) {
  return word.spokenTransliteration
    ? `${word.transliteration} (spoken: ${word.spokenTransliteration})`
    : word.transliteration;
}

function answerLabel(word: Word, mode: Mode) {
  return mode === "transliteration" ? transliterationLabel(word) : word.meaning;
}

function chooseQuestion(progress: Progress, excludeWordId?: string): Question {
  const answerPool = WORDS.filter((word) => word.level <= progress.activeLevel);
  const currentLevelPool = WORDS.filter((word) => word.level === progress.activeLevel);
  const reviewPool = WORDS.filter((word) => word.level < progress.activeLevel);
  const growingWords = currentLevelPool.filter(
    (word) => progress.words[word.id] && !wordIsMastered(progress.words[word.id]),
  );
  const unseenWords = currentLevelPool
    .filter((word) => !progress.words[word.id])
    .sort((a, b) => a.rank - b.rank);
  const learningWave = [
    ...growingWords,
    ...unseenWords.slice(0, Math.max(0, 8 - growingWords.length)),
  ];
  const masteredCurrentWords = currentLevelPool.filter((word) =>
    wordIsMastered(progress.words[word.id]),
  );
  const focusedCurrentPool =
    learningWave.length && (masteredCurrentWords.length === 0 || Math.random() < 0.85)
      ? learningWave
      : masteredCurrentWords.length
        ? masteredCurrentWords
        : currentLevelPool;
  const fullPool =
    reviewPool.length === 0 || Math.random() < 0.78
      ? focusedCurrentPool
      : reviewPool;
  const pool =
    excludeWordId && fullPool.length > 1
      ? fullPool.filter((word) => word.id !== excludeWordId)
      : fullPool;
  const now = Date.now();
  const weighted = pool.map((word) => {
    const stat = progress.words[word.id];
    if (!stat) return { word, weight: 15 + (101 - word.rank) / 30 };
    const accuracy = stat.correct / Math.max(1, stat.seen);
    const overdue = Math.max(0, now - stat.dueAt) / 3_600_000;
    return {
      word,
      weight:
        (wordIsMastered(stat) ? 1.5 : 9) +
        (1 - accuracy) * 8 +
        Math.min(10, overdue),
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
  const needsMeaningEvidence = (stat?.meaningCorrect ?? 0) < 1;
  const mode: Mode = !hasCorrectTransliteration
    ? "transliteration"
    : needsMeaningEvidence || Math.random() < meaningChance
      ? "meaning"
      : "transliteration";
  const otherMode: Mode = mode === "meaning" ? "transliteration" : "meaning";
  const usedAnswers = new Set([
    ...answerVariants(target, mode),
    ...answerVariants(target, otherMode),
  ]);
  const distractors = shuffle(answerPool.filter((word) => word.id !== target.id))
    .filter((word) => {
      const answers = answerVariants(word, mode);
      if (answers.some((answer) => usedAnswers.has(answer))) return false;
      answers.forEach((answer) => usedAnswers.add(answer));
      return true;
    })
    .slice(0, 3);
  return { word: target, options: shuffle([target, ...distractors]), mode };
}

function choosePatternExercise(progress: Progress, excludePatternId?: string): PatternExercise {
  const fullPool = PATTERNS.filter((pattern) => pattern.level <= progress.activeLevel);
  const available =
    excludePatternId && fullPool.length > 1
      ? fullPool.filter((pattern) => pattern.id !== excludePatternId)
      : fullPool;
  const weighted = available.map((pattern) => {
    const stat = progress.patternStats[pattern.id];
    const contextPenalty = 1 + (stat?.contextSeen ?? 0) * 0.75;
    return {
      pattern,
      weight:
        (stat
          ? (4 + stat.wrong * 3 + (1 - stat.correct / stat.seen) * 6) / contextPenalty
          : 10) *
        (pattern.level === progress.activeLevel && !patternIsMastered(stat) ? 3 : 1),
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
  const needsIsolationSuccess = (stat?.isolationCorrect ?? 0) < 1;
  const stage: "isolation" | "context" =
    !stat || (needsIsolationSuccess && stat.seen % 2 === 0) ? "isolation" : "context";
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
  const [levelUnlockNotice, setLevelUnlockNotice] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [masteryCelebration, setMasteryCelebration] = useState<MasteryCelebration | null>(null);
  const startedAt = useRef(Date.now());
  const masteryCelebrationTimer = useRef<number | null>(null);
  const awardedStageRef = useRef("");

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)), [progress]);
  useEffect(() => localStorage.setItem(VOWEL_KEY, String(showVowels)), [showVowels]);
  useEffect(() => localStorage.setItem(REMINDER_KEY, JSON.stringify(reminder)), [reminder]);
  useEffect(() => localStorage.setItem(HAPTICS_KEY, String(haptics)), [haptics]);
  useEffect(
    () => () => {
      if (masteryCelebrationTimer.current) {
        window.clearTimeout(masteryCelebrationTimer.current);
      }
    },
    [],
  );
  useEffect(() => {
    trackSessionEvent("ravan-app-opened", "App Opened");
    if (showOnboarding) trackSessionEvent("ravan-onboarding-started", "Onboarding Started");
  }, [showOnboarding]);
  useEffect(() => {
    const currentMastery = levelMastery(progress);
    const eligibleStage = highestEligibleMasteryStage(progress);
    if (!eligibleStage || eligibleStage.threshold <= currentMastery.earnedThreshold) return;

    const awardKey = `${progress.activeLevel}-${eligibleStage.threshold}`;
    if (awardedStageRef.current === awardKey) return;
    awardedStageRef.current = awardKey;
    const unlocksNextLevel =
      eligibleStage.threshold >= LEVEL_UNLOCK_STREAK &&
      currentMastery.earnedThreshold < LEVEL_UNLOCK_STREAK &&
      progress.activeLevel < LEVELS.length &&
      progress.highestLevel < progress.activeLevel + 1;

    setProgress((current) => {
      const mastery = levelMastery(current);
      if (mastery.earnedThreshold >= eligibleStage.threshold) return current;
      return {
        ...current,
        highestLevel: unlocksNextLevel
          ? Math.max(current.highestLevel, current.activeLevel + 1)
          : current.highestLevel,
        levelMastery: {
          ...current.levelMastery,
          [current.activeLevel]: {
            ...mastery,
            earnedThreshold: eligibleStage.threshold,
          },
        },
      };
    });

    if (masteryCelebrationTimer.current) {
      window.clearTimeout(masteryCelebrationTimer.current);
    }
    setMasteryCelebration({
      level: progress.activeLevel,
      threshold: eligibleStage.threshold,
    });
    masteryCelebrationTimer.current = window.setTimeout(
      () => setMasteryCelebration(null),
      1_600,
    );

    if (unlocksNextLevel) {
      levelUnlockHaptic();
      setLevelUnlockNotice(progress.activeLevel + 1);
      trackEvent("Level Unlocked", { level: progress.activeLevel + 1 });
    } else {
      flowerGrowthHaptic(eligibleStage.threshold);
    }
    trackEvent("Flower Stage Earned", {
      level: progress.activeLevel,
      stage: eligibleStage.name,
      streak: currentMastery.bestStreak,
    });
  }, [
    haptics,
    progress.activeLevel,
    progress.highestLevel,
    progress.levelMastery,
    progress.patternStats,
    progress.words,
  ]);
  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function markInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstallHelp(false);
      trackEvent("App Installed");
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
  const activeMastery = levelMastery(progress);
  const activeEvidence = levelEvidence(progress);
  const earnedMasteryStage = masteryStage(activeMastery.earnedThreshold);
  const upcomingMasteryStage = nextMasteryStage(activeMastery.earnedThreshold);
  const masteryTarget = upcomingMasteryStage?.threshold ?? MASTERY_STAGES.at(-1)!.threshold;
  const masteryProgress = upcomingMasteryStage
    ? Math.min(activeMastery.bestStreak, masteryTarget)
    : activeMastery.currentStreak;
  const masteryRemaining = Math.max(0, masteryTarget - activeMastery.bestStreak);
  const requiredMasteredWords = upcomingMasteryStage
    ? requiredWordsForStage(activeEvidence.wordCount, upcomingMasteryStage.coverage)
    : activeEvidence.wordCount;
  const wordsToNextStage = Math.max(0, requiredMasteredWords - activeEvidence.masteredWords);
  const patternsToNextStage =
    upcomingMasteryStage?.threshold === MASTERY_STAGES.at(-1)!.threshold
      ? Math.max(0, activeEvidence.patternCount - activeEvidence.masteredPatterns)
      : 0;
  const nextGoalParts = upcomingMasteryStage
    ? [
        masteryRemaining > 0
          ? `${masteryRemaining} more for a best streak of ${masteryTarget}`
          : "",
        wordsToNextStage > 0
          ? `master ${wordsToNextStage} more ${wordsToNextStage === 1 ? "word" : "words"}`
          : "",
        patternsToNextStage > 0
          ? `complete ${patternsToNextStage} more ${
              patternsToNextStage === 1 ? "pattern" : "patterns"
            }`
          : "",
      ].filter(Boolean)
    : [];
  const canGraduate =
    progress.activeLevel < LEVELS.length &&
    progress.highestLevel > progress.activeLevel;
  const accuracy = progress.totalAnswers
    ? Math.round((progress.totalCorrect / progress.totalAnswers) * 100)
    : 0;
  const averageSeconds = progress.totalAnswers
    ? (progress.totalMs / progress.totalAnswers / 1000).toFixed(1)
    : "—";
  const mastered = Object.values(progress.words).filter(wordIsMastered).length;
  const dueCount = WORDS.filter((word) => {
    const stat = progress.words[word.id];
    return stat && stat.dueAt <= Date.now();
  }).length;
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

  function wrongAnswerHaptic() {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate(30);
  }

  function levelUnlockHaptic() {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate(180);
  }

  function flowerGrowthHaptic(threshold: number) {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate(threshold === 25 ? [35, 35, 75] : [30, 30, 50]);
  }

  async function installApp() {
    if (installed) return;
    trackEvent("Install Requested");
    if (!installPrompt) {
      setShowInstallHelp(true);
      trackEvent("Install Instructions Shown");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    trackEvent(choice.outcome === "accepted" ? "Install Accepted" : "Install Dismissed");
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  function reminderTimes() {
    const [savedHour, savedMinute] = reminder.time.split(":").map(Number);
    const hour = Number.isFinite(savedHour) ? savedHour : 19;
    const minute = Number.isFinite(savedMinute) ? savedMinute : 0;
    const start = new Date();
    start.setSeconds(0, 0);
    start.setHours(hour, minute, 0, 0);
    if (start.getTime() <= Date.now()) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 15 * 60_000);
    return { start, end };
  }

  function googleCalendarUrl() {
    const { start, end } = reminderTimes();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: "Ravân — Farsi reading practice",
      dates: `${calendarDate(start)}/${calendarDate(end)}`,
      details: `A short Persian reading practice with Ravân.\n\n${APP_URL}`,
      recur: `RRULE:FREQ=DAILY;INTERVAL=${reminder.interval}`,
    });
    if (timeZone) params.set("ctz", timeZone);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function openGoogleCalendar() {
    trackEvent("Reminder Created", { interval_days: reminder.interval, calendar: "google" });
  }

  function downloadCalendarFile() {
    const { start, end } = reminderTimes();
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
    trackEvent("Reminder Created", { interval_days: reminder.interval, calendar: "ics" });
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "complete");
    setShowOnboarding(false);
    setOnboardingStep(0);
    setTab("learn");
    trackEvent("Onboarding Completed", { reminder_selected: reminder.enabled });
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
        trackEvent("App Shared", { method: "native_share" });
      } else {
        await navigator.clipboard.writeText(APP_URL);
        setShareStatus("Link copied");
        trackEvent("App Shared", { method: "copy_link" });
      }
    } catch {
      setShareStatus("");
    }
  }

  function resetApp() {
    [STORAGE_KEY, VOWEL_KEY, ONBOARDING_KEY, REMINDER_KEY, HAPTICS_KEY].forEach((key) =>
      localStorage.removeItem(key),
    );
    ["ravan-app-opened", "ravan-onboarding-started", "ravan-practice-started"].forEach((key) =>
      sessionStorage.removeItem(key),
    );
    window.location.reload();
  }

  function answer(option: Word) {
    if (selected) return;
    const correct = option.id === question.word.id;
    const elapsed = Math.min(30_000, Date.now() - startedAt.current);
    const today = dayKey();
    trackSessionEvent("ravan-practice-started", "Practice Started", {
      level: progress.activeLevel,
    });
    if ((session.answers + 1) % 10 === 0) {
      trackEvent("Practice Set Completed", {
        answers: session.answers + 1,
        correct: session.correct + (correct ? 1 : 0),
        level: progress.activeLevel,
      });
    }
    if (!correct) wrongAnswerHaptic();
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
        meaningCorrect: 0,
        lastAnswerCorrect: true,
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
      const previousMastery = levelMastery(current);
      const streak = correct ? previousMastery.currentStreak + 1 : 0;
      const bestAtLevel = Math.max(previousMastery.bestStreak, streak);
      return {
        ...current,
        words: {
          ...current.words,
          [question.word.id]: {
            seen: previous.seen + 1,
            correct: previous.correct + (correct ? 1 : 0),
            wrong: previous.wrong + (correct ? 0 : 1),
            transliterationCorrect:
              !correct
                ? 0
                : (previous.transliterationCorrect ?? 0) +
                  (correct && question.mode === "transliteration" ? 1 : 0),
            meaningCorrect:
              !correct
                ? 0
                : question.mode === "meaning"
                  ? (previous.meaningCorrect ?? 0) + 1
                  : (previous.meaningCorrect ?? 0),
            lastAnswerCorrect: correct,
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
        levelMastery: {
          ...current.levelMastery,
          [current.activeLevel]: {
            ...previousMastery,
            currentStreak: streak,
            bestStreak: bestAtLevel,
          },
        },
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
    trackSessionEvent("ravan-practice-started", "Practice Started", {
      level: progress.activeLevel,
    });
    if ((session.answers + 1) % 10 === 0) {
      trackEvent("Practice Set Completed", {
        answers: session.answers + 1,
        correct: session.correct + (correct ? 1 : 0),
        level: progress.activeLevel,
      });
    }
    if (!correct) wrongAnswerHaptic();
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
        contextSeen: 0,
        isolationCorrect: 0,
        contextCorrect: 0,
        lastAnswerCorrect: true,
      };
      const gap = current.lastStudyDay ? dayDifference(current.lastStudyDay, today) : 0;
      const dayStreak =
        current.lastStudyDay === today ? current.dayStreak : gap === 1 ? current.dayStreak + 1 : 1;
      const previousMastery = levelMastery(current);
      const streak = correct ? previousMastery.currentStreak + 1 : 0;
      const bestAtLevel = Math.max(previousMastery.bestStreak, streak);
      return {
        ...current,
        patternStats: {
          ...current.patternStats,
          [patternExercise.pattern.id]: {
            seen: previous.seen + 1,
            correct: previous.correct + (correct ? 1 : 0),
            wrong: previous.wrong + (correct ? 0 : 1),
            contextSeen:
              (previous.contextSeen ?? 0) + (patternExercise.stage === "context" ? 1 : 0),
            isolationCorrect:
              (previous.isolationCorrect ?? 0) +
              (correct && patternExercise.stage === "isolation" ? 1 : 0),
            contextCorrect:
              (previous.contextCorrect ?? 0) +
              (correct && patternExercise.stage === "context" ? 1 : 0),
            lastAnswerCorrect: correct,
          },
        },
        totalCorrect: current.totalCorrect + (correct ? 1 : 0),
        totalAnswers: current.totalAnswers + 1,
        totalMs: current.totalMs + elapsed,
        streak,
        bestStreak: Math.max(current.bestStreak, streak),
        levelMastery: {
          ...current.levelMastery,
          [current.activeLevel]: {
            ...previousMastery,
            currentStreak: streak,
            bestStreak: bestAtLevel,
          },
        },
        dayStreak,
        lastStudyDay: today,
      };
    });
  }

  function nextQuestion() {
    const nextProgress = { ...progress };
    const patternNext = progress.activeLevel >= 2 && (session.answers + 1) % 3 === 0;
    if (patternNext) {
      setPatternExercise(choosePatternExercise(nextProgress, patternExercise?.pattern.id));
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
    const nextLevel = Math.min(LEVELS.length, progress.activeLevel + 1);
    const nextProgress = {
      ...progress,
      activeLevel: nextLevel,
      highestLevel: Math.max(progress.highestLevel, nextLevel),
      streak: levelMastery(progress, nextLevel).currentStreak,
    };
    setProgress(nextProgress);
    setQuestion(chooseQuestion(nextProgress, question.word.id));
    setExerciseKind("word");
    setSelected(null);
    setAnsweredCorrectly(null);
    setShowModeHelp(false);
    setSession({ correct: 0, answers: 0 });
    setLevelUnlockNotice(null);
    startedAt.current = Date.now();
    trackEvent("Level Entered", { level: nextLevel, source: "unlock" });
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
              <h1>Learn to read Farsi, one word at a time.</h1>
              <p>Short, adaptive exercises train your eyes to recognize Persian words.</p>
              <div className="onboarding-benefits">
                <span><b>01</b> Connect script to pronunciation, then to meaning</span>
                <span><b>02</b> Recognize useful visual patterns</span>
              </div>
              <blockquote className="literary-quote onboarding-quote">
                <p lang="fa" dir="rtl">قطره قطره جمع کن، دریا نگر</p>
                <footer>
                  <span>“Gather it drop by drop; behold the sea.”</span>
                  <cite>Shah Nematollah Vali</cite>
                </footer>
              </blockquote>
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
              <blockquote className="literary-quote onboarding-quote onboarding-quote-compact">
                <p lang="fa" dir="rtl">
                  صورتش دیدی ز معنی غافلی
                  <br />
                  از صدف دُری گزین گر عاقلی
                </p>
                <footer>
                  <span>“You saw the outward form and missed the meaning; choose the pearl from the shell.”</span>
                  <cite>Rumi</cite>
                </footer>
              </blockquote>
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
                  <div className="calendar-actions onboarding-calendar-actions">
                    <a
                      className="secondary-action calendar-action"
                      href={googleCalendarUrl()}
                      target="_blank"
                      rel="noreferrer"
                      onClick={openGoogleCalendar}
                    >
                      Open Google Calendar
                    </a>
                    <button className="calendar-file-action" onClick={downloadCalendarFile}>Other calendar</button>
                  </div>
                </>
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
      {showResetConfirm && (
        <div className="level-unlock-backdrop">
          <section
            className="reset-confirm-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
            aria-describedby="reset-confirm-copy"
          >
            <span className="eyebrow">RESET RAVÂN</span>
            <h2 id="reset-confirm-title">Start again?</h2>
            <p id="reset-confirm-copy">
              This permanently deletes all practice history, level and flower mastery, streaks,
              reminders, and settings stored on this device.
            </p>
            <div className="reset-confirm-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowResetConfirm(false)}
                autoFocus
              >
                Keep my progress
              </button>
              <button type="button" className="danger-action" onClick={resetApp}>
                Reset app
              </button>
            </div>
          </section>
        </div>
      )}
      {levelUnlockNotice && (
        <div className="level-unlock-backdrop">
          <section
            className="level-unlock-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="level-unlock-title"
          >
            <div className="level-unlock-flower-wrap" aria-hidden="true">
              <img
                className="level-unlock-flower"
                src={MASTERY_STAGES[1].image}
                alt=""
              />
              <i>✦</i>
              <i>✦</i>
              <i>✦</i>
            </div>
            <span className="eyebrow">A NEW READING STEP</span>
            <h2 id="level-unlock-title">
              Barikala <span lang="fa" dir="rtl">(باریکلا)</span>
            </h2>
            <p>Level {levelUnlockNotice} unlocked!</p>
            <div className="level-unlock-growth">
              <strong>Your flower is now a bud.</strong>
              <span>
                Stay on Level {progress.activeLevel} to keep growing it: strengthen more words for
                a Bloom, then master every word and pattern for a Bouquet.
              </span>
            </div>
            <div className="level-unlock-actions">
              <button className="primary-action" onClick={graduate} autoFocus>
                Go to Level {levelUnlockNotice} <span>→</span>
              </button>
              <button
                className="text-action"
                onClick={() => setLevelUnlockNotice(null)}
              >
                Stay and grow my flower
              </button>
            </div>
          </section>
        </div>
      )}
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

            <div
              className={`graduation-card ${canGraduate ? "ready" : ""} ${
                masteryCelebration?.level === progress.activeLevel ? "flower-celebrating" : ""
              }`}
            >
              <div className="current-level">
                <div>
                  <span>LEVEL</span>
                  <strong>{progress.activeLevel}</strong>
                </div>
                <div
                  className={`mastery-flower ${
                    masteryCelebration?.level === progress.activeLevel ? "celebrating" : ""
                  }`}
                >
                  <img
                    className={earnedMasteryStage ? "" : "not-earned"}
                    src={earnedMasteryStage?.image ?? MASTERY_STAGES[0].image}
                    alt={earnedMasteryStage ? `${earnedMasteryStage.name} mastery` : ""}
                  />
                  <i aria-hidden="true">✦</i>
                  <i aria-hidden="true">✦</i>
                  <i aria-hidden="true">✦</i>
                </div>
              </div>
              <div className="graduation-copy">
                <div aria-live="polite">
                  <strong>
                    {earnedMasteryStage
                      ? `${earnedMasteryStage.name} earned`
                      : "Grow your first sprout"}
                  </strong>
                  <span>
                    {upcomingMasteryStage
                      ? `${upcomingMasteryStage.name}: ${
                          nextGoalParts.join(" · ") || "ready to grow"
                        }${
                          upcomingMasteryStage.threshold === LEVEL_UNLOCK_STREAK &&
                          progress.activeLevel < LEVELS.length
                            ? ` and unlock Level ${progress.activeLevel + 1}`
                            : ""
                        }`
                      : `Your bouquet is fully grown. Keep your current streak going.`}
                  </span>
                </div>
                <div className="mastery-goals">
                  <div
                    className="graduation-track streak-goal"
                    aria-label={
                      upcomingMasteryStage
                        ? `Best streak ${activeMastery.bestStreak}; ${masteryTarget} required; current streak ${activeMastery.currentStreak}`
                        : `Current answer streak ${activeMastery.currentStreak}; personal best ${activeMastery.bestStreak}`
                    }
                  >
                    <span
                      className="best-streak-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          (Math.min(activeMastery.bestStreak, masteryTarget) / masteryTarget) * 100,
                        )}%`,
                      }}
                    />
                    <span
                      className="current-streak-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          (Math.min(activeMastery.currentStreak, masteryTarget) / masteryTarget) *
                            100,
                        )}%`,
                      }}
                    />
                    <b>
                      {upcomingMasteryStage
                        ? activeMastery.bestStreak >= masteryTarget
                          ? `Streak goal ${masteryTarget} reached · now ${activeMastery.currentStreak}`
                          : `Best streak ${masteryProgress}/${masteryTarget} · now ${activeMastery.currentStreak}`
                        : `Current ${activeMastery.currentStreak} · best ${activeMastery.bestStreak}`}
                    </b>
                  </div>
                  {upcomingMasteryStage && (
                    <div
                      className="graduation-track word-goal"
                      aria-label={`${activeEvidence.masteredWords} of ${requiredMasteredWords} words mastered toward ${upcomingMasteryStage.name}`}
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            (activeEvidence.masteredWords / Math.max(1, requiredMasteredWords)) * 100,
                          )}%`,
                        }}
                      />
                      <b>Words mastered {activeEvidence.masteredWords}/{requiredMasteredWords}</b>
                    </div>
                  )}
                  {upcomingMasteryStage &&
                    upcomingMasteryStage.threshold === MASTERY_STAGES.at(-1)!.threshold &&
                    activeEvidence.patternCount > 0 && (
                      <div
                        className="graduation-track pattern-goal"
                        aria-label={`${activeEvidence.masteredPatterns} of ${activeEvidence.patternCount} patterns mastered toward Bouquet`}
                      >
                        <span
                          style={{
                            width: `${Math.min(
                              100,
                              (activeEvidence.masteredPatterns /
                                Math.max(1, activeEvidence.patternCount)) *
                                100,
                            )}%`,
                          }}
                        />
                        <b>
                          Patterns mastered {activeEvidence.masteredPatterns}/
                          {activeEvidence.patternCount}
                        </b>
                      </div>
                    )}
                </div>
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
                        <span>{answerLabel(option, question.mode)}</span>
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
                        {" · "}{transliterationLabel(question.word)} · {question.word.meaning}
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
              <div className="stat-card"><span>Words mastered</span><strong>{mastered}</strong><small>sound and meaning confirmed</small></div>
            </div>
            <div className="section-card">
              <div className="section-heading">
                <div><span className="eyebrow">LEARNING PATH</span><h2>Practice and make each flower grow</h2></div>
                <span>{WORDS.filter((w) => w.level <= unlockedLevel).length} words available</span>
              </div>
              <div className="level-list">
                {LEVELS.map((level, index) => {
                  const number = index + 1;
                  const locked = number > unlockedLevel;
                  const active = number === progress.activeLevel;
                  const mastery = levelMastery(progress, number);
                  const stage = masteryStage(mastery.earnedThreshold);
                  const evidence = levelEvidence(progress, number);
                  const nextStage = nextMasteryStage(mastery.earnedThreshold);
                  const nextWordTarget = nextStage
                    ? requiredWordsForStage(evidence.wordCount, nextStage.coverage)
                    : evidence.wordCount;
                  const levelProgressLabel = stage
                    ? nextStage
                      ? nextStage.threshold === MASTERY_STAGES.at(-1)!.threshold &&
                        evidence.masteredWords >= nextWordTarget &&
                        evidence.patternCount > 0
                        ? `${stage.name} · ${evidence.masteredPatterns}/${evidence.patternCount} patterns to Bouquet`
                        : `${stage.name} · ${evidence.masteredWords}/${nextWordTarget} words to ${nextStage.name}`
                      : `${stage.name} · complete`
                    : `${evidence.masteredWords}/${nextWordTarget} words to ${
                        nextStage?.name ?? "Sprout"
                      }`;
                  return (
                    <button
                      key={level.title}
                      className={`level-row ${active ? "active" : ""}`}
                      disabled={locked}
                      onClick={() => {
                        const nextProgress = {
                          ...progress,
                          activeLevel: number,
                          streak: mastery.currentStreak,
                        };
                        setProgress(nextProgress);
                        setQuestion(chooseQuestion(nextProgress));
                        setExerciseKind("word");
                        setSelected(null);
                        setAnsweredCorrectly(null);
                        setShowModeHelp(false);
                        setSession({ correct: 0, answers: 0 });
                        setTab("learn");
                        startedAt.current = Date.now();
                      }}
                    >
                      <span className="level-number">{locked ? "·" : number}</span>
                      <span><strong>{level.title}</strong><small>{level.copy}</small></span>
                      {!locked && (
                        <span className={`level-mastery ${stage ? "" : "empty"}`}>
                          <img
                            src={stage?.image ?? MASTERY_STAGES[0].image}
                            alt=""
                            aria-hidden="true"
                          />
                          <small>{levelProgressLabel}</small>
                        </span>
                      )}
                      <span>
                        {locked
                          ? number === progress.activeLevel + 1
                            ? "Earn Bud"
                            : "Locked"
                          : active
                            ? "Current"
                            : "Practise"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mastery-key" aria-label="Permanent flower mastery stages">
                {MASTERY_STAGES.map((stage) => (
                  <span key={stage.name}>
                    <img src={stage.image} alt="" aria-hidden="true" />
                    <small>
                      <b>{stage.threshold} streak</b>
                      <br />
                      {Math.round(stage.coverage * 100)}% · {stage.name}
                    </small>
                  </span>
                ))}
                <p>
                  Each flower needs both the best streak shown and mastered level words. Bouquet
                  also requires every level pattern. Earned flowers never shrink.
                </p>
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
              <p>{dueCount} due now · {mastered} mastered · stored only on this device</p>
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
                const accuracy = Math.round((stat.correct / stat.seen) * 100);
                const masterySteps =
                  stat.lastAnswerCorrect === false
                    ? 0
                    : Number(stat.transliterationCorrect >= 1) +
                      Number((stat.meaningCorrect ?? 0) >= 1);
                const masteryScore = masterySteps * 50;
                return (
                  <div className="word-row" key={word.id}>
                    <div
                      className={`mini-ring ${masterySteps === 2 ? "complete" : ""}`}
                      style={{ "--score": `${masteryScore * 3.6}deg` } as React.CSSProperties}
                      aria-label={`${masterySteps} of 2 word mastery steps complete`}
                    >
                      <span>{masterySteps === 2 ? "✓" : `${masterySteps}/2`}</span>
                    </div>
                    <div>
                      <strong lang="fa" dir="rtl">{displayWord(word)}</strong>
                      <span>{transliterationLabel(word)} · {word.meaning}</span>
                    </div>
                    <div>
                      <span>{stat.seen} reviews · {accuracy}% correct</span>
                      <small>
                        {stat.dueAt <= Date.now()
                          ? "Due now"
                          : `in ${Math.max(
                              1,
                              Math.ceil((stat.dueAt - Date.now()) / 86_400_000),
                            )}d`}
                      </small>
                    </div>
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
              <h1>Helpful practice for learning to read Farsi.</h1>
              <p>Ravân complements courses, tutors, textbooks, and language apps with interactive exercises that track and grow your Persian reading skills.</p>
              <blockquote className="literary-quote about-literary-quote">
                <p lang="fa" dir="rtl">
                  درخت تو گر بار دانش بگیرد
                  <br />
                  به زیر آوری چرخ نیلوفری را
                </p>
                <footer>
                  <span>“If your tree bears the fruit of knowledge, you can bring the azure heavens within reach.”</span>
                  <cite>Naser Khosrow</cite>
                </footer>
              </blockquote>
            </div>

            <div className="about-actions">
              <button className="about-action primary" onClick={installApp} disabled={installed}>
                <span aria-hidden="true">＋</span>
                {installed ? "Added to Home Screen" : "Add to Home Screen"}
              </button>
              <button className="about-action" onClick={shareApp}>
                <span aria-hidden="true">↗</span>
                Share with friends
              </button>
            </div>
            {showInstallHelp && !installed && (
              <div className="install-help about-install-help">
                <strong>Install from your browser</strong>
                <span>On iPhone or iPad: tap Share, then “Add to Home Screen.”</span>
                <span>On Android: open the browser menu and choose “Install app” or “Add to Home screen.”</span>
              </div>
            )}
            {shareStatus && <div className="about-action-status">{shareStatus}</div>}

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
              <p>Ravân can open a recurring event in Google Calendar. If you use another calendar, you can download a calendar file instead.</p>
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
                  <div className="calendar-actions">
                    <a
                      className="secondary-action calendar-action"
                      href={googleCalendarUrl()}
                      target="_blank"
                      rel="noreferrer"
                      onClick={openGoogleCalendar}
                    >
                      Open Google Calendar
                    </a>
                    <button className="calendar-file-action" onClick={downloadCalendarFile}>Use another calendar</button>
                  </div>
                </>
              )}
            </div>

            <div className="settings-card">
              <div className="settings-heading">
                <div><span className="eyebrow">SETTINGS</span><h2>Preferences</h2></div>
              </div>
              <div className="preference-list">
                <div>
                  <span><strong>Gentle haptics</strong><small>A short tap for a wrong answer, a gentle pulse when a flower grows, and a longer tap when a new level unlocks.</small></span>
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
            <div className="about-utility-links">
              <button
                type="button"
                className="about-replay-link"
                onClick={() => {
                  setOnboardingStep(0);
                  setShowOnboarding(true);
                  trackEvent("Onboarding Replayed");
                }}
              >
                Replay introduction
              </button>
              <button
                type="button"
                className="about-reset-link"
                onClick={() => setShowResetConfirm(true)}
              >
                Reset app
              </button>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {(["learn", "journey", "words", "about"] as Tab[]).map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => {
              setTab(item);
              trackEvent("Tab Opened", { tab: item });
            }}
          >
            <Icon name={item} />
            <span>{item === "learn" ? "Practice" : item[0].toUpperCase() + item.slice(1)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
