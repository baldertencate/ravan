import { useEffect, useMemo, useRef, useState } from "react";
import wordsData from "./data/words.json";
import phrasesData from "./data/phrases.json";
import vowelData from "./data/vowels.json";
import patternsData from "./data/patterns.json";
import { LETTER_ALIASES, PERSIAN_ALPHABET } from "./data/alphabet";
import { trackEvent, trackSessionEvent } from "./analytics";

type Mode = "meaning" | "transliteration" | "segmentation";
type Tab = "learn" | "journey" | "alphabet" | "words" | "settings";
type ReadingHelp = {
  label: string;
  markedPersian: string;
  explanation: string;
};
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
  kind?: "word" | "phrase";
  segments?: string[];
  readingHelp?: ReadingHelp;
};
type WordProgress = {
  seen: number;
  correct: number;
  wrong: number;
  transliterationCorrect: number;
  meaningCorrect?: number;
  segmentationCorrect?: number;
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
type WordBoundaryProgress = {
  mastered: boolean;
  needsRefresh: boolean;
  correctPhraseIds: string[];
  exercisesSinceCheck: number;
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
  wordBoundaries: WordBoundaryProgress;
};
type QuestionOption = {
  id: string;
  label: string;
  segments?: string[];
};
type Question = { word: Word; options: QuestionOption[]; mode: Mode };
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
  kind: "word" as const,
  vowelled: VOWELLED[word.id] ?? word.persian,
}));
const PHRASES = phrasesData as Word[];
const ITEMS = [...WORDS, ...PHRASES];
const PATTERNS = patternsData as Pattern[];
const COMBINING_MARK = /\p{M}/u;
const STORAGE_KEY = "ravan-progress-v1";
const DEBUG_STORAGE_KEY = "ravan-debug-progress-v1";
const VOWEL_KEY = "ravan-show-vowels-v1";
const ONBOARDING_KEY = "ravan-onboarding-v1";
const REMINDER_KEY = "ravan-reminder-v1";
const HAPTICS_KEY = "ravan-haptics-v1";
const DONATION_KEY = "ravan-donation-supported-v1";
const DEBUG_DONATION_KEY = "ravan-debug-donation-supported-v1";
const APP_URL = "https://baldertencate.github.io/ravan/app/";
const PAYPAL_DONATION_URL =
  "https://www.paypal.com/donate/?business=KNVTU38K3S588&no_recurring=1&item_name=Thank+you+for+your+voluntary+donation+to+support+the+continued+development+of+the+Ravan+app%21&currency_code=USD";
const LEVEL_UNLOCK_STREAK = 15;
const WORD_BOUNDARY_INITIAL_GOAL = 5;
const WORD_BOUNDARY_REFRESH_GOAL = 3;
const WORD_BOUNDARY_CHECK_INTERVAL = 12;
const LEVELS = [
  { title: "First word shapes", copy: "Very short, high-frequency words" },
  { title: "Common word shapes", copy: "Connectors, questions, and varied joining forms" },
  { title: "Verbs and patterns", copy: "Core verbs, common endings, and longer forms" },
  { title: "Everyday vocabulary", copy: "Longer nouns and varied letter combinations" },
  { title: "Confident word recognition", copy: "Less predictable vocabulary, one word at a time" },
  { title: "Reading short phrases", copy: "Word boundaries, ezafe, and short combinations" },
];
const SEARCH_PARAMS = new URLSearchParams(window.location.search);
const DEBUG_MODE = SEARCH_PARAMS.get("debug") === "1";
const REQUESTED_DEBUG_LEVEL = Number(SEARCH_PARAMS.get("level"));
const DEBUG_START_LEVEL =
  DEBUG_MODE &&
  Number.isInteger(REQUESTED_DEBUG_LEVEL) &&
  REQUESTED_DEBUG_LEVEL >= 1 &&
  REQUESTED_DEBUG_LEVEL <= LEVELS.length
    ? REQUESTED_DEBUG_LEVEL
    : null;
const REQUESTED_DEBUG_UNLOCK = Number(SEARCH_PARAMS.get("unlock"));
const DEBUG_UNLOCK_NOTICE =
  DEBUG_MODE &&
  Number.isInteger(REQUESTED_DEBUG_UNLOCK) &&
  REQUESTED_DEBUG_UNLOCK >= 2 &&
  REQUESTED_DEBUG_UNLOCK <= LEVELS.length
    ? REQUESTED_DEBUG_UNLOCK
    : null;
const REQUESTED_DEBUG_COMPLETION = Number(SEARCH_PARAMS.get("complete"));
const DEBUG_COMPLETION_NOTICE =
  DEBUG_MODE &&
  Number.isInteger(REQUESTED_DEBUG_COMPLETION) &&
  REQUESTED_DEBUG_COMPLETION >= 1 &&
  REQUESTED_DEBUG_COMPLETION <= LEVELS.length
    ? REQUESTED_DEBUG_COMPLETION
    : null;
const REQUESTED_DEBUG_BUD = Number(SEARCH_PARAMS.get("bud"));
const DEBUG_FINAL_BUD_NOTICE =
  DEBUG_MODE && REQUESTED_DEBUG_BUD === LEVELS.length ? LEVELS.length : null;
const DEBUG_ALL_LEVELS_NOTICE = DEBUG_MODE && SEARCH_PARAMS.get("allComplete") === "1";
const ACTIVE_STORAGE_KEY = DEBUG_MODE ? DEBUG_STORAGE_KEY : STORAGE_KEY;
const ACTIVE_DONATION_KEY = DEBUG_MODE ? DEBUG_DONATION_KEY : DONATION_KEY;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const MASTERY_CELEBRATION_DURATION = REDUCED_MOTION ? 400 : 4_400;
const CELEBRATION_NOTICE_DELAY = REDUCED_MOTION ? 250 : 4_000;
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
const ALPHABET_BY_LETTER = new Map(PERSIAN_ALPHABET.map((letter) => [letter.letter, letter]));

function highlightPattern(text: string, pattern: Pattern, exampleChunk?: string) {
  const chunk = exampleChunk ?? pattern.chunk;
  const visibleCharacters: { character: string; start: number }[] = [];
  let originalOffset = 0;

  for (const character of text) {
    if (!COMBINING_MARK.test(character)) {
      visibleCharacters.push({ character, start: originalOffset });
    }
    originalOffset += character.length;
  }

  const searchableText = visibleCharacters.map(({ character }) => character).join("");
  const searchableChunk = [...chunk].filter((character) => !COMBINING_MARK.test(character)).join("");
  const index =
    pattern.position === "suffix"
      ? searchableText.lastIndexOf(searchableChunk)
      : searchableText.indexOf(searchableChunk);

  if (index < 0) return text;

  const start = visibleCharacters[index].start;
  const end = visibleCharacters[index + searchableChunk.length]?.start ?? text.length;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

type ExerciseLetter = {
  original: string;
  base: string;
  form: string;
};

function normalizeLetter(character: string) {
  return LETTER_ALIASES[character] ?? character;
}

function exerciseLetters(text: string): ExerciseLetter[] {
  const characters = [...text];
  const letters = characters
    .map((character, index) => ({
      original: character,
      base: normalizeLetter(character),
      index,
    }))
    .filter(({ base }) => ALPHABET_BY_LETTER.has(base));

  const isBrokenBetween = (leftIndex: number, rightIndex: number) =>
    characters
      .slice(leftIndex + 1, rightIndex)
      .some((character) => /[\u200c\s·.\/–—-]/u.test(character));

  return letters.map(({ original, base, index }, letterIndex) => {
    const letter = ALPHABET_BY_LETTER.get(base)!;
    const previous = letters[letterIndex - 1];
    const next = letters[letterIndex + 1];
    const joinsPrevious =
      Boolean(previous) &&
      !isBrokenBetween(previous.index, index) &&
      !ALPHABET_BY_LETTER.get(previous.base)?.nonJoining;
    const joinsNext =
      Boolean(next) && !isBrokenBetween(index, next.index) && !letter.nonJoining;
    const form = joinsPrevious
      ? joinsNext
        ? `ـ${original}ـ`
        : `ـ${original}`
      : joinsNext
        ? `${original}ـ`
        : original;

    return { original, base, form };
  });
}

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
  wordBoundaries: {
    mastered: false,
    needsRefresh: false,
    correctPhraseIds: [],
    exercisesSinceCheck: 0,
  },
};

