/* eslint-disable no-continue */
import { format } from "../../../../../../../../../spark-evaluate";
import {
  DisplayCommandConfig,
  DisplayCommandData,
  DisplayProperties,
} from "../../../../../../../data";
import {
  ContourType,
  EASE,
  IElement,
  Inflection,
  interpolate,
  Intonation,
  parseTone,
  SparkGame,
  StressType,
  Tone,
  transpose,
} from "../../../../../../../game";
import { CharacterConfig, Prosody } from "./CharacterConfig";

interface Chunk {
  char: string;
  time?: number;
  duration: number;
  element: IElement;
  startOfWord: boolean;
  startOfSyllable: boolean;
  startOfEllipsis: boolean;
  voiced: boolean;
  italicized: boolean;
  bolded: boolean;
  underlined: boolean;
  punctuation: boolean;
  ellipsis: boolean;
  yelled: boolean;
  stress?: "strong" | "weak";
}

interface Word {
  text: string;
  italicized?: boolean;
  bolded?: boolean;
  underlined?: boolean;
  yelled?: boolean;
  syllables: { text: string; chunks: Chunk[] }[];
}

interface Phrase {
  text: string;
  chunks: Chunk[];
  finalStressType?: StressType;
}
interface Beep {
  time: number;
  duration: number;
  italicized: boolean;
  bolded: boolean;
  underlined: boolean;
  yelled: boolean;
  ellipsis: boolean;
  punctuation: boolean;
  voiced: boolean;
  stress?: "strong" | "weak";
}

const finalStressTypes: StressType[] = [
  "resolvedQuestion",
  "anxiousQuestion",
  "question",
  "exclamation",
  "lilt",
  "partial",
  "interrupted",
  "anxious",
  "statement",
];

const weakWords = [
  "a",
  "about",
  "above",
  "after",
  "all",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "before",
  "below",
  "beside",
  "but",
  "by",
  "can",
  "could",
  "do",
  "every",
  "for",
  "from",
  "had",
  "have",
  "he",
  "her",
  "her",
  "him",
  "his",
  "how",
  "i",
  "in",
  "is",
  "it",
  "may",
  "me",
  "must",
  "my",
  "not",
  "now",
  "of",
  "on",
  "or",
  "she",
  "should",
  "since",
  "some",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "til",
  "to",
  "until",
  "up",
  "us",
  "we",
  "what",
  "when",
  "where",
  "who",
  "whose",
  "why",
  "will",
  "with",
  "won't",
  "would",
  "you",
];

const contractions = ["'d", "'ll", "'m", "'re", "'s", "'t", "'ve", "n't"];

const defaultIntonation: Intonation = {
  // phrasePitchOffset: 0.25,
  // syllableFluctuation: 0.2,

  levelSemitones: 0.5,

  /**
   * ▅ ▅ ▆ ▃
   * 0  0  2 -5
   */
  resolvedQuestion: {
    phraseSlope: 1,
    driftContour: [0, 0],
    finalContour: [2, -5],
  },
  /**
   * ▅ ▅ ▆ ▇
   * 0  0  1  2
   */
  anxiousQuestion: {
    phraseSlope: 1,
    driftContour: [0, 0],
    finalContour: [1, 2],
  },
  /**
   * ▅ ▅ ▆ ▇
   * 0  0  1  2
   */
  question: {
    phraseSlope: 2,
    driftContour: [0, 0],
    finalContour: [1, 2],
  },
  /**
   * ▅ ▅ ▆ ▃
   * 0  0  1 -5
   */
  exclamation: {
    phraseSlope: 1,
    driftContour: [0, 0],
    finalContour: [1, -5],
  },
  /**
   * ▅ ▅ ▆ ▃
   * 0  0  1 -5
   */
  lilt: {
    phraseSlope: 0,
    driftContour: [0, 0],
    finalContour: [1, -5],
  },
  /**
   * ▅ ▅ ▆ ▃
   * 0  0  1 -5
   */
  partial: {
    phraseSlope: 1,
    driftContour: [0, 0],
    finalContour: [1, -5],
  },
  /**
   * ▅ ▅ ▆ ▃
   * 0  0  1 -5
   */
  interrupted: {
    phraseSlope: 2,
    driftContour: [0, 0],
    finalContour: [1, -5],
  },
  /**
   * ▅ ▅ ▃ ▃
   * 0  0 -1 -1
   */
  anxious: {
    phraseSlope: -1,
    driftContour: [0, 0],
    finalContour: [-1, -1, -1],
    pitchBend: -1,
    pitchEase: "sineOut",
    volumeBend: 0.25,
    volumeEase: "quadIn",
  },
  /**
   * ▅ ▅ ▆ ▃
   * 0  0  1 -5
   */
  statement: {
    phraseSlope: -1,
    driftContour: [0, 0],
    finalContour: [1, -5],
  },
};

