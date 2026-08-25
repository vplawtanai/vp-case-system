export type ThaiLegalTextUnit = {
  text: string;
  isWhitespace: boolean;
};

type WordSegment = {
  segment: string;
  isWordLike?: boolean;
};

const THAI_CHARACTER = /[\u0E00-\u0E7F]/u;
const WHITESPACE = /^\s+$/u;
const SENTENCE_PUNCTUATION = /[.!?;:。！？]$/u;
const MAX_PROTECTED_CHARACTERS = 84;
const MIN_STABLE_WORD_CHARACTERS = 5;

export function thaiLegalTextUnits(text: string, languageCode = "th"): ThaiLegalTextUnit[] {
  if (!text || !languageCode.toLowerCase().startsWith("th") || !THAI_CHARACTER.test(text)) {
    return [{ text, isWhitespace: false }];
  }

  const Segmenter = Intl.Segmenter;
  if (!Segmenter) return [{ text, isWhitespace: false }];

  const segments = [...new Segmenter("th", { granularity: "word" }).segment(text)]
    .map((entry) => ({ segment: entry.segment, isWordLike: entry.isWordLike }));
  const units: ThaiLegalTextUnit[] = [];
  let run: WordSegment[] = [];

  const flushRun = () => {
    units.push(...splitProtectedRun(run));
    run = [];
  };

  segments.forEach((segment) => {
    if (WHITESPACE.test(segment.segment)) {
      flushRun();
      units.push({ text: segment.segment, isWhitespace: true });
      return;
    }
    run.push(segment);
  });
  flushRun();

  return units.length ? units : [{ text, isWhitespace: false }];
}

function splitProtectedRun(segments: WordSegment[]): ThaiLegalTextUnit[] {
  const result: ThaiLegalTextUnit[] = [];
  let remaining = segments;

  while (characterCount(remaining) > MAX_PROTECTED_CHARACTERS) {
    const cut = bestBreakIndex(remaining);
    result.push({ text: remaining.slice(0, cut).map((entry) => entry.segment).join(""), isWhitespace: false });
    remaining = remaining.slice(cut);
  }

  if (remaining.length) {
    result.push({ text: remaining.map((entry) => entry.segment).join(""), isWhitespace: false });
  }
  return result;
}

function bestBreakIndex(segments: WordSegment[]) {
  let characterTotal = 0;
  let stableCut = 0;
  let fallbackCut = 0;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    characterTotal += codePointLength(current.segment);
    if (characterTotal > MAX_PROTECTED_CHARACTERS) break;

    fallbackCut = index + 1;
    const stableWordBoundary = current.isWordLike === true
      && next.isWordLike === true
      && codePointLength(current.segment) >= MIN_STABLE_WORD_CHARACTERS
      && codePointLength(next.segment) >= MIN_STABLE_WORD_CHARACTERS;
    if (stableWordBoundary || SENTENCE_PUNCTUATION.test(current.segment)) {
      stableCut = index + 1;
    }
  }

  return stableCut || fallbackCut || 1;
}

function characterCount(segments: WordSegment[]) {
  return segments.reduce((total, entry) => total + codePointLength(entry.segment), 0);
}

function codePointLength(value: string) {
  return [...value].length;
}
