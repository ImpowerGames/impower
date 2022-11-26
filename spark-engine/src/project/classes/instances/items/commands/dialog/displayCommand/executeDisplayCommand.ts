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

const CAPITALIZED_WORD_REGEX =
  /^([^\p{Ll}\r\n]*?\p{Lu}\p{Lu}[^\p{Ll}\r\n]*?)$/u;

interface PhraseData {
  phrase: string;
  time: number;
  elements: IElement[];
  beeps?: Beep[];
}
interface Beep extends Tone {
  syllableIndex?: number;
  emphasisOffset?: number;
  offset?: number;
}

// TODO: Support voice type shortcuts for character tone.
// const voiceType = {
//   soprano: "C5",
//   mezzoSoprano: "A4",
//   contralto: "F4",
//   alto: "G4",
//   countertenor: "E4",
//   tenor: "B3",
//   baritone: "G3",
//   bass: "E3",
// };

// const britishIntonation: Intonation = {
//   fluctuation: "+2 +1",
//   downdrift: "+3 +2 +1", // '-_
//   italicized: "+1 +3 +2", // _'-
//   underlined: "+1 +2 +2", // _--
//   bolded: "+1 +2 +1", // _-_
//   capitalized: "+3 +3 +3", // '''
//   resolvedQuestion: "+3 +2 +3", // '-'
//   question: "+3 +1 +2", // '_-
//   lilt: "+3 +3 +2", // ''-
//   command: "+2 +3 +2", // -'-
//   exclamation: "+2 +3 +2", // -'-
//   tentative: "+3 +2 +2", // '--
//   anticipation: "+2 +3 +2", // -'-
//   statement: "+2 +2 +1", // --_
// };

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

const defaultIntonation: Intonation = {
  envelope: {
    attackTime: 0.025,
    releaseTime: 0.025,
  },

  volume: 0.5,

  phrasePitchOffset: 0.25,
  syllableFluctuation: 0.2,

  italicizedPitchOffset: 2,
  underlinedPitchOffset: 2,
  boldedPitchOffset: 2,
  capitalizedPitchOffset: 2,

  resolvedQuestion: {
    phraseSlope: 1,
    driftContour: [1, 4, 1, -1, -2],
    finalContour: [2, 2, -1],
  },
  anxiousQuestion: {
    phraseSlope: 1,
    driftContour: [1, 4, 1, -1, -2],
    finalContour: [-2, -1, -1],
  },
  question: {
    phraseSlope: 2,
    driftContour: [1, 4, 1, -1, -2],
    finalContour: [-1, 0, 4],
  },
  exclamation: {
    phraseSlope: 1,
    driftContour: [4, 5, 4],
    finalContour: [5, 4],
  },
  lilt: {
    phraseSlope: 0,
    driftContour: [0, 0],
    finalContour: [3, 0, 6],
  },
  partial: {
    phraseSlope: 1,
    driftContour: [0, 4, 1, -1, -2],
    finalContour: [3, 2, 2],
  },
  interrupted: {
    phraseSlope: 2,
    driftContour: [0, 2, 1, 0],
    finalContour: [1, 2],
  },
  anxious: {
    phraseSlope: -1,
    driftContour: [0, 2, 1, -1],
    finalContour: [0, 1, -1],
  },
  statement: {
    phraseSlope: -1,
    driftContour: [0, 2, 1, -1, -2],
    finalContour: [4, 0, -4],
  },
};

const defaultProsody: Prosody = {
  maxSyllableLength: 3,

  wordPauseScale: 3,
  phrasePauseScale: 6,
  beepDurationScale: 0.99,

  italicizedPauseScale: 2,
  underlinedPauseScale: 2,
  boldedPauseScale: 2,
  capitalizedPauseScale: 2,

  /** Who's that(?) */
  resolvedQuestion:
    /\b(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+[!?]*([?])[!?]*[ ]*$/,
  /** Yes(...?) */
  anxiousQuestion: /\b[^\t\n\r .?]+[.]([.]+)[?]+[ ]*$/,
  /** Yes(?) */
  question: /\b[^\t\n\r !?]+[!?]*([?])[!?]*[ ]*$/,
  /** Yes(!) */
  exclamation: /\b[^\t\n\r !?]+([!]+)[ ]*$/,
  /** Yes(~) */
  lilt: /\b[^\t\n\r ~]+([~]+)[ ]*$/,
  /** Yes(,) */
  partial: /\b[^\t\n\r ,]+([,])[ ]*$/,
  /** Yes(--) */
  interrupted: /\b[^\t\n\r -]+[-]([-]+)[ ]*$/,
  /** Yes(...) */
  anxious: /\b[^\t\n\r .]+[.]([.]+)[ ]*$/,
  /** Yes(.) */
  statement: /\b[^\t\n\r .]+([.])[ ]*$/,
  /** Spoken aloud */
  voiced: /([\p{L}\p{N}]+)/u,
};

const defaultCharacterConfig = {
  tone: "<E4>",
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
      letterDelay: 0.025,
      fadeDuration: 0,
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
        const stressScale = 1 + (match[1]?.length || 0);
        return [stressType, stressScale];
      }
    }
  }
  return ["statement", 1];
};