const defaultProsody: Prosody = {
  maxSyllableLength: 4,

  ellipsisPauseScale: 2,
  wordPauseScale: 3,
  phrasePauseScale: 6,

  italicizedPauseScale: 2,
  underlinedPauseScale: 2,
  boldedPauseScale: 2,
  yelledPauseScale: 2,

  weakWords,
  contractions,

  /** Words that are spoken aloud */
  voiced: /([\p{L}\p{N}']+)/u,
  /** Words that are yelled loudly */
  yelled: /^([^\p{Ll}\r\n]*?\p{Lu}\p{Lu}[^\p{Ll}\r\n]*?)$/u,
  /** Punctuation that is typed with a sound */
  punctuation: /([.!?]+)/u,

  /** Who's that(?) */
  resolvedQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+[!?]*([?])[!?]*[ ]*$/,
  /** Yes.(..)? */
  anxiousQuestion: /(?:^[\t ]*|\b)[^\t\n\r .?]*([.][.][.])[.]*[?]+[ ]*$/,
  /** Yes(?) */
  question: /(?:^[\t ]*|\b)[^\t\n\r !?]*[!?]*([?])[!?]*[ ]*$/,
  /** Yes(!) */
  exclamation: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!]+)[ ]*$/,
  /** Yes(~) */
  lilt: /(?:^[\t ]*|\b)[^\t\n\r ~]*([~]+)[ ]*$/,
  /** Yes(,) */
  partial: /(?:^[\t ]*|\b)[^\t\n\r ,]*([,])[ ]*$/,
  /** Yes-(-) */
  interrupted: /(?:^[\t ]*|\b)[^\t\n\r -]*[-]([-]+)[ ]*$/,
  /** Yes.(..) */
  anxious: /(?:^[\t ]*|\b)[^\t\n\r .]*([.][.][.])[.]*[ ]*$/,
  /** Yes(.) */
  statement: /(?:^[\t ]*|\b)[^\t\n\r .]*([.])[ ]*$/,
};

const defaultCharacterConfig = {
  tone: "0.02s cubic|<E4>|0.02s cubic",
  intonation: defaultIntonation,
  prosody: defaultProsody,
};

export const defaultDisplayCommandConfig: DisplayCommandConfig = {
  default: {
    indicator: {
      className: "Indicator",
      fadeDuration: 0.15,
    },
  },
  parenthetical: { hidden: "beat" },
  dialogue: {
    className: "Dialogue",
    typing: {
      letterDelay: 0.02,
      fadeDuration: 0,
      letterVolume: 0.5,
      punctuationVolume: 0.1,
      tone: "0.02s cubic|<G3,20> (E6,3) (C7,1)|0.02s cubic",
    },
  },
};

const getStress = (
  phrase: string,
  prosody: Prosody | undefined
): [StressType, number] => {
  if (prosody) {
    for (let i = 0; i < finalStressTypes.length; i += 1) {
      const stressType = finalStressTypes[i] || "statement";

      const match = stressType
        ? phrase
            ?.toLowerCase()
            .match(new RegExp(prosody?.[stressType] || "", "u"))
        : undefined;
      if (match) {
        const stressScale = match[1]?.length || 0;
        return [stressType, stressScale];
      }
    }
  }
  return ["statement", 1];
};

const getInflection = (
  stressType: StressType | undefined,
  intonation: Intonation | undefined
): Inflection | undefined => {
  return intonation?.[stressType || ("" as StressType)];
};

const getArray = (contour: number[] | ContourType | undefined): number[] => {
  return (
    (typeof contour === "string"
      ? contour.split(" ").map((x) => Number(x))
      : contour) || []
  );
};

const getStep = (index: number, arrayLength: number, contour: number[]) => {
  const maxArrayIndex = arrayLength - 1;
  const progress = maxArrayIndex > 0 ? index / maxArrayIndex : 0;
  const frameIndex = progress * (contour.length - 1);
  const frameFloorIndex = Math.floor(frameIndex);
  const frameCeilingIndex = Math.min(contour.length - 1, Math.ceil(frameIndex));
  const startS = contour[frameFloorIndex] || 0;
  const endS = contour[frameCeilingIndex] || 0;
  const tweenProgress =
    frameFloorIndex > 0 ? frameIndex % frameFloorIndex : frameIndex;
  return interpolate(tweenProgress, startS, endS, EASE.linear);
};

const hideChoices = (
  game: SparkGame,
  structName: string,
  config: DisplayCommandConfig
): void => {
  const choiceEls = game.ui.findAllUIElements(
    structName,
    config?.choice?.className || "Choice"
  );
  choiceEls.forEach((el) => {
    if (el) {
      el.replaceChildren();
      el.style["display"] = "none";
    }
  });
};

const createCharSpan = (
  game: SparkGame,
  part: string,
  instant: boolean,
  style?: Record<string, string | null>
): IElement => {
  const spanEl = game.ui.createElement("span");
  spanEl.style["opacity"] = instant ? "1" : "0";
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k as "all"] = v as string;
  });
  spanEl.textContent = part;
  return spanEl;
};