function freshProgress(): Progress {
  return {
    ...emptyProgress,
    words: {},
    patternStats: {},
    levelMastery: {},
    wordBoundaries: {
      ...emptyProgress.wordBoundaries,
      correctPhraseIds: [],
    },
    activeLevel: DEBUG_START_LEVEL ?? 1,
    highestLevel: DEBUG_MODE ? LEVELS.length : 1,
  };
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
    if (!raw) return freshProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const saved = {
      ...emptyProgress,
      ...parsed,
      words: parsed.words ?? {},
      patternStats: parsed.patternStats ?? {},
      levelMastery: parsed.levelMastery ?? {},
      wordBoundaries: {
        ...emptyProgress.wordBoundaries,
        ...parsed.wordBoundaries,
        correctPhraseIds: parsed.wordBoundaries?.correctPhraseIds ?? [],
      },
    } as Progress;
    if (!parsed.wordBoundaries) {
      const correctPhraseIds = PHRASES.filter(
        (phrase) => (saved.words[phrase.id]?.segmentationCorrect ?? 0) >= 1,
      ).map((phrase) => phrase.id);
      const mastered = correctPhraseIds.length >= WORD_BOUNDARY_INITIAL_GOAL;
      saved.wordBoundaries = {
        mastered,
        needsRefresh: false,
        correctPhraseIds: mastered
          ? []
          : correctPhraseIds.slice(0, WORD_BOUNDARY_INITIAL_GOAL),
        exercisesSinceCheck: 0,
      };
    }
    if (DEBUG_MODE) {
      saved.highestLevel = LEVELS.length;
      if (DEBUG_START_LEVEL) saved.activeLevel = DEBUG_START_LEVEL;
    }
    if (!saved.levelMastery || !Object.keys(saved.levelMastery).length) {
      if (DEBUG_MODE) {
        saved.levelMastery = {};
      } else {
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
    return freshProgress();
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

function itemIsMastered(_item: Word, stat?: WordProgress) {
  return wordIsMastered(stat);
}

function wordBoundaryPracticeNeeded(progress: Progress) {
  const boundary = progress.wordBoundaries;
  return (
    progress.activeLevel === 6 &&
    (!boundary.mastered ||
      boundary.needsRefresh ||
      boundary.exercisesSinceCheck >= WORD_BOUNDARY_CHECK_INTERVAL)
  );
}

function recordWordBoundaryAnswer(
  boundary: WordBoundaryProgress,
  phraseId: string,
  correct: boolean,
): WordBoundaryProgress {
  if (!correct) {
    return {
      ...boundary,
      needsRefresh: boundary.mastered,
      correctPhraseIds: [],
      exercisesSinceCheck: 0,
    };
  }

  if (!boundary.mastered) {
    const correctPhraseIds = boundary.correctPhraseIds.includes(phraseId)
      ? boundary.correctPhraseIds
      : [...boundary.correctPhraseIds, phraseId];
    const mastered = correctPhraseIds.length >= WORD_BOUNDARY_INITIAL_GOAL;
    return {
      mastered,
      needsRefresh: false,
      correctPhraseIds: mastered ? [] : correctPhraseIds,
      exercisesSinceCheck: 0,
    };
  }

  if (boundary.needsRefresh) {
    const correctPhraseIds = boundary.correctPhraseIds.includes(phraseId)
      ? boundary.correctPhraseIds
      : [...boundary.correctPhraseIds, phraseId];
    const refreshed = correctPhraseIds.length >= WORD_BOUNDARY_REFRESH_GOAL;
    return {
      ...boundary,
      needsRefresh: !refreshed,
      correctPhraseIds: refreshed ? [] : correctPhraseIds,
      exercisesSinceCheck: 0,
    };
  }

  return {
    ...boundary,
    correctPhraseIds: [],
    exercisesSinceCheck: 0,
  };
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
  const items = ITEMS.filter((item) => item.level === level);
  const patterns = PATTERNS.filter((pattern) => pattern.level === level);
  const masteredItems = items.filter((item) =>
    itemIsMastered(item, progress.words[item.id]),
  ).length;
  const masteredPatterns = patterns.filter((pattern) =>
    patternIsMastered(progress.patternStats[pattern.id]),
  ).length;
  return {
    itemCount: items.length,
    masteredItems,
    itemLabel: level === 6 ? "phrase" : "word",
    patternCount: patterns.length,
    masteredPatterns,
  };
}

function requiredItemsForStage(itemCount: number, coverage: number) {
  return Math.ceil(itemCount * coverage);
}

function highestEligibleMasteryStage(progress: Progress, level = progress.activeLevel) {
  const mastery = levelMastery(progress, level);
  const evidence = levelEvidence(progress, level);
  return (
    [...MASTERY_STAGES].reverse().find((stage) => {
      const itemsReady =
        evidence.masteredItems >= requiredItemsForStage(evidence.itemCount, stage.coverage);
      const patternsReady =
        stage.threshold < MASTERY_STAGES.at(-1)!.threshold ||
        evidence.masteredPatterns >= evidence.patternCount;
      return mastery.bestStreak >= stage.threshold && itemsReady && patternsReady;
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
  if (DEBUG_MODE) return false;
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
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  return mode === "transliteration"
    ? transliterationLabel(word)
    : mode === "meaning"
      ? word.meaning
      : word.persian;
}

function phraseSegmentationOptions(item: Word): QuestionOption[] {
  const correctSegments = item.segments ?? item.persian.split(/\s+/);
  const alternatives: string[][] = [];
  const seen = new Set([correctSegments.join("\u0000")]);
  const addAlternative = (segments: string[][]) => {
    const candidate = segments.map((segment) => segment.join(""));
    if (candidate.some((segment) => !segment)) return;
    const key = candidate.join("\u0000");
    if (seen.has(key)) return;
    seen.add(key);
    alternatives.push(candidate);
  };
  const characterSegments = correctSegments.map((segment) => [...segment]);

  for (let boundary = 0; boundary < characterSegments.length - 1; boundary += 1) {
    const left = characterSegments[boundary];
    const right = characterSegments[boundary + 1];
    if (left.length > 1) {
      const movedRight = characterSegments.map((segment) => [...segment]);
      movedRight[boundary + 1].unshift(movedRight[boundary].pop()!);
      addAlternative(movedRight);
    }
    if (right.length > 1) {
      const movedLeft = characterSegments.map((segment) => [...segment]);
      movedLeft[boundary].push(movedLeft[boundary + 1].shift()!);
      addAlternative(movedLeft);
    }
  }

  if (alternatives.length < 3 && characterSegments[0].length > 2) {
    const splitAt = Math.ceil(characterSegments[0].length / 2);
    addAlternative([
      characterSegments[0].slice(0, splitAt),
      characterSegments[0].slice(splitAt),
      ...characterSegments.slice(1),
    ]);
  }
  if (alternatives.length < 3) {
    addAlternative([characterSegments.flat()]);
  }

  return shuffle([
    {
      id: item.id,
      label: correctSegments.join(" | "),
      segments: correctSegments,
    },
    ...alternatives.slice(0, 3).map((segments, index) => ({
      id: `${item.id}-boundary-${index}`,
      label: segments.join(" | "),
      segments,
    })),
  ]);
}

function chooseQuestion(progress: Progress, excludeWordId?: string): Question {
  const currentLevelPool = ITEMS.filter((word) => word.level === progress.activeLevel);
  const reviewPool = ITEMS.filter((word) => word.level < progress.activeLevel);
  if (wordBoundaryPracticeNeeded(progress)) {
    const boundary = progress.wordBoundaries;
    const completedThisRun = new Set(boundary.correctPhraseIds);
    const freshExamples = PHRASES.filter((phrase) => !completedThisRun.has(phrase.id));
    const candidates = freshExamples.length ? freshExamples : PHRASES;
    const withoutPrevious =
      excludeWordId && candidates.length > 1
        ? candidates.filter((phrase) => phrase.id !== excludeWordId)
        : candidates;
    const target =
      shuffle(withoutPrevious.slice(0, Math.min(6, withoutPrevious.length)))[0] ??
      withoutPrevious[0];
    return { word: target, options: phraseSegmentationOptions(target), mode: "segmentation" };
  }

  const allGrowingWords = currentLevelPool.filter(
    (word) => progress.words[word.id] && !itemIsMastered(word, progress.words[word.id]),
  );
  const growingWords =
    progress.activeLevel === 6
      ? [...allGrowingWords]
          .sort((a, b) => {
            const aProgress = progress.words[a.id];
            const bProgress = progress.words[b.id];
            const aSteps =
              Number((aProgress?.transliterationCorrect ?? 0) >= 1) +
              Number((aProgress?.meaningCorrect ?? 0) >= 1);
            const bSteps =
              Number((bProgress?.transliterationCorrect ?? 0) >= 1) +
              Number((bProgress?.meaningCorrect ?? 0) >= 1);
            return bSteps - aSteps || a.rank - b.rank;
          })
          .slice(0, 3)
      : allGrowingWords;
  const unseenWords = currentLevelPool
    .filter((word) => !progress.words[word.id])
    .sort((a, b) => a.rank - b.rank);
  const learningWaveSize = progress.activeLevel === 6 ? 3 : 8;
  const learningWave = [
    ...growingWords,
    ...unseenWords.slice(0, Math.max(0, learningWaveSize - growingWords.length)),
  ];
  const masteredCurrentWords = currentLevelPool.filter((word) =>
    itemIsMastered(word, progress.words[word.id]),
  );
  const focusedCurrentPool =
    learningWave.length &&
    (progress.activeLevel === 6 ||
      masteredCurrentWords.length === 0 ||
      Math.random() < 0.85)
      ? learningWave
      : masteredCurrentWords.length
        ? masteredCurrentWords
        : currentLevelPool;
  const dueReviewPool = reviewPool.filter((word) => {
    const stat = progress.words[word.id];
    return stat && stat.dueAt <= Date.now();
  });
  const dueMasteredPhrases = masteredCurrentWords.filter((word) => {
    const stat = progress.words[word.id];
    return progress.activeLevel === 6 && stat && stat.dueAt <= Date.now();
  });
  const levelSixDuePool = [...dueMasteredPhrases, ...dueReviewPool];
  const phraseSproutTarget = requiredItemsForStage(
    currentLevelPool.length,
    MASTERY_STAGES[0].coverage,
  );
  const levelSixReviewDue =
    progress.activeLevel === 6 &&
    masteredCurrentWords.length >= phraseSproutTarget &&
    levelSixDuePool.length > 0 &&
    progress.totalAnswers % 12 === 11;
  const fullPool =
    DEBUG_MODE ||
    reviewPool.length === 0 ||
    (progress.activeLevel === 6
      ? !levelSixReviewDue
      : Math.random() < 0.78)
      ? focusedCurrentPool
      : progress.activeLevel === 6 && levelSixDuePool.length
        ? levelSixDuePool
        : dueReviewPool.length
          ? dueReviewPool
        : reviewPool;
  const pool =
    excludeWordId && fullPool.length > 1
      ? fullPool.filter((word) => word.id !== excludeWordId)
      : fullPool;
  const now = Date.now();
  const weighted = pool.map((word) => {
    const stat = progress.words[word.id];
    if (!stat) return { word, weight: 15 + Math.max(0, 160 - word.rank) / 40 };
    const accuracy = stat.correct / Math.max(1, stat.seen);
    const overdue = Math.max(0, now - stat.dueAt) / 3_600_000;
    const levelSixCompletionBoost =
      progress.activeLevel === 6 &&
      word.level === 6 &&
      !itemIsMastered(word, stat) &&
      stat.transliterationCorrect >= 1
        ? 10
        : 0;
    return {
      word,
      weight:
        (itemIsMastered(word, stat) ? 1.5 : 9) +
        levelSixCompletionBoost +
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
  const answerPool =
    target.kind === "phrase"
      ? PHRASES
      : WORDS.filter((word) => word.level <= progress.activeLevel);
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
  return {
    word: target,
    options: shuffle([target, ...distractors]).map((word) => ({
      id: word.id,
      label: answerLabel(word, mode),
    })),
    mode,
  };
}

function choosePatternExercise(progress: Progress, excludePatternId?: string): PatternExercise {
  const fullPool = PATTERNS.filter((pattern) => pattern.level <= progress.activeLevel);
  const available =
    excludePatternId && fullPool.length > 1
      ? fullPool.filter((pattern) => pattern.id !== excludePatternId)
      : fullPool;
  const weighted = available.map((pattern) => {
    const stat = progress.patternStats[pattern.id];
    const mastered = patternIsMastered(stat);
    const accuracy = stat?.seen ? stat.correct / stat.seen : 0;
    const baseWeight = !stat
      ? 12
      : mastered
        ? Math.max(0.3, 1.5 / (1 + (stat.contextSeen ?? 0) * 0.5))
        : (6 +
            (stat.lastAnswerCorrect === false ? 8 : 0) +
            (1 - accuracy) * 5) /
          (1 + (stat.contextSeen ?? 0) * 0.35);
    return {
      pattern,
      weight:
        baseWeight *
        (pattern.level === progress.activeLevel && !mastered ? 2.5 : 1),
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

function shouldSchedulePatternExercise(progress: Progress, nextAnswerNumber: number) {
  if (progress.activeLevel < 2 || progress.activeLevel >= 6) return false;

  const relevantPatterns = PATTERNS.filter(
    (pattern) => pattern.level <= progress.activeLevel,
  );
  if (!relevantPatterns.length) return false;

  const recentlyMissed = relevantPatterns.some(
    (pattern) => progress.patternStats[pattern.id]?.lastAnswerCorrect === false,
  );
  const stillLearning = relevantPatterns.some(
    (pattern) => !patternIsMastered(progress.patternStats[pattern.id]),
  );
  const interval = recentlyMissed ? 3 : stillLearning ? 4 : 10;
  return nextAnswerNumber % interval === 0;
}

function Icon({ name }: { name: Tab | "flame" | "clock" | "check" | "spark" }) {
  const icons = {
    learn: "◉",
    journey: "↗",
    alphabet: "ا",
    words: "≡",
    settings: "⚙",
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
  const [showReadingHelp, setShowReadingHelp] = useState(false);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [showVowels, setShowVowels] = useState(() => localStorage.getItem(VOWEL_KEY) === "true");
  const [exerciseKind, setExerciseKind] = useState<"item" | "pattern">("item");
  const [patternExercise, setPatternExercise] = useState<PatternExercise | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [reminder, setReminder] = useState<ReminderSettings>(loadReminder);
  const [haptics, setHaptics] = useState(() => localStorage.getItem(HAPTICS_KEY) !== "false");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [levelUnlockNotice, setLevelUnlockNotice] = useState<number | null>(DEBUG_UNLOCK_NOTICE);
  const [levelCompletionNotice, setLevelCompletionNotice] = useState<number | null>(
    DEBUG_COMPLETION_NOTICE,
  );
  const [finalLevelBudNotice, setFinalLevelBudNotice] = useState<number | null>(
    DEBUG_FINAL_BUD_NOTICE,
  );
  const [allLevelsMasteredNotice, setAllLevelsMasteredNotice] = useState(
    DEBUG_ALL_LEVELS_NOTICE,
  );
  const [showUnlockReminderSetup, setShowUnlockReminderSetup] = useState(false);
  const [hideUnlockReturnOptions, setHideUnlockReturnOptions] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [donationSupported, setDonationSupported] = useState(
    () => localStorage.getItem(ACTIVE_DONATION_KEY) === "true",
  );
  const [showDonationThanks, setShowDonationThanks] = useState(false);
  const [masteryCelebration, setMasteryCelebration] = useState<MasteryCelebration | null>(null);
  const startedAt = useRef(Date.now());
  const masteryCelebrationTimer = useRef<number | null>(null);
  const celebrationNoticeTimer = useRef<number | null>(null);
  const awardedStageRef = useRef("");

  useEffect(
    () => localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(progress)),
    [progress],
  );
  useEffect(() => localStorage.setItem(VOWEL_KEY, String(showVowels)), [showVowels]);
  useEffect(() => localStorage.setItem(REMINDER_KEY, JSON.stringify(reminder)), [reminder]);
  useEffect(() => localStorage.setItem(HAPTICS_KEY, String(haptics)), [haptics]);
  useEffect(
    () => () => {
      if (masteryCelebrationTimer.current) {
        window.clearTimeout(masteryCelebrationTimer.current);
      }
      if (celebrationNoticeTimer.current) {
        window.clearTimeout(celebrationNoticeTimer.current);
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
    const reachesBud =
      eligibleStage.threshold >= LEVEL_UNLOCK_STREAK &&
      currentMastery.earnedThreshold < LEVEL_UNLOCK_STREAK;
    const hasNextLevel = progress.activeLevel < LEVELS.length;
    const unlocksNextLevel =
      reachesBud &&
      hasNextLevel &&
      progress.highestLevel < progress.activeLevel + 1;
    const showsNextLevelUnlock =
      reachesBud && hasNextLevel && (unlocksNextLevel || DEBUG_MODE);
    const showsFinalLevelBud = reachesBud && !hasNextLevel;
    const completesLevel =
      eligibleStage.threshold === MASTERY_STAGES.at(-1)!.threshold;
    const completesAllAvailableLevels =
      completesLevel &&
      LEVELS.every((_, index) => {
        const level = index + 1;
        return (
          level === progress.activeLevel ||
          levelMastery(progress, level).earnedThreshold >= MASTERY_STAGES.at(-1)!.threshold
        );
      });

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
      MASTERY_CELEBRATION_DURATION,
    );

    if (celebrationNoticeTimer.current) {
      window.clearTimeout(celebrationNoticeTimer.current);
    }
    if (completesLevel) {
      flowerGrowthHaptic(eligibleStage.threshold);
      celebrationNoticeTimer.current = window.setTimeout(
        () => {
          if (completesAllAvailableLevels) {
            setAllLevelsMasteredNotice(true);
          } else {
            setLevelCompletionNotice(progress.activeLevel);
          }
        },
        CELEBRATION_NOTICE_DELAY,
      );
      if (unlocksNextLevel) {
        trackEvent("Level Unlocked", { level: progress.activeLevel + 1 });
      }
      trackEvent("Level Completed", { level: progress.activeLevel });
      if (completesAllAvailableLevels) {
        trackEvent("All Levels Mastered", { levels: LEVELS.length });
      }
    } else if (showsNextLevelUnlock) {
      levelUnlockHaptic();
      celebrationNoticeTimer.current = window.setTimeout(
        () => setLevelUnlockNotice(progress.activeLevel + 1),
        CELEBRATION_NOTICE_DELAY,
      );
      if (unlocksNextLevel) {
        trackEvent("Level Unlocked", { level: progress.activeLevel + 1 });
      }
    } else if (showsFinalLevelBud) {
      flowerGrowthHaptic(eligibleStage.threshold);
      celebrationNoticeTimer.current = window.setTimeout(
        () => setFinalLevelBudNotice(progress.activeLevel),
        CELEBRATION_NOTICE_DELAY,
      );
      trackEvent("Latest Level Bud Earned", { level: progress.activeLevel });
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
  const celebratedMasteryStage = masteryCelebration
    ? masteryStage(masteryCelebration.threshold)
    : null;
  const showProminentMasteryCelebration =
    masteryCelebration?.level === progress.activeLevel && Boolean(celebratedMasteryStage);
  const masteryTarget = upcomingMasteryStage?.threshold ?? MASTERY_STAGES.at(-1)!.threshold;
  const requiredMasteredItems = upcomingMasteryStage
    ? requiredItemsForStage(activeEvidence.itemCount, upcomingMasteryStage.coverage)
    : activeEvidence.itemCount;
  const activeItemPlural = `${activeEvidence.itemLabel}s`;
  const nextStageGoal = (() => {
    if (!upcomingMasteryStage) return "";

    const unlock =
      upcomingMasteryStage.threshold === LEVEL_UNLOCK_STREAK &&
      progress.activeLevel < LEVELS.length
        ? ` to unlock Level ${progress.activeLevel + 1}`
        : "";
    const requirements = [
      `${upcomingMasteryStage.coverage === 1 ? "master all" : "master"} ${requiredMasteredItems} ${
        requiredMasteredItems === 1 ? activeEvidence.itemLabel : activeItemPlural
      }`,
      ...(upcomingMasteryStage.threshold === MASTERY_STAGES.at(-1)!.threshold &&
      activeEvidence.patternCount > 0
        ? [
            `master all ${activeEvidence.patternCount} ${
              activeEvidence.patternCount === 1 ? "pattern" : "patterns"
            }`,
          ]
        : []),
      `reach a streak of ${masteryTarget}`,
    ];
    const requirementText =
      requirements.length === 2
        ? requirements.join(" and ")
        : `${requirements.slice(0, -1).join(", ")}, and ${requirements.at(-1)}`;
    const capitalizedRequirements =
      `${requirementText.charAt(0).toUpperCase()}${requirementText.slice(1)}`;
    const requirementLead = earnedMasteryStage
      ? `Next, ${requirementText}`
      : capitalizedRequirements;

    return `${requirementLead}${unlock}.`;
  })();
  const canGraduate =
    progress.activeLevel < LEVELS.length &&
    progress.highestLevel > progress.activeLevel &&
    activeMastery.earnedThreshold >= LEVEL_UNLOCK_STREAK;
  const activeLevelCompleted =
    activeMastery.earnedThreshold >= MASTERY_STAGES.at(-1)!.threshold;
  const accuracy = progress.totalAnswers
    ? Math.round((progress.totalCorrect / progress.totalAnswers) * 100)
    : 0;
  const averageSeconds = progress.totalAnswers
    ? (progress.totalMs / progress.totalAnswers / 1000).toFixed(1)
    : "—";
  const masteredWords = WORDS.filter((word) =>
    itemIsMastered(word, progress.words[word.id]),
  ).length;
  const masteredPhrases = PHRASES.filter((phrase) =>
    itemIsMastered(phrase, progress.words[phrase.id]),
  ).length;
  const mastered = masteredWords + masteredPhrases;
  const dueCount = ITEMS.filter((item) => {
    const stat = progress.words[item.id];
    return stat && stat.dueAt <= Date.now();
  }).length;
  const matchedPattern = PATTERNS.find(
    (pattern) =>
      pattern.level <= progress.activeLevel &&
      pattern.chunk.length > 1 &&
      question.word.persian.includes(pattern.chunk),
  );
  const alphabetExerciseText =
    exerciseKind === "item"
      ? displayWord(question.word)
      : patternExercise
        ? patternExercise.stage === "context"
          ? patternExercise.example.word
          : patternExercise.pattern.form
        : "";
  const currentExerciseLetters = exerciseLetters(alphabetExerciseText);
  const currentBaseLetters = new Set(currentExerciseLetters.map(({ base }) => base));
  function wrongAnswerHaptic() {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate(30);
  }

  function levelUnlockHaptic() {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate([90, 65, 135, 75, 190, 90, 285]);
  }

  function flowerGrowthHaptic(threshold: number) {
    if (!haptics || !("vibrate" in navigator)) return;
    navigator.vibrate(
      threshold === 25
        ? [90, 60, 140, 70, 200, 80, 300, 95, 380]
        : [75, 55, 110, 65, 165, 80, 245],
    );
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
    setReminder((current) => ({ ...current, enabled: true }));
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
    setReminder((current) => ({ ...current, enabled: true }));
    trackEvent("Reminder Created", { interval_days: reminder.interval, calendar: "ics" });
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "complete");
    setShowOnboarding(false);
    setOnboardingStep(0);
    setTab("learn");
    trackEvent("Onboarding Completed");
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

  function openDonation(source: "unlock" | "about") {
    localStorage.setItem(ACTIVE_DONATION_KEY, "true");
    setDonationSupported(true);
    setShowDonationThanks(true);
    trackEvent("Donation Opened", { source });
  }

  function resetApp() {
    [
      STORAGE_KEY,
      DEBUG_STORAGE_KEY,
      DEBUG_DONATION_KEY,
      VOWEL_KEY,
      ONBOARDING_KEY,
      REMINDER_KEY,
      HAPTICS_KEY,
    ].forEach((key) => localStorage.removeItem(key));
    ["ravan-app-opened", "ravan-onboarding-started", "ravan-practice-started"].forEach((key) =>
      sessionStorage.removeItem(key),
    );
    window.location.reload();
  }

  function answer(optionId: string) {
    if (selected) return;
    const correct = optionId === question.word.id;
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
    if (!correct && question.mode === "transliteration" && question.word.readingHelp) {
      setShowReadingHelp(true);
    }
    setSelected(optionId);
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
        segmentationCorrect: 0,
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
      const wordBoundaries =
        current.activeLevel !== 6
          ? current.wordBoundaries
          : question.mode === "segmentation"
            ? recordWordBoundaryAnswer(current.wordBoundaries, question.word.id, correct)
            : current.wordBoundaries.mastered && !current.wordBoundaries.needsRefresh
              ? {
                  ...current.wordBoundaries,
                  exercisesSinceCheck: current.wordBoundaries.exercisesSinceCheck + 1,
                }
              : current.wordBoundaries;
      return {
        ...current,
        words: {
          ...current.words,
          [question.word.id]: {
            seen: previous.seen + 1,
            correct: previous.correct + (correct ? 1 : 0),
            wrong: previous.wrong + (correct ? 0 : 1),
            transliterationCorrect:
              !correct && question.mode !== "segmentation"
                ? 0
                : (previous.transliterationCorrect ?? 0) +
                  (correct && question.mode === "transliteration" ? 1 : 0),
            meaningCorrect:
              !correct && question.mode !== "segmentation"
                ? 0
                : question.mode === "meaning"
                  ? (previous.meaningCorrect ?? 0) + 1
                  : (previous.meaningCorrect ?? 0),
            segmentationCorrect:
              !correct && question.mode === "segmentation"
                ? 0
                : (previous.segmentationCorrect ?? 0) +
                  (correct && question.mode === "segmentation" ? 1 : 0),
            lastAnswerCorrect:
              question.mode === "segmentation" ? previous.lastAnswerCorrect : correct,
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
        wordBoundaries,
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
    const patternNext = shouldSchedulePatternExercise(
      nextProgress,
      session.answers + 1,
    );
    if (patternNext) {
      setPatternExercise(choosePatternExercise(nextProgress, patternExercise?.pattern.id));
      setExerciseKind("pattern");
    } else {
      setQuestion(chooseQuestion(nextProgress, question.word.id));
      setExerciseKind("item");
    }
    setSelected(null);
    setAnsweredCorrectly(null);
    setShowReadingHelp(false);
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
    setExerciseKind("item");
    setSelected(null);
    setAnsweredCorrectly(null);
    setShowReadingHelp(false);
    setSession({ correct: 0, answers: 0 });
    setLevelUnlockNotice(null);
    startedAt.current = Date.now();
    trackEvent("Level Entered", { level: nextLevel, source: "unlock" });
  }

  function enterLevel(level: number, source: "picker" | "journey" | "completion") {
    if (level > unlockedLevel) return;
    setShowLevelPicker(false);
    if (level === progress.activeLevel) {
      setTab("learn");
      return;
    }

    const nextProgress = {
      ...progress,
      activeLevel: level,
      streak: levelMastery(progress, level).currentStreak,
    };
    setProgress(nextProgress);
    setQuestion(chooseQuestion(nextProgress));
    setPatternExercise(null);
    setExerciseKind("item");
    setSelected(null);
    setAnsweredCorrectly(null);
    setShowReadingHelp(false);
    setSession({ correct: 0, answers: 0 });
    setTab("learn");
    startedAt.current = Date.now();
    trackEvent("Level Entered", { level, source });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (showHelp) {
        if (event.key === "Escape") setShowHelp(false);
        return;
      }
      if (tab !== "learn") return;
      if (showLevelPicker) {
        if (event.key === "Escape") setShowLevelPicker(false);
        return;
      }
      const index = Number(event.key) - 1;
      if (!selected && exerciseKind === "item" && index >= 0 && index < question.options.length) {
        answer(question.options[index].id);
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

  const recentItems = useMemo(
    () =>
      ITEMS.filter((item) => progress.words[item.id]).sort(
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
          <div className="onboarding-progress">
            <span>INTRODUCTION · {onboardingStep + 1} OF 2</span>
            <div
              className="onboarding-steps"
              role="progressbar"
              aria-label="Introduction progress"
              aria-valuemin={1}
              aria-valuemax={2}
              aria-valuenow={onboardingStep + 1}
            >
              {[0, 1].map((step) => (
                <i className={step <= onboardingStep ? "active" : ""} key={step} />
              ))}
            </div>
          </div>

          {onboardingStep === 0 && (
            <div className="onboarding-panel">
              <span className="eyebrow">BEFORE WE START</span>
              <h1>Learn to read Farsi, one word at a time.</h1>
              <p>
                Ravân complements courses, tutors, textbooks, and language apps with short,
                adaptive exercises for learning to read Farsi. You first connect Persian script
                to pronunciation, then increasingly read for meaning while recurring visual
                patterns become familiar. Transliteration gradually fades as your reading develops.
              </p>
              <blockquote className="literary-quote onboarding-quote">
                <p lang="fa" dir="rtl">قطره قطره جمع کن، دریا نگر</p>
                <footer>
                  <span>“Gather it drop by drop; behold the sea.”</span>
                  <div className="literary-attribution">
                    <cite>Shah Nematollah Vali</cite>
                    <small>Persian Sufi poet and mystic</small>
                  </div>
                </footer>
              </blockquote>
              <button className="primary-action" onClick={() => setOnboardingStep(1)}>
                Continue introduction <span>→</span>
              </button>
            </div>
          )}

          {onboardingStep === 1 && (
            <div className="onboarding-panel">
              <span className="eyebrow">HOW PROGRESS WORKS</span>
              <h1>Watch your reading grow.</h1>
              <p>
                Practice is divided into six levels. The two bars track what you have mastered and
                your current streak; their markers show when your flower grows. Reach Bud to unlock
                the next level—flower stages you earn are permanent.
              </p>
              <div className="onboarding-growth-preview" aria-hidden="true">
                <div className="onboarding-demo-bars">
                  <div>
                    <span>Mastered</span>
                    <div className="onboarding-demo-track">
                      <i style={{ width: "62%" }} />
                      {MASTERY_STAGES.slice(0, -1).map((stage) => (
                        <b
                          key={stage.name}
                          style={{ left: `${(stage.threshold / MASTERY_STAGES.at(-1)!.threshold) * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span>Streak</span>
                    <div className="onboarding-demo-track">
                      <i style={{ width: "72%" }} />
                      {MASTERY_STAGES.slice(0, -1).map((stage) => (
                        <b
                          key={stage.name}
                          style={{ left: `${(stage.threshold / MASTERY_STAGES.at(-1)!.threshold) * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="onboarding-flower-stages">
                  {MASTERY_STAGES.map((stage) => (
                    <span key={stage.name}>
                      <img src={stage.image} alt="" />
                      <small>{stage.name}</small>
                    </span>
                  ))}
                </div>
              </div>
              <button className="primary-action" onClick={finishOnboarding}>
                Start practicing <span>→</span>
              </button>
              <button className="text-action" onClick={() => setOnboardingStep(0)}>Back</button>
            </div>
          )}

          {onboardingStep === 0 && (
            <button className="skip-intro" onClick={finishOnboarding}>
              Skip introduction and start
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {showProminentMasteryCelebration && (
        <div className="mastery-screen-flash" aria-hidden="true" />
      )}
      {showDonationThanks && (
        <div className="level-unlock-backdrop donation-thanks-backdrop">
          <section
            className="donation-thanks-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-thanks-title"
          >
            <span className="donation-heart" aria-hidden="true">♥</span>
            <span className="eyebrow">THANK YOU</span>
            <h2 id="donation-thanks-title">Thank you for your support.</h2>
            <p>Your voluntary donation helps Ravân’s continued development.</p>
            <button
              type="button"
              className="primary-action"
              onClick={() => setShowDonationThanks(false)}
              autoFocus
            >
              Continue
            </button>
          </section>
        </div>
      )}
      {showHelp && (
        <div
          className="level-unlock-backdrop help-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowHelp(false);
          }}
        >
          <section
            className="help-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <header className="help-splash-header">
              <div>
                <span className="eyebrow">HOW RAVÂN WORKS</span>
                <h2 id="help-title">How to use Ravân</h2>
              </div>
              <button
                type="button"
                className="help-close"
                onClick={() => setShowHelp(false)}
                aria-label="Close help"
                autoFocus
              >
                ×
              </button>
            </header>
            <div className="help-guide">
              <section>
                <h3>During an exercise</h3>
                <p>
                  Read the Persian word or phrase and choose an answer. Ravân first checks
                  pronunciation; after you get that right, the same item can be tested for meaning.
                  Press <strong>Continue</strong> after the explanation to move on. Missed items
                  return more often.
                </p>
              </section>
              <section>
                <h3>Mastered</h3>
                <p>
                  A word or phrase is mastered after you answer both its pronunciation and meaning
                  correctly at least once. A later wrong answer removes its mastered status until
                  you prove both again.
                </p>
              </section>
              <section>
                <h3>Streaks</h3>
                <p>
                  Your current streak is the number of consecutive correct answers in this level.
                  A wrong answer resets it to zero; your longest streak stays. Flower growth uses
                  that longest streak, so mastery and the streak requirement do not have to be
                  completed at the same moment.
                </p>
              </section>
              <section>
                <h3>Flower stages</h3>
                <div className="help-flower-stages">
                  {MASTERY_STAGES.map((stage) => (
                    <div key={stage.name}>
                      <img src={stage.image} alt="" aria-hidden="true" />
                      <span>
                        <strong>{stage.name}</strong>
                        <small>
                          {Math.round(stage.coverage * 100)}% mastered · longest streak {stage.threshold}
                          {stage.name === "Bud" ? " · unlocks the next level when available" : ""}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="help-flower-note">
                  Bouquet also requires every pattern assigned to the level. Flower stages never
                  disappear once earned.
                </p>
              </section>
              <section>
                <h3>Helpful tabs at the bottom</h3>
                <div className="help-tab-guide">
                  <div><i>◉</i><span><strong>Practice</strong><small>Do exercises</small></span></div>
                  <div><i lang="fa">ا</i><span><strong>Alphabet</strong><small>Look up letter shapes</small></span></div>
                  <div><i>≡</i><span><strong>Words</strong><small>Review vocabulary and patterns</small></span></div>
                  <div><i>↗</i><span><strong>Journey</strong><small>See levels, flowers, and statistics</small></span></div>
                  <div><i>⚙</i><span><strong>Settings</strong><small>Manage app preferences</small></span></div>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
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
      {allLevelsMasteredNotice && !showDonationThanks && (
        <div className="level-unlock-backdrop">
          <section
            className="level-unlock-splash all-levels-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="all-levels-mastered-title"
          >
            <div className="all-levels-bouquets" aria-hidden="true">
              {LEVELS.map((level) => (
                <img
                  key={level.title}
                  src={MASTERY_STAGES.at(-1)!.image}
                  alt=""
                />
              ))}
            </div>
            <span className="eyebrow">ALL AVAILABLE LEVELS MASTERED</span>
            <h2 id="all-levels-mastered-title">
              Barikala <span lang="fa" dir="rtl">(باریکلا)</span>
            </h2>
            <p>You have grown a bouquet in every level!</p>
            <div className="level-unlock-growth">
              <strong>You have mastered every level currently available.</strong>
              <span>
                More levels may be added in the future. Come back any time to keep your reading
                fresh—and to see what grows next.
              </span>
            </div>
            <div className="level-unlock-actions">
              <button
                className="primary-action"
                onClick={() => setAllLevelsMasteredNotice(false)}
                autoFocus
              >
                Return to practice
              </button>
            </div>
          </section>
        </div>
      )}
      {levelCompletionNotice && !allLevelsMasteredNotice && !showDonationThanks && (
        <div className="level-unlock-backdrop">
          <section
            className="level-unlock-splash level-completion-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="level-completion-title"
          >
            <div className="level-unlock-flower-wrap" aria-hidden="true">
              <img
                className="level-unlock-flower"
                src={MASTERY_STAGES.at(-1)!.image}
                alt=""
              />
              <i>✦</i>
              <i>✦</i>
              <i>✦</i>
            </div>
            <span className="eyebrow">LEVEL FULLY MASTERED</span>
            <h2 id="level-completion-title">
              Barikala <span lang="fa" dir="rtl">(باریکلا)</span>
            </h2>
            <p>Level {levelCompletionNotice} completed!</p>
            <div className="level-unlock-growth">
              <strong>Your flower has grown into a bouquet.</strong>
              <span>
                {levelCompletionNotice === LEVELS.length
                  ? `Level ${levelCompletionNotice} is the last level currently available. More levels may be added in the future, and you can return to any level whenever you want to keep practising.`
                  : `You can always return to Level ${levelCompletionNotice} from the level selector whenever you want to keep practising.`}
              </span>
            </div>
            <div className="level-unlock-actions">
              {levelCompletionNotice < LEVELS.length ? (
                <>
                  <button
                    className="primary-action"
                    onClick={() => {
                      const nextLevel = levelCompletionNotice + 1;
                      setLevelCompletionNotice(null);
                      enterLevel(nextLevel, "completion");
                    }}
                    autoFocus
                  >
                    Go to Level {levelCompletionNotice + 1} <span>→</span>
                  </button>
                  <span className="level-unlock-or">or</span>
                  <button
                    className="text-action"
                    onClick={() => setLevelCompletionNotice(null)}
                  >
                    Keep practising Level {levelCompletionNotice}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary-action"
                    onClick={() => setLevelCompletionNotice(null)}
                    autoFocus
                  >
                    Keep practising Level {levelCompletionNotice}
                  </button>
                  <span className="level-unlock-or">or</span>
                  <button
                    className="text-action"
                    onClick={() => {
                      setLevelCompletionNotice(null);
                      setShowLevelPicker(true);
                    }}
                  >
                    Choose another level
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
      {finalLevelBudNotice &&
        !allLevelsMasteredNotice &&
        !levelCompletionNotice &&
        !showDonationThanks && (
          <div className="level-unlock-backdrop">
            <section
              className="level-unlock-splash final-level-bud-splash"
              role="dialog"
              aria-modal="true"
              aria-labelledby="final-level-bud-title"
            >
              <div className="level-unlock-flower-wrap" aria-hidden="true">
                <img className="level-unlock-flower" src={MASTERY_STAGES[1].image} alt="" />
                <i>✦</i>
                <i>✦</i>
                <i>✦</i>
              </div>
              <span className="eyebrow">LATEST LEVEL MILESTONE</span>
              <h2 id="final-level-bud-title">
                Barikala <span lang="fa" dir="rtl">(باریکلا)</span>
              </h2>
              <p>Bud earned in Level {finalLevelBudNotice}!</p>
              <div className="level-unlock-growth">
                <strong>You reached Bud in the latest available level.</strong>
                <span>
                  More levels may be added in the future. For now, keep growing this flower or
                  revisit any earlier level.
                </span>
              </div>
              <div className="level-unlock-actions">
                <button
                  className="primary-action"
                  onClick={() => setFinalLevelBudNotice(null)}
                  autoFocus
                >
                  Keep growing Level {finalLevelBudNotice}
                </button>
                <span className="level-unlock-or">or</span>
                <button
                  className="text-action"
                  onClick={() => {
                    setFinalLevelBudNotice(null);
                    setShowLevelPicker(true);
                  }}
                >
                  Choose another level
                </button>
              </div>
            </section>
          </div>
        )}
      {levelUnlockNotice &&
        !finalLevelBudNotice &&
        !allLevelsMasteredNotice &&
        !levelCompletionNotice &&
        !showDonationThanks && (
        <div className="level-unlock-backdrop">
          <section
            className={`level-unlock-splash ${
              levelUnlockNotice >= 4 && !donationSupported ? "with-donation" : ""
            }`}
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
            {levelUnlockNotice >= 4 && !donationSupported && (
              <div className="unlock-donation">
                <p>
                  This app is free. If you wish to make a voluntary donation,{" "}
                  <a
                    href={PAYPAL_DONATION_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => openDonation("unlock")}
                  >
                    click here
                  </a>.
                </p>
                <small>(suggested amount: $5)</small>
              </div>
            )}
            <div className="level-unlock-actions">
              <button className="primary-action" onClick={graduate} autoFocus>
                Go to Level {levelUnlockNotice} <span>→</span>
              </button>
              <span className="level-unlock-or">or</span>
              <button
                className="text-action"
                onClick={() => setLevelUnlockNotice(null)}
              >
                Stay and grow my flower
              </button>
            </div>
            {levelUnlockNotice === 2 &&
              !hideUnlockReturnOptions &&
              (!installed || !reminder.enabled || showUnlockReminderSetup) && (
                <div className="unlock-return-options">
                  <strong>Make Ravân easy to return to</strong>
                  <div className="unlock-return-actions">
                    {!installed && (
                      <button type="button" onClick={installApp}>Add to Home Screen</button>
                    )}
                    {!reminder.enabled && !showUnlockReminderSetup && (
                      <button
                        type="button"
                        onClick={() => setShowUnlockReminderSetup(true)}
                      >
                        Set a reminder
                      </button>
                    )}
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        setShowUnlockReminderSetup(false);
                        setShowInstallHelp(false);
                        setHideUnlockReturnOptions(true);
                      }}
                    >
                      Not now
                    </button>
                  </div>
                  {showInstallHelp && !installed && (
                    <div className="install-help unlock-install-help">
                      <strong>Install from your browser</strong>
                      <span>On iPhone or iPad: tap Share, then “Add to Home Screen.”</span>
                      <span>On Android: open the browser menu and choose “Install app” or “Add to Home screen.”</span>
                    </div>
                  )}
                  {showUnlockReminderSetup && (
                    <div className="unlock-reminder-setup">
                      <div className="reminder-controls">
                        <label>
                          <span>Time</span>
                          <input
                            type="time"
                            value={reminder.time}
                            onChange={(event) =>
                              setReminder((current) => ({ ...current, time: event.target.value }))
                            }
                          />
                        </label>
                        <label>
                          <span>Repeat</span>
                          <select
                            value={reminder.interval}
                            onChange={(event) =>
                              setReminder((current) => ({
                                ...current,
                                interval: Number(event.target.value),
                              }))
                            }
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
                          onClick={() => {
                            openGoogleCalendar();
                            setShowUnlockReminderSetup(false);
                          }}
                        >
                          Open Google Calendar
                        </a>
                        <button
                          className="calendar-file-action"
                          onClick={() => {
                            downloadCalendarFile();
                            setShowUnlockReminderSetup(false);
                          }}
                        >
                          Use another calendar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </section>
        </div>
      )}
      <header className="topbar">
        <button className="brand" onClick={() => setTab("learn")} aria-label="Ravân home">
          <span className="brand-mark" lang="fa" dir="rtl">روان</span>
          <span className="brand-copy"><strong>Ravân</strong><small>Learn to Read Farsi</small></span>
        </button>
        <div className="topbar-actions">
          {DEBUG_MODE && <span className="debug-badge">TEST MODE</span>}
          <button type="button" className="help-button" onClick={() => setShowHelp(true)}>
            Help
          </button>
        </div>
      </header>

      <main>
        {tab === "learn" && (
          <section className="learn-view">
            <div
              className={`graduation-card ${canGraduate || activeLevelCompleted ? "ready" : ""} ${
                masteryCelebration?.level === progress.activeLevel ? "flower-celebrating" : ""
              } ${showProminentMasteryCelebration ? "major-flower-celebrating" : ""}`}
            >
              <div className="current-level">
                <button
                  type="button"
                  className="current-level-number"
                  onClick={() => setShowLevelPicker((visible) => !visible)}
                  aria-label={`Choose practice level. Current level ${progress.activeLevel}`}
                  aria-haspopup="dialog"
                  aria-expanded={showLevelPicker}
                  aria-controls="practice-level-picker"
                >
                  <span>LEVEL</span>
                  <strong>{progress.activeLevel}</strong>
                  <i className="level-selector-cue" aria-hidden="true" />
                </button>
                <span className="mastery-flower-wrap">
                  <button
                    type="button"
                    className={`mastery-flower ${
                      masteryCelebration?.level === progress.activeLevel ? "celebrating" : ""
                    } ${showProminentMasteryCelebration ? "major-celebrating" : ""}`}
                    onClick={() => setShowLevelPicker((visible) => !visible)}
                    aria-haspopup="dialog"
                    aria-expanded={showLevelPicker}
                    aria-controls="practice-level-picker"
                    aria-describedby="mastery-flower-tooltip"
                    aria-label={`Choose practice level. Flower progress: ${
                      earnedMasteryStage
                        ? `${earnedMasteryStage.name} earned.`
                        : "Grow your first sprout."
                    } ${
                      upcomingMasteryStage
                        ? nextStageGoal
                        : "Your bouquet is fully grown. Keep your current streak going."
                    }`}
                  >
                    <img
                      className={earnedMasteryStage ? "" : "not-earned"}
                      src={earnedMasteryStage?.image ?? MASTERY_STAGES[0].image}
                      alt=""
                    />
                    <i aria-hidden="true">✦</i>
                    <i aria-hidden="true">✦</i>
                    <i aria-hidden="true">✦</i>
                  </button>
                  <span className="mastery-flower-tooltip" id="mastery-flower-tooltip" role="tooltip">
                    <strong>
                      {earnedMasteryStage
                        ? `${earnedMasteryStage.name} earned.`
                        : "Grow your first sprout."}
                    </strong>
                    <span>
                      {upcomingMasteryStage
                        ? nextStageGoal
                        : "Your bouquet is fully grown. Keep your current streak going."}
                    </span>
                  </span>
                </span>
                {showLevelPicker && (
                  <>
                    <div
                      className="level-picker-scrim"
                      onClick={() => setShowLevelPicker(false)}
                      aria-hidden="true"
                    />
                    <section
                      className="level-picker-popover"
                      id="practice-level-picker"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Choose practice level"
                    >
                      <div className="level-picker-list">
                        {LEVELS.map((level, index) => {
                          const number = index + 1;
                          const locked = number > unlockedLevel;
                          const current = number === progress.activeLevel;
                          const stage = masteryStage(
                            levelMastery(progress, number).earnedThreshold,
                          );
                          return (
                            <button
                              type="button"
                              className={`level-picker-option ${current ? "current" : ""}`}
                              key={level.title}
                              disabled={locked}
                              aria-current={current ? "true" : undefined}
                              aria-label={`Level ${number}, ${level.title}, ${
                                stage?.name ?? "no flower stage"
                              }${current ? ", current level" : locked ? ", locked" : ""}`}
                              onClick={() => enterLevel(number, "picker")}
                              autoFocus={current}
                            >
                              <span className="level-picker-number">
                                <small>LEVEL</small>
                                <strong>{number}</strong>
                              </span>
                              <span className="level-picker-copy">
                                <strong>{level.title}</strong>
                              </span>
                              <span className={`level-picker-flower ${stage ? "" : "empty"}`}>
                                <img
                                  className={stage ? "" : "not-earned"}
                                  src={stage?.image ?? MASTERY_STAGES[0].image}
                                  alt=""
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </>
                )}
              </div>
              <div className="graduation-copy">
                <div className="mastery-goals">
                  <div className="mastery-item-progress">
                    <span className="progress-label">
                      Mastered:{" "}
                      <strong>{activeEvidence.masteredItems}/{activeEvidence.itemCount}</strong>
                    </span>
                    <div
                      className="graduation-track word-goal"
                      aria-label={`${activeEvidence.masteredItems} of ${activeEvidence.itemCount} ${activeItemPlural} mastered across Level ${progress.activeLevel}`}
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            (activeEvidence.masteredItems / Math.max(1, activeEvidence.itemCount)) * 100,
                          )}%`,
                        }}
                      />
                      {MASTERY_STAGES.slice(0, -1).map((stage) => {
                        const stageItemTarget = requiredItemsForStage(
                          activeEvidence.itemCount,
                          stage.coverage,
                        );
                        return (
                          <i
                            key={stage.name}
                            className="stage-progress-marker"
                            style={{
                              left: `${Math.min(
                                100,
                                (stageItemTarget / Math.max(1, activeEvidence.itemCount)) * 100,
                              )}%`,
                            }}
                            title={`${stage.name}: ${stageItemTarget} ${activeItemPlural}`}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="streak-progress">
                    <span
                      className="progress-label"
                      aria-label={`Streak: best ${activeMastery.bestStreak}; current ${activeMastery.currentStreak}`}
                    >
                      Longest streak: <strong>{activeMastery.bestStreak}</strong>
                      <small>(now {activeMastery.currentStreak})</small>
                    </span>
                    <div
                      className="graduation-track streak-goal"
                      aria-label={`Current streak ${activeMastery.currentStreak}; best streak ${activeMastery.bestStreak}; Bouquet bar maximum ${MASTERY_STAGES.at(-1)!.threshold}`}
                    >
                      <span
                        className="streak-best-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            (activeMastery.bestStreak / MASTERY_STAGES.at(-1)!.threshold) * 100,
                          )}%`,
                        }}
                      />
                      <span
                        className="streak-current-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            (activeMastery.currentStreak / MASTERY_STAGES.at(-1)!.threshold) * 100,
                          )}%`,
                        }}
                      />
                      {MASTERY_STAGES.slice(0, -1).map((stage) => (
                        <i
                          key={stage.name}
                          className="stage-progress-marker"
                          style={{
                            left: `${(stage.threshold / MASTERY_STAGES.at(-1)!.threshold) * 100}%`,
                          }}
                          title={`${stage.name}: streak ${stage.threshold}`}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {(canGraduate || activeLevelCompleted) && (
                <button className="graduate-button" onClick={() => setShowLevelPicker(true)}>
                  {activeLevelCompleted ? (
                    "Level completed"
                  ) : (
                    <>
                      Move up <span>→</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="session-row">
              <h1>
                {exerciseKind === "pattern"
                  ? "Spot the pattern"
                  : question.word.kind === "phrase"
                    ? "Read the phrase"
                    : "Read the word"}
              </h1>
            </div>

            {exerciseKind === "item" ? (
              <>
                <article className={`word-card ${selected ? "answered" : ""}`}>
                  <div className="card-topline">
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
                  <div
                    className={`persian-word ${
                      question.word.kind === "phrase" ? "phrase" : ""
                    }`}
                    lang="fa"
                    dir="rtl"
                  >
                    {matchedPattern
                      ? highlightPattern(displayWord(question.word), matchedPattern)
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
                    Choose the correct{" "}
                    {question.mode === "meaning"
                      ? "meaning"
                      : question.mode === "segmentation"
                        ? "word boundaries"
                        : "pronunciation"}
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
                        onClick={() => answer(option.id)}
                        disabled={!!selected}
                      >
                        <span className="answer-key">{index + 1}</span>
                        {question.mode === "segmentation" && option.segments ? (
                          <span
                            className="boundary-option"
                            lang="fa"
                            dir="rtl"
                            aria-label={option.segments.join(", word boundary, ")}
                          >
                            {option.segments.map((segment, segmentIndex) => (
                              <span key={`${segment}-${segmentIndex}`}>
                                <b>{segment}</b>
                                {segmentIndex < option.segments!.length - 1 && (
                                  <i aria-hidden="true">|</i>
                                )}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span>{option.label}</span>
                        )}
                        {state === "correct" && <Icon name="check" />}
                        {state === "wrong" && (
                          <span className="answer-wrong-mark" aria-hidden="true">×</span>
                        )}
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
                        {state === "wrong" && (
                          <span className="answer-wrong-mark" aria-hidden="true">×</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {selected && (
              <div className={`feedback ${answeredCorrectly ? "success" : "retry"}`}>
                <div className="feedback-copy">
                  <strong>{answeredCorrectly ? "That’s it." : "Not quite — keep this one close."}</strong>
                  <div className="feedback-answer-line">
                    <span>
                      {exerciseKind === "item" ? (
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
                    {exerciseKind === "item" && question.word.readingHelp && (
                      <button
                        type="button"
                        className="feedback-reading-help"
                        onClick={() => {
                          setShowReadingHelp((visible) => !visible);
                        }}
                        aria-expanded={showReadingHelp}
                        aria-controls="reading-help"
                      >
                        {question.word.readingHelp.label}
                      </button>
                    )}
                  </div>
                  {exerciseKind === "item" &&
                    showReadingHelp &&
                    question.word.readingHelp && (
                      <div className="feedback-reading-explainer" id="reading-help">
                        <b lang="fa" dir="rtl">
                          {question.word.readingHelp.markedPersian}
                        </b>
                        <strong>{question.word.readingHelp.label}</strong>
                        <span>{question.word.readingHelp.explanation}</span>
                      </div>
                    )}
                </div>
                <button className="feedback-continue" onClick={nextQuestion}>
                  Continue <span>↵</span>
                </button>
              </div>
            )}

          </section>
        )}

        {tab === "journey" && (
          <section className="dashboard-view">
            <div className="page-intro">
              <span className="eyebrow">YOUR JOURNEY</span>
              <h1>Reading is taking shape.</h1>
              <blockquote className="literary-quote journey-literary-quote">
                <p lang="fa" dir="rtl">دانه دانه است غله در انبار</p>
                <footer>
                  <span>“Grain by grain, the storehouse fills.”</span>
                  <div className="literary-attribution">
                    <cite>Saadi</cite>
                    <small>13th-century Persian poet and master of prose</small>
                  </div>
                </footer>
              </blockquote>
            </div>
            <div className="section-card">
              <div className="section-heading">
                <div><span className="eyebrow">LEARNING PATH</span><h2>Practice and make each flower grow</h2></div>
                <span>
                  {WORDS.filter((word) => word.level <= unlockedLevel).length} words
                  {unlockedLevel >= 6 ? ` · ${PHRASES.length} phrases` : ""}
                </span>
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
                  const nextItemTarget = nextStage
                    ? requiredItemsForStage(evidence.itemCount, nextStage.coverage)
                    : evidence.itemCount;
                  const itemPlural = `${evidence.itemLabel}s`;
                  const itemsReady = evidence.masteredItems >= nextItemTarget;
                  const patternsRequired = Boolean(
                    nextStage?.threshold === MASTERY_STAGES.at(-1)!.threshold &&
                      evidence.patternCount > 0,
                  );
                  const patternsReady =
                    !patternsRequired || evidence.masteredPatterns >= evidence.patternCount;
                  const stagePrefix = stage ? `${stage.name} · ` : "";
                  const levelProgressLabel = !nextStage
                    ? `${stage?.name ?? "Bouquet"} · complete`
                    : !itemsReady
                      ? `${stagePrefix}${evidence.masteredItems}/${nextItemTarget} ${itemPlural} to ${nextStage.name}`
                      : !patternsReady
                        ? `${stagePrefix}${evidence.masteredPatterns}/${evidence.patternCount} patterns to ${nextStage.name}`
                        : `${stagePrefix}Reach a streak of ${nextStage.threshold} to earn ${nextStage.name}`;
                  return (
                    <button
                      key={level.title}
                      className={`level-row ${active ? "active" : ""}`}
                      disabled={locked}
                      onClick={() => enterLevel(number, "journey")}
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
                  Each flower needs both the best streak shown and mastered level items. Bouquet
                  also requires every pattern assigned to that level. Earned flowers never shrink.
                </p>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card accent">
                <span>Accuracy</span>
                <strong>{accuracy}%</strong>
                <small>
                  {progress.totalAnswers} {progress.totalAnswers === 1 ? "answer" : "answers"}
                </small>
              </div>
              <div className="stat-card"><span>Average speed</span><strong>{averageSeconds}<em>s</em></strong><small>per answer</small></div>
              <div className="stat-card"><span>Best streak</span><strong>{progress.bestStreak}</strong><small>correct in a row</small></div>
              <div className="stat-card">
                <span>Items mastered</span>
                <strong>{mastered}</strong>
                <small>{masteredWords} words · {masteredPhrases} phrases</small>
              </div>
            </div>
          </section>
        )}

        {tab === "alphabet" && (
          <section className="alphabet-view">
            <div className="page-intro compact">
              <span className="eyebrow">ALPHABET</span>
              <h1>Persian letters at a glance.</h1>
              <p>
                Persian reads from right to left. A letter can change shape depending on where it
                sits, but it remains the same letter. Short vowel marks are typically omitted in
                everyday writing.
              </p>
            </div>

            <section className="exercise-alphabet-card" aria-labelledby="exercise-alphabet-title">
              <div className="exercise-alphabet-heading">
                <span className="eyebrow" id="exercise-alphabet-title">
                  IN THE CURRENT EXERCISE
                </span>
              </div>
              <div
                className="current-exercise-equation"
                dir="rtl"
                aria-label={`${alphabetExerciseText}, shown as its contextual letter sequence`}
              >
                <b className="current-exercise-word" lang="fa" dir="rtl">
                  {alphabetExerciseText}
                </b>
                <span className="exercise-equation-sign" aria-hidden="true">=</span>
                <span className="current-letter-sequence" aria-hidden="true">
                  {currentExerciseLetters.map((item, index) => (
                    <span
                      className="current-letter-unit"
                      key={`${item.original}-${index}`}
                    >
                      <b lang="fa" dir="rtl">{item.form}</b>
                      {index < currentExerciseLetters.length - 1 && <i>·</i>}
                    </span>
                  ))}
                </span>
              </div>
            </section>

            <div className="alphabet-section-heading">
              <div>
                <span className="eyebrow">ALL 32 LETTERS</span>
                <h2>The complete alphabet</h2>
              </div>
              <span>Letters in the exercise are highlighted</span>
            </div>
            <div className="alphabet-grid">
              {PERSIAN_ALPHABET.map((letter) => (
                <article
                  className={`alphabet-letter-card ${
                    currentBaseLetters.has(letter.letter) ? "current" : ""
                  }`}
                  key={letter.letter}
                >
                  <div className="alphabet-letter-main">
                    <b lang="fa" dir="rtl">{letter.letter}</b>
                    <span>
                      <strong>{letter.name}</strong>
                      <small>{letter.sound}</small>
                    </span>
                  </div>
                  {letter.nonJoining ? (
                    <div className="alphabet-nonjoining">
                      <span><small>final</small><b lang="fa" dir="rtl">ـ{letter.letter}</b></span>
                      <em>Doesn’t connect to the next letter</em>
                    </div>
                  ) : (
                    <div className="alphabet-forms">
                      <span><small>initial</small><b lang="fa" dir="rtl">{letter.letter}ـ</b></span>
                      <span><small>medial</small><b lang="fa" dir="rtl">ـ{letter.letter}ـ</b></span>
                      <span><small>final</small><b lang="fa" dir="rtl">ـ{letter.letter}</b></span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "words" && (
          <section className="words-view">
            <div className="page-intro compact">
              <span className="eyebrow">WORD, PHRASE & PATTERN GARDEN</span>
              <h1>{recentItems.length ? "Reading you’ve met" : "Your first words await."}</h1>
              <p>{dueCount} due now · {mastered} mastered · stored only on this device</p>
            </div>
            <div className="word-table">
              {recentItems.length === 0 ? (
                <button className="empty-state" onClick={() => setTab("learn")}>
                  <span lang="fa" dir="rtl">آماده‌ای؟</span>
                  <strong>Ready?</strong>
                  <small>Start a short practice round</small>
                </button>
              ) : recentItems.map((word) => {
                const stat = progress.words[word.id];
                const accuracy = Math.round((stat.correct / stat.seen) * 100);
                const masteryStepCount = 2;
                const masterySteps =
                  stat.lastAnswerCorrect === false
                    ? 0
                    : Number(stat.transliterationCorrect >= 1) +
                      Number((stat.meaningCorrect ?? 0) >= 1);
                const masteryScore = (masterySteps / masteryStepCount) * 100;
                return (
                  <div className="word-row" key={word.id}>
                    <div
                      className={`mini-ring ${
                        masterySteps === masteryStepCount ? "complete" : ""
                      }`}
                      style={{ "--score": `${masteryScore * 3.6}deg` } as React.CSSProperties}
                      aria-label={`${masterySteps} of ${masteryStepCount} ${
                        word.kind === "phrase" ? "phrase" : "word"
                      } mastery steps complete`}
                    >
                      <span>
                        {masterySteps === masteryStepCount
                          ? "✓"
                          : `${masterySteps}/${masteryStepCount}`}
                      </span>
                    </div>
                    <div>
                      <strong lang="fa" dir="rtl">
                        {displayWord(word)}
                        {word.kind === "phrase" && <small className="phrase-label">PHRASE</small>}
                      </strong>
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

        {tab === "settings" && (
          <section className="settings-view">
            <div className="page-intro settings-page-intro">
              <h1>Settings</h1>
              <p>Manage how Ravân works on this device.</p>
            </div>

            <div className="settings-card">
              <div className="settings-heading">
                <h2>Preferences</h2>
              </div>
              <div className="preference-list">
                <div className="preference-item">
                  <span>
                    <strong>Add to Home Screen</strong>
                    <small>
                      {installed
                        ? "Installed on this device. Remove it from your home screen or app settings to uninstall it."
                        : "Open Ravân like an app directly from your home screen."}
                    </small>
                  </span>
                  <button
                    type="button"
                    className={`vowel-toggle settings-toggle ${installed ? "installed" : ""}`}
                    role="switch"
                    aria-label="Add to Home Screen"
                    aria-checked={installed}
                    disabled={installed}
                    onClick={installApp}
                  >
                    <span className="toggle-track"><span /></span>
                    {installed ? "On" : "Off"}
                  </button>
                </div>
                {showInstallHelp && !installed && (
                  <div className="preference-details">
                    <div className="install-help settings-install-help">
                      <strong>Install from your browser</strong>
                      <span>On iPhone or iPad: tap Share, then “Add to Home Screen.”</span>
                      <span>On Android: open the browser menu and choose “Install app” or “Add to Home screen.”</span>
                    </div>
                  </div>
                )}
                <div className="preference-item">
                  <span><strong>Haptics</strong><small>Use phone vibration effects</small></span>
                  <button
                    type="button"
                    className="vowel-toggle settings-toggle"
                    role="switch"
                    aria-label="Haptics"
                    aria-checked={haptics}
                    onClick={() => setHaptics((enabled) => !enabled)}
                  >
                    <span className="toggle-track"><span /></span>
                    {haptics ? "On" : "Off"}
                  </button>
                </div>
                <div className="preference-item">
                  <span>
                    <strong>Practice reminders</strong>
                    <small>Create a recurring calendar event at a time that suits you.</small>
                  </span>
                  <button
                    type="button"
                    className="vowel-toggle settings-toggle"
                    role="switch"
                    aria-label="Practice reminders"
                    aria-checked={reminder.enabled}
                    onClick={() =>
                      setReminder((current) => ({ ...current, enabled: !current.enabled }))
                    }
                  >
                    <span className="toggle-track"><span /></span>
                    {reminder.enabled ? "On" : "Off"}
                  </button>
                </div>
                {reminder.enabled && (
                  <div className="preference-details">
                    <div className="reminder-controls">
                      <label>
                        <span>Time</span>
                        <input
                          type="time"
                          value={reminder.time}
                          onChange={(event) =>
                            setReminder((current) => ({ ...current, time: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Repeat</span>
                        <select
                          value={reminder.interval}
                          onChange={(event) =>
                            setReminder((current) => ({
                              ...current,
                              interval: Number(event.target.value),
                            }))
                          }
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
                      <button className="calendar-file-action" onClick={downloadCalendarFile}>
                        Use another calendar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button className="about-action settings-share-action" onClick={shareApp}>
              <span aria-hidden="true">↗</span>
              Share with friends
            </button>
            {shareStatus && <div className="about-action-status">{shareStatus}</div>}

            <section className="settings-about-section" aria-labelledby="about-ravan-title">
              <h2 id="about-ravan-title">About Ravân</h2>
              <strong className="settings-about-lead">Helpful practice for learning to read Farsi.</strong>
              <p>Ravân complements courses, tutors, textbooks, and language apps with interactive exercises that track and grow your Persian reading skills.</p>
              <blockquote className="literary-quote about-literary-quote">
                <p lang="fa" dir="rtl">
                  درخت تو گر بار دانش بگیرد
                  <br />
                  به زیر آوری چرخ نیلوفری را
                </p>
                <footer>
                  <span>
                    “If your tree bears the fruit of knowledge,
                    <br />
                    you can bring the azure heavens within reach.”
                  </span>
                  <div className="literary-attribution">
                    <cite>Naser Khosrow</cite>
                    <small>Poet, philosopher, and ardent promoter of the Persian language</small>
                  </div>
                </footer>
              </blockquote>
            </section>

            <div className="about-utility-links">
              <p className="about-support">
                {donationSupported ? "Thank you for supporting Ravân. " : "Ravân is free. "}
                <a
                  href={PAYPAL_DONATION_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => openDonation("about")}
                >
                  Make a voluntary donation
                </a>
                <span> · $5 suggested, choose any amount</span>
              </p>
              <a
                className="about-contact-link"
                href="mailto:balder.tencate@gmail.com"
                onClick={() => trackEvent("Author Contact Click")}
              >
                Contact the author
              </a>
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
        {(["learn", "alphabet", "words", "journey", "settings"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`nav-${item} ${tab === item ? "active" : ""}`}
            aria-current={tab === item ? "page" : undefined}
            onClick={() => {
              setTab(item);
              trackEvent("Tab Opened", { tab: item });
            }}
          >
            <Icon name={item} />
            <span>
              {item === "learn" ? "Practice" : item[0].toUpperCase() + item.slice(1)}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
