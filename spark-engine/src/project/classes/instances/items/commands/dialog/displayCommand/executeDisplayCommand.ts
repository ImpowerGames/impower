/* eslint-disable no-continue */
import { format } from "../../../../../../../../../spark-evaluate";
import { DisplayCommandData, DisplayConfig } from "../../../../../../../data";
import {
  convertNoteToHertz,
  deepCopy,
  getCustomizedConfig,
  IElement,
  Inflection,
  Intonation,
  req,
  SparkGame,
  StressType,
  Tone,
  transpose,
} from "../../../../../../../game";
import { CharacterConfig, Prosody } from "../types/CharacterConfig";
import { TypewriterConfig } from "../types/TypewriterConfig";

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
  stressLevel?: number;
}

interface Syllable {
  text: string;
  chunks: Chunk[];
}

interface Word {
  text: string;
  italicized?: boolean;
  bolded?: boolean;
  underlined?: boolean;
  yelled?: boolean;
  syllables: Syllable[];
}

interface Phrase {
  text: string;
  chunks: Chunk[];
  finalStressType?: StressType;
}
interface Beep extends Chunk {
  time: number;
}

const finalStressTypes: StressType[] = [
  "liltQuestion",
  "liltExclamation",
  "lilt",
  "resolvedAnxiousQuestion",
  "anxiousQuestion",
  "resolvedQuestion",
  "question",
  "exclamation",
  "comma",
  "partial",
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
  phrasePitchIncrement: 0.25,
  phrasePitchMaxOffset: 1,

  downdriftIncrement: 0.025,
  syllableFluctuation: 0.25,

  stressLevelSemitones: 0.5,

  /**
   * ▆ ▂
   * 1 -5
   */
  liltQuestion: {
    phraseSlope: 0,
    neutralLevel: 2,
    finalContour: [4, 2],
    pitchRamp: 0.2,
    pitchAccel: -0.3,
    pitchJerk: -0.5,
    finalDilation: 3,
  },
  /**
   * ▆ ▂
   * 1 -5
   */
  liltExclamation: {
    phraseSlope: 0,
    neutralLevel: 3,
    finalContour: [5, 4],
    pitchRamp: 0.2,
    pitchAccel: -0.3,
    pitchJerk: -0.5,
    finalDilation: 3,
  },
  /**
   * ▆ ▂
   * 1 -5
   */
  lilt: {
    phraseSlope: 0,
    finalContour: [1, -5],
    pitchRamp: 0.2,
    pitchAccel: -0.3,
    pitchJerk: -0.5,
    finalDilation: 2,
  },
  /**
   * ▆ ▂
   * 2 -5
   */
  resolvedAnxiousQuestion: {
    phraseSlope: 1,
    finalContour: [3, 4],
    finalDilation: 3,
  },
  /**
   * ▆ ▇
   * 1  2
   */
  anxiousQuestion: {
    phraseSlope: 1,
    finalContour: [1, 2],
    finalDilation: 4,
  },
  /**
   * ▆ ▂
   * 2 -5
   */
  resolvedQuestion: {
    phraseSlope: 1,
    finalContour: [2, -5],
    finalDilation: 2,
  },
  /**
   * ▆ ▇
   * 1  2
   */
  question: {
    phraseSlope: 2,
    finalContour: [1, 2],
    finalDilation: 2,
  },
  /**
   * ▉
   * 8
   */
  exclamation: {
    phraseSlope: 2,
    neutralLevel: 4,
    finalContour: [5],
    emphasisContour: [6],
    pitchJerk: -0.5,
    finalDilation: 2,
  },
  /**
   * ▆ ▂
   * 1 -5
   */
  comma: {
    phraseSlope: 1,
    finalContour: [1, -5],
    finalDilation: 2,
  },
  /**
   * ▆ ▇
   * 1  2
   */
  partial: {
    phraseSlope: 2,
    finalContour: [1, 2],
    finalDilation: 2,
  },
  /**
   * ▂ ▂
   * -1 -1
   */
  anxious: {
    phraseSlope: -1,
    finalContour: [-1, -1, -1],
    pitchJerk: -0.25,
    volumeRamp: -0.25,
    finalDilation: 3,
  },
  /**
   * ▆ ▃
   * 1 -5
   */
  statement: {
    phraseSlope: -1,
    finalContour: [1, -5],
    emphasisContour: [3, 2, 1.5],
    finalDilation: 2,
  },
};