const get = (...vals: (number | undefined)[]): number => {
  for (let i = 0; i < vals.length; i += 1) {
    const val = vals[i];
    if (val != null) {
      return val;
    }
  }
  const result = vals[vals.length - 1];
  if (result === undefined) {
    return 0;
  }
  return result;
};

const set = (obj: any, propertyPath: string, value: unknown): void => {
  let cur = obj;
  const parts = propertyPath.split(".");
  parts.forEach((part, partIndex) => {
    if (partIndex === parts.length - 1) {
      cur[part] = value;
    } else {
      cur = cur[part];
    }
  });
};

const getWords = (phrase: Phrase): Word[] => {
  const words: Word[] = [];

  phrase.chunks.forEach((chunk) => {
    if (words.length === 0 || chunk.startOfWord) {
      words.push({ text: "", syllables: [] });
    }
    const word = words[words.length - 1];
    if (word) {
      if (word.syllables.length === 0 || chunk.startOfSyllable) {
        word.syllables.push({ text: "", chunks: [] });
      }
      if (chunk.voiced) {
        word.text += chunk.char;
      }
      word.italicized = word.italicized || chunk.italicized;
      word.bolded = word.bolded || chunk.bolded;
      word.underlined = word.bolded || chunk.underlined;
      word.yelled = word.bolded || chunk.yelled;
      const syllable = word.syllables[word.syllables.length - 1];
      if (syllable) {
        if (chunk.voiced) {
          syllable.text += chunk.char;
        }
        syllable.chunks.push(chunk);
      }
    }
  });

  return words;
};