const getInflection = (
  stressType: StressType,
  intonation: Intonation | undefined
): Inflection | undefined => {
  return intonation?.[stressType];
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
  letterFadeDuration: number,
  instant: boolean,
  totalDelay: number,
  style?: Record<string, string | null>
): IElement => {
  const spanEl = game.ui.createElement("span");
  spanEl.style["opacity"] = instant ? "1" : "0";
  spanEl.style["transition"] = instant
    ? "none"
    : `opacity ${letterFadeDuration}s linear ${totalDelay}s`;
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

const getAnimatedSpanElements = (
  game: SparkGame,
  content: string,
  valueMap: Record<string, unknown>,
  displayProps: DisplayProperties | undefined,
  characterProps: CharacterConfig | undefined,
  instant = false,
  debug?: boolean
): [IElement[], PhraseData[]] => {
  const letterFadeDuration = get(displayProps?.typing?.fadeDuration, 0);
  const letterDelay = get(displayProps?.typing?.letterDelay, 0);
  const wordPauseScale = get(characterProps?.prosody?.wordPauseScale, 1);
  const phrasePauseScale = get(characterProps?.prosody?.phrasePauseScale, 1);
  const italicizedPauseScale = get(
    characterProps?.prosody?.italicizedPauseScale,
    1
  );
  const underlinedPauseScale = get(
    characterProps?.prosody?.underlinedPauseScale,
    1
  );
  const boldedPauseScale = get(characterProps?.prosody?.boldedPauseScale, 1);
  const italicizedPitchOffset = get(
    characterProps?.intonation?.italicizedPitchOffset,
    1
  );
  const underlinedPitchOffset = get(
    characterProps?.intonation?.underlinedPitchOffset,
    1
  );
  const boldedPitchOffset = get(
    characterProps?.intonation?.boldedPitchOffset,
    1
  );
  const capitalizedPitchOffset = get(
    characterProps?.intonation?.capitalizedPitchOffset,
    1
  );
  const maxSyllableLength = get(characterProps?.prosody?.maxSyllableLength);
  const beepDurationScale = get(characterProps?.prosody?.beepDurationScale, 1);
  const voicedRegex = new RegExp(characterProps?.prosody?.voiced || "", "u");

  const partEls: IElement[] = [];
  const spanEls: IElement[] = [];
  const phraseDatas: PhraseData[] = [];
  let consecutiveLettersLength = 0;
  let totalDelay = 0;
  let chunkDelay = 0;
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
    const tripleMark = splitContent.slice(i, i + 3).join("");
    const doubleMark = splitContent.slice(i, i + 2).join("");
    if (tripleMark === "***") {
      if (lastMark === "***") {
        marks.pop();
      } else {
        marks.push(["***", i]);
      }
      i += 3;
      continue;
    }
    if (doubleMark === "**") {
      if (lastMark === "**") {
        marks.pop();
      } else {
        marks.push(["**", i]);
      }
      i += 2;
      continue;
    }
    if (doubleMark === "[[") {
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
    if (doubleMark === "((") {
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
    const isUnderlinedLetter = markers.includes("_");
    const isBoldedAndItalicized = markers.includes("***");
    const isBolded = markers.includes("**");
    const isItalicized = markers.includes("*");
    const isItalicizedLetter = isBoldedAndItalicized || isItalicized;
    const isBoldedLetter = isBoldedAndItalicized || isBolded;
    const style = {
      textDecoration: isUnderlinedLetter ? "underline" : null,
      fontStyle: isItalicizedLetter ? "italic" : null,
      fontWeight: isBoldedLetter ? "bold" : null,
      whiteSpace: part === "\n" ? "pre-wrap" : null,
    };
    const span = createCharSpan(
      game,
      part || "",
      letterFadeDuration,
      instant,
      chunkDelay,
      style
    );
    if (part === " " || part === "\n" || part === "\r" || part === "\t") {
      word = "";
      spaceLength += 1;
      consecutiveLettersLength = 0;
    } else {
      word += part;
      spaceLength = 0;
      if (voicedRegex.test(part)) {
        consecutiveLettersLength += 1;
      } else {
        consecutiveLettersLength = 0;
      }
    }
    const isWordCapitalizedSoFar = CAPITALIZED_WORD_REGEX.test(word);
    const emphasizedPauseScale =
      (isItalicizedLetter ? italicizedPauseScale : 1) *
      (isBoldedLetter ? boldedPauseScale : 1) *
      (isUnderlinedLetter ? underlinedPauseScale : 1);
    const emphasizedPitchIncrement =
      (isItalicizedLetter ? italicizedPitchOffset : 1) *
      (isBoldedLetter ? boldedPitchOffset : 1) *
      (isUnderlinedLetter ? underlinedPitchOffset : 1) *
      (isWordCapitalizedSoFar ? capitalizedPitchOffset : 1);
    const currentLetterDelay = letterDelay * emphasizedPauseScale;
    const isWordPause = spaceLength === 1;
    const isPhrasePause = spaceLength > 1;
    if (isPhrasePause) {
      phrasePauseLength += 1;
      phraseUnpauseLength = 0;
      if (phrasePauseLength === 1) {
        // start pause chunk
        phraseDatas.push({
          phrase: part,
          time: totalDelay,
          elements: [span],
        });
      } else {
        // continue pause chunk
        const lastChunk = phraseDatas[phraseDatas.length - 1];
        if (lastChunk) {
          lastChunk.phrase += part;
          lastChunk.elements.push(span);
        }
      }
      chunkDelay = 0;
    } else {
      phrasePauseLength = 0;
      phraseUnpauseLength += 1;
      if (phraseUnpauseLength === 1) {
        // start letter chunk
        phraseDatas.push({
          phrase: part,
          time: totalDelay,
          elements: [span],
        });
      } else {
        // continue letter chunk
        const lastChunk = phraseDatas[phraseDatas.length - 1];
        if (lastChunk) {
          lastChunk.phrase += part;
          lastChunk.elements.push(span);
        }
      }
      chunkDelay += currentLetterDelay;
    }
    spanEls.push(span);
    partEls[i] = span;
    const charIndex = consecutiveLettersLength - 1;
    const shouldBeep = charIndex >= 0 && charIndex % maxSyllableLength === 0;
    if (shouldBeep) {
      const currChunk = phraseDatas[phraseDatas.length - 1];
      if (currChunk) {
        if (!currChunk.beeps) {
          currChunk.beeps = [];
        }
        const beepScale =
          emphasizedPauseScale > 1
            ? emphasizedPauseScale * 0.95
            : beepDurationScale;
        const beep: Beep = {
          time: totalDelay,
          duration: letterDelay * maxSyllableLength * beepScale,
          syllableIndex: Math.floor(
            consecutiveLettersLength / maxSyllableLength
          ),
          emphasisOffset: emphasizedPitchIncrement,
        };
        currChunk.beeps.push(beep);
      }
      if (debug) {
        // color beep span
        span.style["backgroundColor"] = `hsl(185, 100%, 50%)`;
      }
    }
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
    totalDelay += isPhrasePause
      ? letterDelay * phrasePauseScale
      : isWordPause
      ? letterDelay * wordPauseScale
      : currentLetterDelay;
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
  return [spanEls, phraseDatas];
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
  const displayConfig =
    (objectMap?.[structName]?.["default"] as DisplayCommandConfig) ||
    defaultDisplayCommandConfig;
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

  const characterConfig = {
    ...(defaultCharacterConfig || {}),
    ...((objectMap?.["character"]?.["default"] as CharacterConfig) || {}),
    ...((objectMap?.["character"]?.[type] as CharacterConfig) || {}),
    ...((objectMap?.["character"]?.[characterKey] as CharacterConfig) || {}),
  };

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
  const [spanEls, phraseDatas] = getAnimatedSpanElements(
    game,
    evaluatedContent?.trimStart(),
    valueMap,
    displayConfig?.[type],
    characterConfig,
    instant,
    debug
  );
  const beeps = phraseDatas.flatMap((chunk) => {
    if (!chunk.beeps) {
      return [];
    }
    return chunk.beeps;
  });
  contentElEntries.forEach(({ key, value }) => {
    if (value) {
      if (key === type) {
        if (clearPreviousText) {
          value.replaceChildren();
        }
        spanEls.forEach((s: IElement, i: number) => {
          s.id = value.id + `.span${i.toString().padStart(8, "0")}`;
          value.appendChild(s);
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
    for (let i = 0; i < spanEls.length; i += 1) {
      const spanEl = spanEls[i];
      if (spanEl && spanEl.style["opacity"] !== "1") {
        spanEl.style["opacity"] = "1";
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
      // Determine the character's modal pitch (the natural base pitch of their voice)
      const modalTone = parseTone(characterConfig?.tone || "");
      // Determine how much a character's pitch will raise between related phrases
      const phrasePitchOffset =
        characterConfig?.intonation?.phrasePitchOffset || 0;
      const syllableFluctuation =
        characterConfig?.intonation?.syllableFluctuation || 0;
      // Determine the "shape" of the character's voice
      const pitchCurve = characterConfig?.intonation?.pitchCurve;
      const envelope = characterConfig?.intonation?.envelope;
      const volume = characterConfig?.intonation?.volume || 1;

      // As character continues to speak, their pitch should start at their previous ending pitch
      let currentPhrasePitchOffset =
        voiceState?.lastCharacter === characterKey
          ? voiceState?.phraseOffset?.[characterKey] || 0
          : 0;
      const tones: Tone[] = phraseDatas.flatMap(
        (phraseData, phraseIndex): Tone[] => {
          const chunkBeeps = phraseData.beeps;
          if (!chunkBeeps || chunkBeeps.length === 0) {
            return [];
          }

          // Track what time next beep occurs to ensure that this beep doesn't overlap with next beep when adjusting duration
          let nextPhraseBeepTime = 0;
          for (let i = phraseIndex + 1; i < phraseDatas.length; i += 1) {
            const phraseData = phraseDatas[i];
            const beepTime = phraseData?.beeps?.[0]?.time || 0;
            if (beepTime) {
              nextPhraseBeepTime = beepTime;
              break;
            }
          }

          // Determine the type of stress this phrase should have according to character prosody.
          const [finalStressType, finalStressScale] = getStress(
            phraseData.phrase,
            characterConfig.prosody
          );
          const inflection = getInflection(
            finalStressType,
            characterConfig.intonation
          );
          const finalContour = getArray(inflection?.finalContour);

          // The remaining points represent the final stress contour
          const finalStressStart = finalContour[0] || 0;
          const finalStressEnd = finalContour[finalContour.length - 1] || 0;
          const stressDelta = finalStressEnd - finalStressStart;
          const stressDirection =
            stressDelta < 0 ? -1 : stressDelta > 0 ? 1 : 0;
          const driftContour = getArray(inflection?.driftContour);
          const phraseSlope = inflection?.phraseSlope || 0;

          // Initialize all syllables according to the character's intonation
          chunkBeeps.forEach((b: Beep, i) => {
            const modalWaves = modalTone?.waves || [];
            if (!b.waves) {
              b.waves = [];
            }
            const nextBeepTime = chunkBeeps[i + 1]?.time;
            // Max duration of this beep so that it doesn't overlap with next beep
            const maxDuration =
              (nextBeepTime || nextPhraseBeepTime
                ? nextBeepTime || nextPhraseBeepTime || 0
                : Number.MAX_SAFE_INTEGER) - (b.time || 0);
            // Clamp to max beep duration
            b.duration = Math.min(b.duration || 0, maxDuration);

            const s = currentPhrasePitchOffset + ((b.emphasisOffset || 0) - 1);
            b.offset = (b.offset || 0) + s;
            for (let w = 0; w < modalWaves.length; w += 1) {
              const wave = { ...modalWaves[w] };
              wave.note = transpose(wave?.note, s);
              wave.velocity = volume;
              b.waves[w] = wave;
              if (b.duration > 0.25) {
                wave.bend = -0.5;
              }
            }
            b.pitchCurve = pitchCurve;
            b.envelope = envelope;
          });

          const wordBeeps: Beep[][] = [[]];
          for (let i = 0; i < chunkBeeps.length; i += 1) {
            const beep: Beep | undefined = chunkBeeps[i];
            if (beep) {
              wordBeeps[wordBeeps.length - 1]?.push(beep);
            }
            const nextBeep: Beep | undefined = chunkBeeps[i + 1];
            if (nextBeep && nextBeep.syllableIndex === 0) {
              wordBeeps.push([]);
            }
          }
          const lastWordBeeps = wordBeeps[wordBeeps.length - 1] || [];
          const secondToLastWordBeeps = wordBeeps[wordBeeps.length - 2] || [];

          // If last word is only 1 syllable long,
          // And second-to-last word is more than 1 syllable long
          // Final stress includes syllables from previous word
          const finalStressBeeps =
            lastWordBeeps.length === 1 && secondToLastWordBeeps.length > 1
              ? [...secondToLastWordBeeps, ...lastWordBeeps]
              : [...lastWordBeeps];
          const driftBeeps = chunkBeeps.filter(
            (b) => !finalStressBeeps.includes(b)
          );

          let syllableDirection = -1;
          driftBeeps.forEach((b: Beep, i) => {
            // Pitch naturally drifts down over the phrase
            const s = getStep(i, driftBeeps.length, driftContour);
            // Pitch alternately rises and falls for each syllable
            // (iambic pentameter = te TUM te TUM te TUM)
            const f = syllableFluctuation * syllableDirection;
            b.offset = (b.offset || 0) + s + f;
            if (b.waves) {
              b.waves.forEach((wave) => {
                wave.note = transpose(wave.note, s + f);
              });
            }
            syllableDirection *= -1;
          });

          if (finalStressBeeps.length === 1) {
            // When the final stress is only one syllable long,
            // bend the pitch over that one syllable
            const b = finalStressBeeps[0];
            if (b) {
              // Max duration of this beep so that it doesn't overlap with next beep
              const maxDuration =
                (nextPhraseBeepTime
                  ? nextPhraseBeepTime
                  : Number.MAX_SAFE_INTEGER) - (b.time || 0);
              // Increase syllable duration to give more time for last stress
              b.duration = Math.min(
                (b.duration || 0) * finalStressScale * 2,
                maxDuration
              );
              // Transpose note to the start of stress
              const s = finalStressStart;
              b.offset = (b.offset || 0) + s;
              if (b.waves) {
                b.waves.forEach((wave) => {
                  wave.note = transpose(wave.note, s);
                  wave.bend = stressDirection;
                });
              }
            }
          } else {
            finalStressBeeps.forEach((b: Beep, i: number) => {
              const nextBeepTime = finalStressBeeps[i + 1]?.time;
              // Max duration of this beep so that it doesn't overlap with next beep
              const maxDuration =
                (nextBeepTime || nextPhraseBeepTime
                  ? nextBeepTime || nextPhraseBeepTime || 0
                  : Number.MAX_SAFE_INTEGER) - (b.time || 0);
              // Increase syllable duration to give more time for last stress
              b.duration = Math.min(
                (b.duration || 0) * finalStressScale,
                maxDuration
              );
              // Transpose note depending on where we are in the stress contour
              const s = getStep(i, finalStressBeeps.length, finalContour);
              b.offset = (b.offset || 0) + s;
              if (b.waves) {
                b.waves.forEach((wave) => {
                  wave.note = transpose(wave.note, s);
                });
              }
            });
          }
          // Each subsequent phrase starts at a higher or lower pitch
          currentPhrasePitchOffset += phrasePitchOffset * phraseSlope;
          return chunkBeeps as Tone[];
        }
      );
      // Store character's ending pitch
      if (voiceState) {
        if (!voiceState.phraseOffset) {
          voiceState.phraseOffset = {};
        }
        voiceState.phraseOffset[characterKey] = currentPhrasePitchOffset;
        if (characterKey) {
          voiceState.lastCharacter = characterKey;
        }
      }
      game.synth.configureInstrument(commandType);
      game.synth.playInstrument(commandType, tones);
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
  const totalDuration = Math.max(
    ...beeps.map(({ time, duration }) => (time || 0) + (duration || 0))
  );
  const handleTick = (timeMS: number): void => {
    if (!finished) {
      const currTime = timeMS / 1000;
      if (startTime === undefined) {
        startTime = currTime;
      }
      const elapsed = currTime - startTime;
      for (let i = 0; i < phraseDatas.length; i += 1) {
        const { time, elements } = phraseDatas[i] || {};
        if (time !== undefined && elements !== undefined && time < elapsed) {
          elements.forEach((c) => {
            if (c.style["opacity"] !== "1") {
              c.style["opacity"] = "1";
            }
          });
        } else {
          break;
        }
      }
      if (elapsed >= totalDuration) {
        finished = true;
        handleFinished();
      }
    }
  };
  return handleTick;
};