const defaultProsody: Prosody = {
  maxSyllableLength: 4,

  weakWords,
  contractions,

  /** Words that are spoken aloud */
  voiced: /([\p{L}\p{N}']+)/u,
  /** Words that are yelled loudly */
  yelled: /^([^\p{Ll}\r\n]*?\p{Lu}\p{Lu}[^\p{Ll}\r\n]*?)$/u,
  /** Punctuation that is typed with a sound */
  punctuation: /([.!?-]+)/u,

  /** Who's that(...?) */
  resolvedAnxiousQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([.][.][.][!?]*[?][!?]*)[ ]*$/,
  /** Yes(...?) */
  anxiousQuestion: /(?:^[\t ]*|\b)[^\t\n\r .?]*([.][.][.]+[?]+)[ ]*$/,
  /** Who's that(?) */
  resolvedQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ ]*$/,
  /** Yes(?) */
  question: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!?]*[?][!?]*)[ ]*$/,
  /** Yes(!) */
  exclamation: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!]+)[ ]*$/,
  /** Yes(~?) */
  liltQuestion: /(?:^[\t ]*|\b)[^\t\n\r ~!?]*([~]+[!?]*[?][!?]*)[ ]*$/,
  /** Yes(~!) */
  liltExclamation: /(?:^[\t ]*|\b)[^\t\n\r ~!?]*([~]+[!]+)[ ]*$/,
  /** Yes(~) */
  lilt: /(?:^[\t ]*|\b)[^\t\n\r ~]*([~]+)[ ]*$/,
  /** Yes(,) */
  comma: /(?:^[\t ]*|\b)[^\t\n\r ,]*([,])[ ]*$/,
  /** Yes(--) */
  partial: /(?:^[\t ]*|\b)[^\t\n\r -]*([-][-]+)[ ]*$/,
  /** Yes(...) */
  anxious: /(?:^[\t ]*|\b)[^\t\n\r .]*([.][.][.]+)[ ]*$/,
  /** Yes(.) */
  statement: /(?:^[\t ]*|\b)[^\t\n\r .]*([.])[ ]*$/,
};

const defaultCharacterConfig: CharacterConfig = {
  intonation: defaultIntonation,
  prosody: defaultProsody,
};

export const defaultDisplayConfigs: Record<string, DisplayConfig> = {
  parenthetical: { hidden: "beat" },
  indicator: {
    fadeDuration: 0.15,
  },
};

export const defaultTypewriterConfig: TypewriterConfig = {
  letterDelay: 0.02,
  pauseScale: 3,
  fadeDuration: 0,
  clackSound: {},
};

const getStressType = (
  phrase: string,
  prosody: Prosody | undefined
): StressType => {
  if (prosody) {
    for (let i = 0; i < finalStressTypes.length; i += 1) {
      const stressType = finalStressTypes[i] || "statement";

      const match = stressType
        ? phrase
            ?.toLowerCase()
            .match(new RegExp(prosody?.[stressType] || "", "u"))
        : undefined;
      if (match) {
        return stressType;
      }
    }
  }
  return "statement";
};

const getInflection = (
  stressType: StressType | undefined,
  intonation: Intonation | undefined
): Inflection | undefined => {
  return intonation?.[stressType || ("" as StressType)];
};

const getArray = <T>(value: T[] | string | undefined): T[] => {
  return (
    (typeof value === "string" ? value.split(" ").map((x) => x as T) : value) ||
    []
  );
};