const getPhrases = (
  game: SparkGame,
  content: string,
  valueMap: Record<string, unknown>,
  displayProps: DisplayProperties | undefined,
  characterProps: CharacterConfig | undefined,
  instant = false,
  debug?: boolean
): Phrase[] => {
  const letterDelay = get(displayProps?.typing?.letterDelay, 0);
  const letterFadeDuration = get(displayProps?.typing?.fadeDuration, 0);
  const wordPauseScale = get(characterProps?.prosody?.wordPauseScale, 1);
  const phrasePauseScale = get(characterProps?.prosody?.phrasePauseScale, 1);
  const ellipsisPauseScale = get(
    characterProps?.prosody?.ellipsisPauseScale,
    1
  );
  const italicizedPauseScale = get(
    characterProps?.prosody?.italicizedPauseScale,
    1
  );
  const underlinedPauseScale = get(
    characterProps?.prosody?.underlinedPauseScale,
    1
  );
  const yelledPauseScale = get(characterProps?.prosody?.yelledPauseScale, 1);
  const boldedPauseScale = get(characterProps?.prosody?.boldedPauseScale, 1);
  const maxSyllableLength = get(characterProps?.prosody?.maxSyllableLength);
  const voicedRegex = new RegExp(characterProps?.prosody?.voiced || "", "u");
  const yelledRegex = new RegExp(characterProps?.prosody?.yelled || "", "u");
  const punctuationRegex = new RegExp(
    characterProps?.prosody?.punctuation || "",
    "u"
  );
  const weakWords = characterProps?.prosody?.weakWords || [];
  const contractions = characterProps?.prosody?.contractions || [];
  const weakWordVariants = weakWords.flatMap((w) => [
    w,
    ...contractions.map((c) => `${w}${c}`),
  ]);

  const partEls: IElement[] = [];
  const phrases: Phrase[] = [];
  let consecutiveLettersLength = 0;
  let consecutiveDotLength = 0;
  let word = "";
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  let firstSpaceSpan: IElement | undefined = undefined;
  const imageUrls = new Set<string>();
  const audioUrls = new Set<string>();
  let hideSpace = false;
  for (let i = 0; i < splitContent.length; ) {
    const part = splitContent[i] || "";
    const lastMark = marks[marks.length - 1]?.[0];
    const doubleLookahead = splitContent.slice(i, i + 2).join("");
    const tripleLookahead = splitContent.slice(i, i + 3).join("");
    if (tripleLookahead === "***") {
      if (lastMark === "***") {
        marks.pop();
      } else {
        marks.push(["***", i]);
      }
      i += 3;
      continue;
    }
    if (doubleLookahead === "**") {
      if (lastMark === "**") {
        marks.pop();
      } else {
        marks.push(["**", i]);
      }
      i += 2;
      continue;
    }
    if (doubleLookahead === "[[") {
      i += 2;
      const from = i;
      while (
        i < splitContent.length &&
        splitContent.slice(i, i + 2).join("") !== "]]"
      ) {
        i += 1;
      }
      const to = i;
      const portraitName = splitContent.slice(from, to).join("");
      const portraitUrl = valueMap?.[portraitName] as string;
      if (portraitUrl) {
        imageUrls.add(portraitUrl);
      }
      i += 2;
      continue;
    }
    if (doubleLookahead === "((") {
      i += 2;
      const from = i;
      while (
        i < splitContent.length &&
        splitContent.slice(i, i + 2).join("") !== "))"
      ) {
        i += 1;
      }
      const to = i;
      const audioName = splitContent.slice(from, to).join("");
      const audioUrl = valueMap?.[audioName] as string;
      if (audioUrl) {
        audioUrls.add(audioUrl);
      }
      i += 2;
      continue;
    }
    if (part === "|") {
      i += 1;
      hideSpace = true;
      continue;
    }
    if (part === "*") {
      if (lastMark === "*") {
        marks.pop();
      } else {
        marks.push([part, i]);
      }
      i += 1;
      continue;
    }
    if (part === "_") {
      if (lastMark === "_") {
        marks.pop();
      } else {
        marks.push([part, i]);
      }
      i += 1;
      continue;
    }
    const markers = marks.map((x) => x[0]);
    const underlined = markers.includes("_");
    const isBoldedAndItalicized = markers.includes("***");
    const isBolded = markers.includes("**");
    const isItalicized = markers.includes("*");
    const italicized = isBoldedAndItalicized || isItalicized;
    const bolded = isBoldedAndItalicized || isBolded;
    const style = {
      textDecoration: underlined ? "underline" : null,
      fontStyle: italicized ? "italic" : null,
      fontWeight: bolded ? "bold" : null,
      whiteSpace: part === "\n" ? "pre-wrap" : null,
    };
    const span = createCharSpan(game, part || "", instant, style);
    const voiced = voicedRegex.test(part);
    const punctuation = punctuationRegex.test(part);
    if (part === " " || part === "\n" || part === "\r" || part === "\t") {
      word = "";
      spaceLength += 1;
      consecutiveLettersLength = 0;
      consecutiveDotLength = 0;
    } else {
      word += part;
      spaceLength = 0;
      if (part === ".") {
        consecutiveDotLength += 1;
      } else {
        consecutiveDotLength = 0;
      }
      if (voiced) {
        consecutiveLettersLength += 1;
      } else {
        consecutiveLettersLength = 0;
      }
    }
    const yelled = yelledRegex.test(word);
    const emphasizedPauseScale =
      (italicized ? italicizedPauseScale : 0) +
      (bolded ? boldedPauseScale : 0) +
      (underlined ? underlinedPauseScale : 0) +
      (yelled ? yelledPauseScale : 0);
    const currentLetterDelay = letterDelay * Math.max(1, emphasizedPauseScale);
    const startOfEllipsis =
      consecutiveDotLength === 1 && tripleLookahead === "...";
    const ellipsis = startOfEllipsis || consecutiveDotLength > 1;
    const isWordPause = spaceLength === 1;
    const isPhrasePause = spaceLength > 1;
    const duration = ellipsis
      ? letterDelay * ellipsisPauseScale
      : isWordPause
      ? letterDelay * wordPauseScale
      : isPhrasePause
      ? letterDelay * phrasePauseScale
      : currentLetterDelay;
    if (isPhrasePause) {
      phrasePauseLength += 1;
      phraseUnpauseLength = 0;
      if (phrasePauseLength === 1) {
        // start pause phrase
        phrases.push({
          text: part,
          chunks: [
            {
              char: part,
              duration,
              element: span,
              startOfWord: false,
              startOfSyllable: false,
              startOfEllipsis,
              voiced,
              italicized,
              bolded,
              underlined,
              yelled,
              ellipsis,
              punctuation,
            },
          ],
        });
      } else {
        // continue pause phrase
        const currentPhrase = phrases[phrases.length - 1];
        if (currentPhrase) {
          currentPhrase.text += part;
          currentPhrase.chunks.push({
            char: part,
            duration,
            element: span,
            startOfWord: false,
            startOfSyllable: false,
            startOfEllipsis,
            voiced,
            italicized,
            bolded,
            underlined,
            yelled,
            ellipsis,
            punctuation,
          });
        }
      }
    } else {
      phrasePauseLength = 0;
      phraseUnpauseLength += 1;
      // determine beep
      const charIndex = consecutiveLettersLength - 1;
      const startOfSyllable =
        charIndex === 0 ||
        (charIndex > 0 && charIndex % maxSyllableLength === 0);
      const startOfWord = consecutiveLettersLength === 1;
      if (startOfSyllable) {
        if (debug) {
          span.style["backgroundColor"] = `hsl(185, 100%, 50%)`;
        }
      }
      if (phraseUnpauseLength === 1) {
        // start voiced phrase
        phrases.push({
          text: part,
          chunks: [
            {
              char: part,
              duration,
              element: span,
              startOfWord,
              startOfSyllable,
              startOfEllipsis,
              voiced,
              italicized,
              bolded,
              underlined,
              yelled,
              ellipsis,
              punctuation,
            },
          ],
        });
      } else {
        // continue voiced phrase
        const currentPhrase = phrases[phrases.length - 1];
        if (currentPhrase) {
          currentPhrase.text += part;
          currentPhrase.chunks.push({
            char: part,
            duration,
            element: span,
            startOfWord,
            startOfSyllable,
            startOfEllipsis,
            voiced,
            italicized,
            bolded,
            underlined,
            yelled,
            ellipsis,
            punctuation,
          });
        }
      }
    }
    partEls[i] = span;
    if (spaceLength === 1) {
      firstSpaceSpan = span;
    }
    if ((isWordPause || isPhrasePause || ellipsis) && firstSpaceSpan && debug) {
      // color pause span (longer time = darker color)
      firstSpaceSpan.style["backgroundColor"] = `hsla(0, 100%, 50%, ${
        spaceLength / 5
      })`;
    }
    if (spaceLength > 0) {
      if (hideSpace) {
        if (firstSpaceSpan) {
          firstSpaceSpan.textContent = "";
        }
        span.textContent = "";
      }
    } else {
      hideSpace = false;
    }
    i += 1;
  }

  // Invalidate any leftover open markers
  if (marks.length > 0) {
    while (marks.length > 0) {
      const [lastMark, lastMarkIndex] = marks[marks.length - 1] || [];
      const invalidStyleEls = partEls.slice(lastMarkIndex).map((x) => x);
      invalidStyleEls.forEach((e) => {
        if (lastMark === "***") {
          e.style["fontWeight"] = null;
          e.style["fontStyle"] = null;
        }
        if (lastMark === "**") {
          e.style["fontWeight"] = null;
        }
        if (lastMark === "*") {
          e.style["fontStyle"] = null;
        }
        if (lastMark === "_") {
          e.style["textDecoration"] = null;
        }
      });
      marks.pop();
    }
  }

  let time = 0;
  phrases.forEach((phrase) => {
    const [finalStressType, finalStressScale] = getStress(
      phrase.text,
      characterProps?.prosody
    );
    const inflection = getInflection(
      finalStressType,
      characterProps?.intonation
    );
    const finalContourLength = getArray(inflection?.finalContour).length;

    const words = getWords(phrase);

    let focusedWordFound = false;
    let unstressedFinalWordExists = false;
    // Stress final focus word
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const word = words[i];
      if (word && word.text) {
        const cleanedText = word.text.toLowerCase().trim();
        const isFocus = !weakWordVariants.includes(cleanedText);
        if (isFocus) {
          if (word.syllables.length === 1 && !unstressedFinalWordExists) {
            // If focused word is only 1 syllable long and isn't followed by an unfocused word,
            // split the syllable into a weak and strong syllable
            word.syllables.forEach((s) => {
              const midIndex = Math.floor(s.chunks.length / 2);
              s.chunks.forEach((c, index) => {
                if (index === midIndex) {
                  c.startOfSyllable = true;
                }
                if (index < midIndex) {
                  c.stress = "strong";
                } else {
                  c.stress = "weak";
                }
                c.duration *= finalContourLength;
              });
            });
          } else {
            // If followed by weak word, make entire focus word strong,
            // otherwise, only make the first syllable of the focus word strong
            word.syllables.forEach((s, syllableIndex) => {
              s.chunks.forEach((c) => {
                if (unstressedFinalWordExists || syllableIndex === 0) {
                  c.stress = "strong";
                } else {
                  c.stress = "weak";
                }
              });
            });
          }
          focusedWordFound = true;
          break;
        } else {
          unstressedFinalWordExists = true;
          // Unstress all words after the focus word
          word.syllables.forEach((s) => {
            s.chunks.forEach((c) => {
              c.stress = "weak";
            });
          });
        }
      }
    }

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      if (word && word.text) {
        const isEmphasized =
          word.italicized || word.bolded || word.underlined || word.yelled;
        if (isEmphasized) {
          // Stress words with forced emphasis
          word.syllables.forEach((s, syllableIndex) => {
            s.chunks.forEach((c) => {
              if (syllableIndex === 0) {
                c.stress = "strong";
              } else {
                c.stress = "weak";
              }
            });
          });
        }
        // Enforce minimum duration for all syllables
        const minSyllableLength = maxSyllableLength - 1;
        const minSyllableDuration = minSyllableLength * letterDelay;
        word.syllables.forEach((s) => {
          if (s.text.length < minSyllableLength) {
            s.chunks.forEach((c) => {
              if (c.voiced) {
                c.duration = Math.max(
                  c.duration,
                  minSyllableDuration / s.text.length
                );
              }
            });
          }
        });
      }
    }

    // Enforce larger minimum duration for last syllable
    const minLastSyllableLength = maxSyllableLength;
    const minLastSyllableDuration = (minLastSyllableLength - 1) * letterDelay;
    const lastWord = words[words.length - 1];
    if (lastWord) {
      if (lastWord.text) {
        if (!focusedWordFound) {
          // If no focused word found, focus on the last word
          if (lastWord.syllables.length === 1) {
            // If last word is only 1 syllable long,
            // split the syllable into a weak and strong syllable
            lastWord.syllables.forEach((s) => {
              const midIndex = Math.floor(s.chunks.length / 2);
              s.chunks.forEach((c, index) => {
                if (index === midIndex) {
                  c.startOfSyllable = true;
                }
                if (index < midIndex) {
                  c.stress = "strong";
                } else {
                  c.stress = "weak";
                }
                c.duration *= finalContourLength;
              });
            });
          } else {
            // Make the first syllable of the last word strong
            lastWord.syllables.forEach((s, syllableIndex) => {
              s.chunks.forEach((c) => {
                if (syllableIndex === 0) {
                  c.stress = "strong";
                } else {
                  c.stress = "weak";
                }
              });
            });
          }
        }
      }

      // Apply finalStressScale to last word
      lastWord.syllables.forEach((s) => {
        s.chunks.forEach((c) => {
          c.duration *= finalStressScale * finalContourLength;
        });
      });

      const lastSyllable = lastWord.syllables[lastWord.syllables.length - 1];
      if (lastSyllable) {
        if (lastSyllable.text.length < minLastSyllableLength) {
          lastSyllable.chunks.forEach((c) => {
            if (c.voiced) {
              c.duration = Math.max(
                c.duration,
                minLastSyllableDuration / lastSyllable.text.length
              );
            }
          });
        }
      }
    }

    phrase.finalStressType = finalStressType;
    phrase.chunks.forEach((c) => {
      c.time = time;
      c.element.style["transition"] = instant
        ? "none"
        : `opacity ${letterFadeDuration}s linear ${c.time}s`;
      time += c.duration;
    });
  });
  return phrases;
};

