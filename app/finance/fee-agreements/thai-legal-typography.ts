export type ThaiLegalTextUnit = {
  text: string;
  isWhitespace: boolean;
  protectFromBreak: boolean;
  breakAfter: boolean;
};

const THAI_CHARACTER = /[\u0E00-\u0E7F]/u;
const WHITESPACE = /^\s+$/u;
const TERMINAL_PUNCTUATION = /[\p{Sentence_Terminal}\p{Terminal_Punctuation}]$/u;

export function thaiLegalTextUnits(text: string, languageCode = "th"): ThaiLegalTextUnit[] {
  if (!text || !languageCode.toLowerCase().startsWith("th") || !THAI_CHARACTER.test(text)) {
    return [unchangedUnit(text)];
  }

  const Segmenter = Intl.Segmenter;
  if (!Segmenter) return [unchangedUnit(text)];

  const segments = [...new Segmenter("th", { granularity: "word" }).segment(text)];
  return segments.map((entry, index) => {
    const next = segments[index + 1];
    const isWhitespace = WHITESPACE.test(entry.segment);
    const nextIsWhitespace = !next || WHITESPACE.test(next.segment);
    const wordBoundary = entry.isWordLike === true && next?.isWordLike === true;
    const punctuationBoundary = entry.isWordLike !== true && TERMINAL_PUNCTUATION.test(entry.segment);

    return {
      text: entry.segment,
      isWhitespace,
      protectFromBreak: entry.isWordLike === true && THAI_CHARACTER.test(entry.segment),
      breakAfter: !isWhitespace && !nextIsWhitespace && (wordBoundary || punctuationBoundary),
    };
  });
}

function unchangedUnit(text: string): ThaiLegalTextUnit {
  return { text, isWhitespace: false, protectFromBreak: false, breakAfter: false };
}