const hideChoices = (
  game: SparkGame,
  structName: string,
  config: DisplayConfig
): void => {
  const choiceEls = game.ui.findAllUIElements(
    structName,
    config?.className || "Choice"
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

const stressWord = (
  word: Word,
  contour: number[],
  durationMultiplier: number = 1
): void => {
  const validContourLength = Math.max(1, contour.length);
  if (word.syllables.length < contour.length) {
    const combinedChunks = word.syllables.flatMap((s) => s.chunks);
    // Split word into enough syllables so that there is one syllable per final contour index
    const originalSyllableCount = word.syllables.length;
    const newSyllableCount = validContourLength;
    const divisionChunkLength = Math.round(word.text.length / newSyllableCount);
    const splitDurationMultiplier = newSyllableCount / originalSyllableCount;
    let contourIndex = 0;
    combinedChunks.forEach((c, i) => {
      if (c.voiced) {
        c.duration *= splitDurationMultiplier * durationMultiplier;
      }
      c.stressLevel = contour[contourIndex];
      if (i % divisionChunkLength === 0 && c.voiced) {
        c.startOfSyllable = true;
        contourIndex += 1;
      } else {
        c.startOfSyllable = false;
      }
    });
  } else {
    const max = Math.max(1, word.syllables.length - 1);
    word.syllables.forEach((s, i) => {
      const progress = i / max;
      s.chunks.forEach((c) => {
        const contourIndex = Math.floor(progress * (validContourLength - 1));
        if (c.voiced) {
          c.duration *= durationMultiplier;
        }
        c.stressLevel = contour[contourIndex];
      });
    });
  }
};

const getPhrases = (
  game: SparkGame,
  content: string,
  valueMap: Record<string, unknown>,
  typewriter: TypewriterConfig | undefined,
  characterProps: CharacterConfig | undefined,
  instant = false,
  debug?: boolean
): Phrase[] => {
  const letterDelay = get(typewriter?.letterDelay, 0);
  const pauseScale = get(typewriter?.pauseScale, 1);
  const letterFadeDuration = get(typewriter?.fadeDuration, 0);
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
    const startOfEllipsis =
      consecutiveDotLength === 1 && tripleLookahead === "...";
    const ellipsis = startOfEllipsis || consecutiveDotLength > 1;
    const isWordPause = spaceLength === 1;
    const isPhrasePause = spaceLength > 1;
    const duration =
      isWordPause || isPhrasePause || yelled || punctuation
        ? letterDelay * pauseScale
        : letterDelay;
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
    if ((isWordPause || isPhrasePause) && firstSpaceSpan && debug) {
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
    const finalStressType = getStressType(phrase.text, characterProps?.prosody);
    const inflection = getInflection(
      finalStressType,
      characterProps?.intonation
    );
    const downdriftIncrement =
      characterProps?.intonation?.downdriftIncrement || 0;
    const syllableFluctuation =
      characterProps?.intonation?.syllableFluctuation || 0;
    const dilation = inflection?.finalDilation;
    const neutralLevel = inflection?.neutralLevel;
    const finalContour = getArray(inflection?.finalContour);
    const emphasisContour =
      getArray(inflection?.emphasisContour) || finalContour;

    const words = getWords(phrase);

    let currentNeutralLevel = neutralLevel || 0;
    let stressedWordFound = false;
    let terminalWordExists = false;
    let fluctuationDirection = -1;
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const word = words[i];
      if (word && word.text) {
        // Enforce a minimum duration for all syllables
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
        if (word.italicized || word.bolded || word.underlined || word.yelled) {
          stressedWordFound = true;
          // Stress words with forced emphasis
          stressWord(word, emphasisContour, 3);
        } else if (!stressedWordFound) {
          const cleanedText = word.text.toLowerCase().trim();
          const isPossibleFocusWord = !weakWordVariants.includes(cleanedText);
          if (isPossibleFocusWord) {
            stressedWordFound = true;
            // If this word is followed by a terminal word,
            // there is no need to include the terminal stress index when stressing this word
            const stressContour = terminalWordExists
              ? finalContour.slice(0, -1)
              : finalContour;
            stressWord(word, stressContour);
          } else {
            terminalWordExists = true;
            // All words after the focus word are terminal words
            word.syllables.forEach((s) => {
              s.chunks.forEach((c) => {
                const terminalStressIndex = finalContour.length - 1;
                c.stressLevel = finalContour[terminalStressIndex];
              });
            });
          }
        }
        word.syllables.forEach((s) => {
          s.chunks.forEach((c) => {
            if (c.stressLevel === undefined) {
              c.stressLevel =
                currentNeutralLevel +
                fluctuationDirection * syllableFluctuation;
              currentNeutralLevel += downdriftIncrement;
            }
          });
          fluctuationDirection *= -1;
        });
      }
    }

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      if (word) {
        word.syllables.forEach((s) => {
          s.chunks.forEach((c) => {
            c.stressLevel = (c.stressLevel || 0) - currentNeutralLevel;
          });
        });
      }
    }

    let scaledFinalWord = false;
    for (let i = words.length - 1; i >= 0; i -= 1) {
      if (stressedWordFound && scaledFinalWord) {
        // Nothing left to do
        break;
      }
      const word = words[i];
      if (word) {
        if (word.text) {
          if (!stressedWordFound) {
            stressedWordFound = true;
            // Just stress the last word of the phrase
            stressWord(word, finalContour);
          }
        }
        if (!scaledFinalWord) {
          scaledFinalWord = true;
          // Apply dilation to last word
          word.syllables.forEach((s) => {
            s.chunks.forEach((c) => {
              c.duration *= dilation || 1;
            });
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

      if (debug) {
        if (c.startOfSyllable) {
          c.element.style["backgroundColor"] = `hsl(185, 100%, 50%)`;
        }
        if (c.punctuation) {
          c.element.style["backgroundColor"] = `hsl(300, 100%, 80%)`;
        }
      }
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
    objectMap: { [type: string]: Record<string, object> };
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

  const typewriterConfig = getCustomizedConfig(
    defaultTypewriterConfig,
    objectMap,
    "typewriter",
    type
  );

  const displayConfigs: Record<string, DisplayConfig> = {};
  Object.keys(defaultDisplayConfigs).forEach((type) => {
    const defaultDisplayConfig = defaultDisplayConfigs[type];
    if (defaultDisplayConfig) {
      displayConfigs[type] = getCustomizedConfig(
        defaultDisplayConfig,
        objectMap,
        "display",
        type
      );
    }
  });

  const fadeOutDuration = context?.fadeOutDuration || 0;

  const assetsOnly = type === "assets";
  if (assetsOnly) {
    const backgroundEl = game.ui.findFirstUIElement(
      structName,
      displayConfigs?.["background"]?.className || "Background"
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

  const characterConfig = getCustomizedConfig(
    defaultCharacterConfig,
    objectMap,
    "character",
    type,
    characterKey
  );

  const validCharacter =
    type === "dialogue" &&
    !isHidden(character, displayConfigs?.["character"]?.hidden)
      ? characterConfig?.name || character || ""
      : "";
  const validParenthetical =
    type === "dialogue" &&
    !isHidden(parenthetical, displayConfigs?.["parenthetical"]?.hidden)
      ? parenthetical || ""
      : "";

  const trimmedContent = content?.trim() === "_" ? "" : content || "";
  const [replaceTagsResult] = format(trimmedContent, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  const commandType = `${data?.reference?.refTypeId || ""}`;

  const instant = context?.instant || !req(typewriterConfig?.letterDelay);
  const debug = context?.debug;
  const indicatorFadeDuration =
    displayConfigs?.["indicator"]?.fadeDuration || 0;

  const descriptionGroupEl = game.ui.findFirstUIElement(
    structName,
    displayConfigs?.["description_group"]?.className || "DescriptionGroup"
  );
  const dialogueGroupEl = game.ui.findFirstUIElement(
    structName,
    displayConfigs?.["dialogue_group"]?.className || "DialogueGroup"
  );
  const portraitEl = game.ui.findFirstUIElement(
    structName,
    displayConfigs?.["portrait"]?.className || "Portrait"
  );
  const indicatorEl = game.ui.findFirstUIElement(
    structName,
    displayConfigs?.["indicator"]?.className || "Indicator"
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

  hideChoices(game, structName, displayConfigs);

  if (dialogueGroupEl) {
    dialogueGroupEl.style["display"] = type === "dialogue" ? null : "none";
  }
  if (descriptionGroupEl) {
    descriptionGroupEl.style["display"] = type !== "dialogue" ? null : "none";
  }

  const characterEl = game.ui.findFirstUIElement(
    structName,
    displayConfigs?.["character"]?.className || "Character"
  );
  const parentheticalEl = game.ui.findFirstUIElement(
    structName,
    displayConfigs?.["parenthetical"]?.className || "Parenthetical"
  );
  const contentElEntries = [
    {
      key: "dialogue",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfigs?.["dialogue"]?.className || "Dialogue"
      ),
    },
    {
      key: "action",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfigs?.["action"]?.className || "Action"
      ),
    },
    {
      key: "centered",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfigs?.["centered"]?.className || "Centered"
      ),
    },
    {
      key: "scene",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfigs?.["scene"]?.className || "Scene"
      ),
    },
    {
      key: "transition",
      value: game.ui.findFirstUIElement(
        structName,
        displayConfigs?.["transition"]?.className || "Transition"
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
  const phrases = getPhrases(
    game,
    evaluatedContent?.trimStart(),
    valueMap,
    typewriterConfig,
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
      const letterDelay = req(typewriterConfig?.letterDelay, 0);
      const clackSound = typewriterConfig?.clackSound;
      const voiceSound = characterConfig?.voiceSound || clackSound;
      // Determine how much a character's pitch will raise between related phrases
      const phrasePitchIncrement = get(
        characterConfig?.intonation?.phrasePitchIncrement,
        0
      );
      const maxPhrasePitchOffset = get(
        characterConfig?.intonation?.phrasePitchMaxOffset,
        1
      );
      const stressLevelIncrement = get(
        characterConfig?.intonation?.stressLevelSemitones,
        1
      );

      // As character continues to speak, their pitch should start at their previous ending pitch
      let startingOffset =
        voiceState?.lastCharacter === characterKey
          ? voiceState?.phraseOffset?.[characterKey] || 0
          : 0;
      if (Math.abs(startingOffset) > maxPhrasePitchOffset) {
        startingOffset = 0;
      }
      const tones: Tone[] = phrases.flatMap((phrase): Tone[] => {
        let lastCharacterBeep: (Beep & Partial<Tone>) | undefined = undefined;
        const phraseBeeps: (Beep & Partial<Tone>)[] = phrase.chunks.flatMap(
          (c) => {
            if (c.startOfSyllable) {
              const sound = voiceSound ? deepCopy(voiceSound) : voiceSound;
              lastCharacterBeep = {
                ...c,
                sound,
                time: c.time || 0,
                duration: c.duration || 0,
              };
              return [lastCharacterBeep];
            }
            if (c.punctuation) {
              const sound = voiceSound ? deepCopy(clackSound) : clackSound;
              const lastDisplayBeep = {
                ...c,
                sound,
                time: c.time || 0,
                duration: letterDelay * 2,
              };
              return [lastDisplayBeep];
            }
            if (lastCharacterBeep) {
              if (c.voiced) {
                lastCharacterBeep.duration += c.duration;
              }
            }
            return [];
          }
        );

        if (phraseBeeps.length === 0) {
          return [];
        }

        // Determine the type of stress this phrase should have according to character prosody.
        const inflection = getInflection(
          phrase.finalStressType,
          characterConfig.intonation
        );
        const pitchRamp = inflection?.pitchRamp;
        const pitchAccel = inflection?.pitchAccel;
        const pitchJerk = inflection?.pitchJerk;
        const volumeRamp = inflection?.volumeRamp;
        const phraseSlope = inflection?.phraseSlope || 0;

        // The phrase should start at a higher or lower pitch according to phraseSlope
        startingOffset += phrasePitchIncrement * phraseSlope;

        let foundLastVoicedBeep = false;

        for (let i = phraseBeeps.length - 1; i >= 0; i -= 1) {
          const b = phraseBeeps[i];
          if (b) {
            if (b.sound) {
              const freq = convertNoteToHertz(
                b.note || b.sound.frequency?.pitch || "A4"
              );
              // Transpose waves according to stress contour
              b.note = transpose(
                freq,
                startingOffset + (b.stressLevel || 0) * stressLevelIncrement
              );
              if (!foundLastVoicedBeep && b.voiced) {
                // Bend last voiced beep
                foundLastVoicedBeep = true;
                if (!b.sound.frequency) {
                  b.sound.frequency = {};
                }
                b.sound.frequency.ramp = pitchRamp;
                b.sound.frequency.accel = pitchAccel;
                b.sound.frequency.jerk = pitchJerk;
                if (!b.sound.amplitude) {
                  b.sound.amplitude = {};
                }
                b.sound.amplitude.ramp = volumeRamp;
              }
            }
          }
        }

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