const isHidden = (content: string, hiddenRegex?: string): boolean => {
  if (!hiddenRegex) {
    return false;
  }
  return new RegExp(`^[(]${hiddenRegex}[)]$`).test(content);
};

export const executeDisplayCommand = (
  game: SparkGame,
  data?: DisplayCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    objectMap: { [type: string]: Record<string, unknown> };
    instant?: boolean;
    debug?: boolean;
    fadeOutDuration?: number;
  },
  voiceState?: {
    lastCharacter?: string;
    phraseOffset?: Record<string, number>;
  },
  onFinished?: () => void,
  preview?: boolean
): ((timeMS: number) => void) | undefined => {
  const type = data?.type || "";
  const assets = data?.assets || [];

  const valueMap = context?.valueMap || {};
  const objectMap = context?.objectMap || {};
  const structName = "Display";

  game.ui.loadStyles(objectMap);
  game.ui.loadUI(objectMap, structName);

  const customDisplayConfig = {
    ...((objectMap?.["display"]?.["default"] as DisplayCommandConfig) || {}),
  };
  const combinedDisplayConfig: DisplayCommandConfig = {
    ...(defaultDisplayCommandConfig || {}),
  };
  Object.entries(customDisplayConfig).forEach(([k, v]) => {
    set(combinedDisplayConfig, k, v);
  });
  const displayConfig = combinedDisplayConfig;

  const fadeOutDuration = context?.fadeOutDuration || 0;

  const assetsOnly = type === "assets";
  if (assetsOnly) {
    const backgroundEl = game.ui.findFirstUIElement(
      structName,
      displayConfig?.background?.className || "Background"
    );
    if (backgroundEl) {
      const imageName = assets?.[0] || "";
      const imageUrl = valueMap?.[imageName];
      if (imageName && imageUrl) {
        backgroundEl.style["backgroundImage"] = `url("${imageUrl}")`;
        backgroundEl.style["backgroundRepeat"] = "no-repeat";
        backgroundEl.style["display"] = null;
      } else {
        backgroundEl.style["display"] = "none";
      }
    }
    return undefined;
  }

  const character = data?.character || "";
  const parenthetical = data?.parenthetical || "";
  const content = data?.content;
  const autoAdvance = data?.autoAdvance;
  const clearPreviousText = data?.clearPreviousText;
  const characterKey = character
    .replace(/([ ])/g, "_")
    .replace(/([.'"`])/g, "");

  const customCharacterConfig = {
    ...((objectMap?.["character"]?.["default"] as CharacterConfig) || {}),
    ...((objectMap?.["character"]?.[type] as CharacterConfig) || {}),
    ...((objectMap?.["character"]?.[characterKey] as CharacterConfig) || {}),
  };
  const combinedCharacterConfig: CharacterConfig = {
    ...(defaultCharacterConfig || {}),
  };
  Object.entries(customCharacterConfig).forEach(([k, v]) => {
    set(combinedCharacterConfig, k, v);
  });
  const characterConfig = combinedCharacterConfig;

  const validCharacter =
    type === "dialogue" &&
    !isHidden(character, displayConfig?.character?.hidden)
      ? characterConfig?.name || character || ""
      : "";
  const validParenthetical =
    type === "dialogue" &&
    !isHidden(parenthetical, displayConfig?.parenthetical?.hidden)
      ? parenthetical || ""
      : "";

  const trimmedContent = content?.trim() === "_" ? "" : content || "";
  const [replaceTagsResult] = format(trimmedContent, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  const commandType = `${data?.reference?.refTypeId || ""}`;

  const instant =
    context?.instant || !get(displayConfig?.[type]?.typing?.letterDelay);
  const debug = context?.debug;
  const indicatorFadeDuration =
    displayConfig?.default?.indicator?.fadeDuration || 0;

  const descriptionGroupEl = game.ui.findFirstUIElement(
    structName,
    displayConfig?.description_group?.className || "DescriptionGroup"
  );
  const dialogueGroupEl = game.ui.findFirstUIElement(
    structName,
    displayConfig?.dialogue_group?.className || "DialogueGroup"
  );
  const portraitEl = game.ui.findFirstUIElement(
    structName,
    displayConfig?.portrait?.className || "Portrait"
  );
  const indicatorEl = game.ui.findFirstUIElement(
    structName,
    displayConfig?.default?.indicator?.className || "Indicator"
  );

  if (portraitEl) {
    const imageName = assets?.[0] || "";
    const imageUrl = valueMap?.[imageName];
    if (imageName && imageUrl) {
      portraitEl.style["backgroundImage"] = `url("${imageUrl}")`;
      portraitEl.style["backgroundRepeat"] = "no-repeat";
      portraitEl.style["backgroundPosition"] = "center";
      portraitEl.style["display"] = null;
    } else {
      portraitEl.style["display"] = "none";
    }
  }

  hideChoices(game, structName, displayConfig);

  if (dialogueGroupEl) {
    dialogueGroupEl.style["display"] = type === "dialogue" ? null : "none";
  }
  if (descriptionGroupEl) {
    descriptionGroupEl.style["display"] = type !== "dialogue" ? null : "none";
  }

  const characterEl = game.ui.findFirstUIElement(
    structName,
    displayConfig?.character?.className || "Character"
  );
  const parentheticalEl = game.ui.findFirstUIElement(
    structName,
    displayConfig?.parenthetical?.className || "Parenthetical"
  );
  const contentElEntries = [
    {
      key: "dialogue",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfig?.dialogue?.className || "Dialogue"
      ),
    },
    {
      key: "action",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfig?.action?.className || "Action"
      ),
    },
    {
      key: "centered",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfig?.centered?.className || "Centered"
      ),
    },
    {
      key: "scene",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfig?.scene?.className || "Scene"
      ),
    },
    {
      key: "transition",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfig?.transition?.className || "Transition"
      ),
    },
  ];

  if (characterEl) {
    characterEl.textContent = validCharacter;
    characterEl.style["display"] = validCharacter ? null : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.textContent = validParenthetical;
    parentheticalEl.style["display"] = validParenthetical ? null : "none";
  }
  const displayProps = displayConfig?.[type];
  const phrases = getPhrases(
    game,
    evaluatedContent?.trimStart(),
    valueMap,
    displayProps,
    characterConfig,
    instant,
    debug
  );
  const allChunks = phrases.flatMap((x) => x.chunks);
  contentElEntries.forEach(({ key, value }) => {
    if (value) {
      if (key === type) {
        if (clearPreviousText) {
          value.replaceChildren();
        }
        allChunks.forEach((c, i) => {
          c.element.id = value.id + `.span${i.toString().padStart(8, "0")}`;
          value.appendChild(c.element);
        });
        value.style["display"] = null;
      } else {
        value.replaceChildren();
        value.style["display"] = "none";
      }
    }
  });
  if (indicatorEl) {
    if (data && !autoAdvance) {
      indicatorEl.style["transition"] = null;
      indicatorEl.style["opacity"] = instant ? "1" : "0";
      indicatorEl.style["display"] = null;
      indicatorEl.style["animation-play-state"] = "paused";
    } else {
      indicatorEl.style["display"] = "none";
    }
  }
  const handleFinished = (): void => {
    for (let i = 0; i < allChunks.length; i += 1) {
      const chunk = allChunks[i];
      if (chunk && chunk.element.style["opacity"] !== "1") {
        chunk.element.style["opacity"] = "1";
      }
    }
    if (indicatorEl) {
      indicatorEl.style[
        "transition"
      ] = `opacity ${indicatorFadeDuration}s linear`;
      indicatorEl.style["opacity"] = "1";
      indicatorEl.style["animation-play-state"] = preview
        ? "paused"
        : "running";
    }
    onFinished?.();
  };

  if (game) {
    if (instant) {
      game.synth.stopInstrument(commandType, fadeOutDuration);
      handleFinished();
    } else {
      const letterDelay = get(displayProps?.typing?.letterDelay, 0);
      const letterVolume = get(displayProps?.typing?.letterVolume, 1);
      const punctuationVolume = get(displayProps?.typing?.punctuationVolume, 1);
      // Determine the display's modal pitch (the neutral pitch of text that is typed out)
      const displayTone = parseTone(displayProps?.typing?.tone || "");
      // Determine the character's modal pitch (the neutral pitch of their voice)
      const characterTone = parseTone(characterConfig?.tone || "");
      // Determine how much a character's pitch will raise between related phrases
      const phrasePitchOffset = get(
        characterConfig?.intonation?.phrasePitchOffset,
        0
      );
      const syllableFluctuation = get(
        characterConfig?.intonation?.syllableFluctuation,
        0
      );
      const levelSemitones = get(
        characterConfig?.intonation?.levelSemitones,
        1
      );

      // As character continues to speak, their pitch should start at their previous ending pitch
      let startingOffset =
        voiceState?.lastCharacter === characterKey
          ? voiceState?.phraseOffset?.[characterKey] || 0
          : 0;
      const tones: Tone[] = phrases.flatMap((phrase): Tone[] => {
        const characterBeeps: (Beep & Partial<Tone>)[] = [];
        const displayBeeps: (Beep & Partial<Tone>)[] = [];

        let lastCharacterBeep: (Beep & Partial<Tone>) | undefined = undefined;
        let lastDisplayBeep: (Beep & Partial<Tone>) | undefined = undefined;
        const phraseBeeps = phrase.chunks
          .map((c) => {
            if (c.startOfSyllable) {
              lastCharacterBeep = {
                ...c,
                time: c.time || 0,
                waves: characterTone?.waves?.map((w) => ({ ...w })),
                velocity: letterVolume,
              };
              characterBeeps.push(lastCharacterBeep);
              return lastCharacterBeep;
            }
            if (c.punctuation) {
              lastDisplayBeep = {
                ...c,
                time: c.time || 0,
                duration: letterDelay * 2,
                waves: displayTone?.waves?.map((w) => ({ ...w })),
                velocity: punctuationVolume,
              };
              displayBeeps.push(lastDisplayBeep);
              return lastDisplayBeep;
            }
            if (lastCharacterBeep) {
              if (c.voiced) {
                lastCharacterBeep.duration += c.duration;
              }
            }
            return undefined;
          })
          .filter((b) => b);

        if (phraseBeeps.length === 0) {
          return [];
        }

        // Determine the type of stress this phrase should have according to character prosody.
        const inflection = getInflection(
          phrase.finalStressType,
          characterConfig.intonation
        );
        const finalContour = getArray(inflection?.finalContour).map(
          (p) => p * levelSemitones
        );
        const driftContour = getArray(inflection?.driftContour).map(
          (p) => p * levelSemitones
        );
        const pitchBend = inflection?.pitchBend;
        const pitchEase = inflection?.pitchEase;
        const volumeBend = inflection?.volumeBend;
        const volumeEase = inflection?.volumeEase;
        const phraseSlope = inflection?.phraseSlope || 0;

        const s = finalContour[0] || 0;
        const w = finalContour[1] || 0;

        // Initialize all syllables according to the character's intonation
        phraseBeeps.forEach((b) => {
          if (b?.waves) {
            b.waves.forEach((wave) => {
              if (b.stress === "strong") {
                wave.note = transpose(wave.note, startingOffset + s);
              } else if (b.stress === "weak") {
                wave.note = transpose(wave.note, startingOffset + w);
              }
            });
          }
        });

        characterBeeps.forEach((b, i) => {
          if (b.waves) {
            b.waves.forEach((wave) => {
              if (i === characterBeeps.length - 1) {
                // Bend last voiced beep if necessary
                wave.pitchBend = pitchBend;
                wave.pitchEase = pitchEase;
                wave.volumeBend = volumeBend;
                wave.volumeEase = volumeEase;
              }
            });
          }
        });

        // The next phrase should start at a higher or lower pitch
        startingOffset += phrasePitchOffset * phraseSlope;
        return phraseBeeps as Tone[];
      });
      // Store character's ending pitch
      if (voiceState) {
        if (!voiceState.phraseOffset) {
          voiceState.phraseOffset = {};
        }
        voiceState.phraseOffset[characterKey] = startingOffset;
        if (characterKey) {
          voiceState.lastCharacter = characterKey;
        }
      }
      // Start playing beeps
      game.synth.configureInstrument(commandType);
      game.synth.playInstrument(commandType, tones, () => {
        // Start typing letters
        allChunks.forEach((c) => {
          c.element.style["opacity"] = "1";
        });
      });
    }
  }
  if (data) {
    if (indicatorEl && (!game || instant)) {
      indicatorEl.style["transition"] = null;
      indicatorEl.style["opacity"] = "1";
    }
  }
  let startTime: number | undefined;
  let finished = false;
  const totalDuration = allChunks.reduce((p, c) => p + c.duration, 0);
  const handleTick = (timeMS: number): void => {
    if (!finished) {
      const currTime = timeMS / 1000;
      if (startTime === undefined) {
        startTime = currTime;
      }
      const elapsed = currTime - startTime;
      if (elapsed >= totalDuration) {
        finished = true;
        handleFinished();
      }
    }
  };
  return handleTick;
};
