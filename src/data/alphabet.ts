export type PersianLetter = {
  letter: string;
  name: string;
  sound: string;
  nonJoining?: boolean;
};

export const PERSIAN_ALPHABET: PersianLetter[] = [
  { letter: "ا", name: "alef", sound: "â / a", nonJoining: true },
  { letter: "ب", name: "be", sound: "b" },
  { letter: "پ", name: "pe", sound: "p" },
  { letter: "ت", name: "te", sound: "t" },
  { letter: "ث", name: "se", sound: "s" },
  { letter: "ج", name: "jim", sound: "j" },
  { letter: "چ", name: "che", sound: "ch" },
  { letter: "ح", name: "he-ye jimi", sound: "h" },
  { letter: "خ", name: "khe", sound: "kh" },
  { letter: "د", name: "dâl", sound: "d", nonJoining: true },
  { letter: "ذ", name: "zâl", sound: "z", nonJoining: true },
  { letter: "ر", name: "re", sound: "r", nonJoining: true },
  { letter: "ز", name: "ze", sound: "z", nonJoining: true },
  { letter: "ژ", name: "zhe", sound: "zh", nonJoining: true },
  { letter: "س", name: "sin", sound: "s" },
  { letter: "ش", name: "shin", sound: "sh" },
  { letter: "ص", name: "sâd", sound: "s" },
  { letter: "ض", name: "zâd", sound: "z" },
  { letter: "ط", name: "tâ", sound: "t" },
  { letter: "ظ", name: "zâ", sound: "z" },
  { letter: "ع", name: "eyn", sound: "‘ / vowel" },
  { letter: "غ", name: "gheyn", sound: "gh" },
  { letter: "ف", name: "fe", sound: "f" },
  { letter: "ق", name: "qâf", sound: "gh / q" },
  { letter: "ک", name: "kâf", sound: "k" },
  { letter: "گ", name: "gâf", sound: "g" },
  { letter: "ل", name: "lâm", sound: "l" },
  { letter: "م", name: "mim", sound: "m" },
  { letter: "ن", name: "nun", sound: "n" },
  { letter: "و", name: "vâv", sound: "v / u / o", nonJoining: true },
  { letter: "ه", name: "he", sound: "h / e" },
  { letter: "ی", name: "ye", sound: "y / i" },
];

export const LETTER_ALIASES: Record<string, string> = {
  "آ": "ا",
  "أ": "ا",
  "إ": "ا",
  "ؤ": "و",
  "ئ": "ی",
  "ۀ": "ه",
  "ة": "ه",
  "ك": "ک",
  "ي": "ی",
};
