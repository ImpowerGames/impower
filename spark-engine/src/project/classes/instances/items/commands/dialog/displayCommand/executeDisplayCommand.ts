/* eslint-disable no-continue */
import { format } from "../../../../../../../../../spark-evaluate";
import {
  DisplayCommandConfig,
  DisplayCommandData,
  DisplayProperties,
} from "../../../../../../../data";
import {
  convertNoteToHertz,
  IElement,
  Intonation,
  parseTone,
  SparkGame,
  StressType,
  Tone,
  transpose,
} from "../../../../../../../game";
import { CharacterConfig, Prosody } from "./CharacterConfig";

interface Beep extends Tone {
  syllableIndex?: number;
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

const finalStressTypes: StressType[] = [
  "resolvedQuestion",
  "question",
  "lilt",
  "command",
  "exclamation",
  "tentative",
  "anticipation",
  "statement",
];

const defaultIntonation: Intonation = {
  fluctuation: "+1 +1",
  downdrift: "+2 0 -2", // '-_
  italicized: "0 +2 +1", // _'-
  bolded: "0 +1 0", // _-_
  underlined: "0 +1 +1", // _--
  capitalized: "+2 +2 +2", // '''
  resolvedQuestion: "+1 +2 0", // -'_
  question: "+1 +2 +4", // --'
  lilt: "+8 +2 +4", // ''-
  command: "+8 +8 +7", // -'-
  exclamation: "+2 +5 +4", // -'-
  tentative: "+2 +3 +3", //'__
  anticipation: "+1 +2 +1", // -'-
  statement: "+2 +1 0", // '-_
};

// const britishIntonation: Intonation = {
//   fluctuation: "+2 +1",
//   downdrift: "+3 +2 +1", // '-_
//   italicized: "+1 +3 +2", // _'-
//   bolded: "+1 +2 +1", // _-_
//   underlined: "+1 +2 +2", // _--
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

const defaultProsody: Prosody = {
  wordPauseScale: 2,
  phrasePauseScale: 6,
  syllableLength: 3,
  /** You (CANNOT) say that. */
  capitalized: /[^a-z.!?\n]+[A-Z][A-Z]+[^a-z.!?\n]/,
  /** Who's (that)? */
  resolvedQuestion:
    /\b(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b([^\t\n\r ]+)[?][ ]*$/,
  /** Are you (serious)? */
  question: /\b([^\t\n\r ]+)[?]+[ ]*$/,
  /** Oh (wow)~ */
  lilt: /\b([^\t\n\r ~]+)[~]+[ ]*$/,
  /** Stop (that)!! */
  command: /\b([^\t\n\r !]+)[!][!]+[ ]*$/,
  /** That's (incredible)! */
  exclamation: /\b([^\t\n\r !]+)[!][ ]*$/,
  /** Uh (right)... */
  tentative: /\b([^\t\n\r .]+)[.][.]+[ ]*$/,
  /** And (then), */
  anticipation: /\b([^\t\n\r ]+)[,][ ]*$/,
  /** They (left). */
  statement: /\b([^\t\n\r .]+)[.][ ]*$/,
};

const defaultCharacterConfig = {
  tone: "(G4*0.25)(G5*0.25)(D#5*0.125)",
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
      beepDuration: 0.05,
      fadeDuration: 0,
    },
  },
};

const getBendIndex = (progress: number, bendLength: number): number => {
  return Math.floor(progress * (bendLength - 1));
};

const getBend = (
  stressType: StressType | undefined,
  intonation: Intonation | undefined
): number[] => {
  if (stressType) {
    const contour = intonation?.[stressType];
    if (contour) {
      return contour.split(" ").map((x) => Number(x));
    }
  }
  return [];
};

const getStressType = (
  phrase: string,
  prosody: Prosody | undefined
): StressType | undefined => {
  if (prosody) {
    for (let i = 0; i < finalStressTypes.length; i += 1) {
      const stressType = finalStressTypes[i];
      if (
        stressType &&
        new RegExp(prosody?.[stressType] || "", "g").test(phrase)
      ) {
        return stressType;
      }
    }
  }
  return undefined;
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
): [
  IElement[],
  {
    phrase: string;
    time: number;
    elements?: IElement[];
    beeps?: Beep[];
  }[]
] => {
  const letterFadeDuration = get(displayProps?.typing?.fadeDuration, 0);
  const letterDelay = get(displayProps?.typing?.letterDelay, 0);
  const wordPauseScale = get(characterProps?.prosody?.wordPauseScale, 1);
  const phrasePauseScale = get(characterProps?.prosody?.phrasePauseScale, 1);
  const wordPauseDuration = letterDelay * wordPauseScale;
  const phrasePauseDuration = letterDelay * phrasePauseScale;
  const averageSyllableLength = get(characterProps?.prosody?.syllableLength);
  const beepDuration = get(displayProps?.typing?.beepDuration, letterDelay);

  const partEls: IElement[] = [];
  const spanEls: IElement[] = [];
  const chunkEls: {
    phrase: string;
    time: number;
    elements: IElement[];
    beeps?: Beep[];
  }[] = [];
  let wordLength = 0;
  let totalDelay = 0;
  let chunkDelay = 0;
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let spaceLength = 0;
  let pauseLength = 0;
  let unpauseLength = 0;
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
    const isUnderline = markers.includes("_");
    const isBoldAndItalic = markers.includes("***");
    const isBold = markers.includes("**");
    const isItalic = markers.includes("*");
    const style = {
      textDecoration: isUnderline ? "underline" : null,
      fontStyle: isItalic || isBoldAndItalic ? "italic" : null,
      fontWeight: isBold || isBoldAndItalic ? "bold" : null,
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
    if (part === " ") {
      spaceLength += 1;
      wordLength = 0;
    } else {
      spaceLength = 0;
      if (
        part === "\n" ||
        part === "\r" ||
        part === "\t" ||
        part === "-" ||
        part === "." ||
        part === "!" ||
        part === "?" ||
        part === "~"
      ) {
        wordLength = 0;
      } else {
        wordLength += 1;
      }
    }
    const isWordPause = spaceLength === 1;
    const isPhrasePause = spaceLength > 1;
    if (isPhrasePause) {
      pauseLength += 1;
      unpauseLength = 0;
      if (pauseLength === 1) {
        // start pause chunk
        chunkEls.push({ phrase: part, time: totalDelay, elements: [span] });
      } else {
        // continue pause chunk
        const lastChunk = chunkEls[chunkEls.length - 1];
        if (lastChunk) {
          lastChunk.phrase += part;
          lastChunk.elements.push(span);
        }
      }
      chunkDelay = 0;
    } else {
      pauseLength = 0;
      unpauseLength += 1;
      if (unpauseLength === 1) {
        // start letter chunk
        chunkEls.push({ phrase: part, time: totalDelay, elements: [span] });
      } else {
        // continue letter chunk
        const lastChunk = chunkEls[chunkEls.length - 1];
        if (lastChunk) {
          lastChunk.phrase += part;
          lastChunk.elements.push(span);
        }
      }
      chunkDelay += letterDelay;
    }
    spanEls.push(span);
    partEls[i] = span;
    const charIndex = wordLength - 1;
    const shouldBeep =
      charIndex >= 0 && charIndex % averageSyllableLength === 0;
    if (shouldBeep) {
      const currChunk = chunkEls[chunkEls.length - 1];
      if (currChunk) {
        if (!currChunk.beeps) {
          currChunk.beeps = [];
        }
        const beep = {
          time: totalDelay,
          duration: beepDuration,
          syllableIndex: Math.floor(wordLength / averageSyllableLength),
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
      ? phrasePauseDuration
      : isWordPause
      ? wordPauseDuration
      : letterDelay;
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
  return [spanEls, chunkEls];
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
  onFinished?: () => void,
  preview?: boolean
): ((timeMS: number) => void) | undefined => {
  const type = data?.type || "";
  const assets = data?.assets || [];

  const valueMap = context?.valueMap || {};
  const objectMap = context?.objectMap || {};
  const structName = "display";
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
  const [spanEls, chunkEls] = getAnimatedSpanElements(
    game,
    evaluatedContent?.trimStart(),
    valueMap,
    displayConfig?.[type],
    characterConfig,
    instant,
    debug
  );
  const beeps = chunkEls.flatMap((chunk) => {
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
      const modalTone = parseTone(characterConfig?.tone || "");
      const modalNote = modalTone?.waves?.[0]?.note;
      const modalPitch: number =
        !modalNote || typeof modalNote === "number"
          ? Number(modalNote) || 0
          : convertNoteToHertz(modalNote);
      const tones: Tone[] = chunkEls.flatMap((chunk): Tone[] => {
        const chunkBeeps = chunk.beeps;
        if (!chunkBeeps) {
          return [];
        }

        const downdriftBeeps: Tone[] = [];
        const lastWordBeeps: Tone[] = [];
        let isLastWord = true;
        for (let i = chunkBeeps.length - 1; i >= 0; i -= 1) {
          const beep: Beep | undefined = chunkBeeps[i];
          if (beep) {
            if (isLastWord) {
              lastWordBeeps.unshift(beep);
            } else {
              downdriftBeeps.unshift(beep);
            }
          }
          if (beep?.syllableIndex === 0) {
            isLastWord = false;
          }
        }

        chunkBeeps.forEach((b: Beep) => {
          b.waves = [...(modalTone?.waves || [])];
          b.waves[0] = { ...(b.waves[0] || {}), note: modalPitch };
        });

        const fluctuationBend = getBend(
          "fluctuation",
          characterConfig.intonation
        );
        const downdriftBend = getBend("downdrift", characterConfig.intonation);
        let direction = -1;
        downdriftBeeps.forEach((b, i) => {
          direction *= -1;
          const progress = i / (downdriftBeeps.length - 1);
          const bendIndex = getBendIndex(progress, downdriftBend.length);
          const fluctuationIndex = getBendIndex(
            progress,
            fluctuationBend.length
          );
          const semitones = downdriftBend[bendIndex] || 0;
          const fluctuation =
            direction * Math.abs(fluctuationBend[fluctuationIndex] || 0);
          // Pitch drifts down over phrase
          const downdriftPitch = transpose(modalPitch, semitones);
          // Pitch alternately rises and falls for each syllable
          // (iambic pentameter = te TUM te TUM te TUM)
          const fluctuatedPitch = transpose(downdriftPitch, fluctuation);
          if (b.waves?.[0]?.note) {
            b.waves[0].note = fluctuatedPitch;
          }
        });

        // TODO: Interpolate between pitch changes
        const finalStressType = getStressType(
          chunk.phrase,
          characterConfig.prosody
        );
        const finalStressBend = getBend(
          finalStressType,
          characterConfig.intonation
        );
        if (lastWordBeeps.length === 1) {
          const firstSyllableBeep = lastWordBeeps[0];
          if (firstSyllableBeep) {
            // Bend syllable
            // TODO: Apply when bend filling tone array
            firstSyllableBeep.bend = finalStressBend;
            // Double syllable duration
            firstSyllableBeep.duration = (firstSyllableBeep.duration || 0) * 2;
          }
        } else {
          lastWordBeeps.forEach((b, i) => {
            const progress = i / (lastWordBeeps.length - 1);
            const bendIndex = getBendIndex(progress, finalStressBend.length);
            const semitones = finalStressBend[bendIndex] || 0;
            if (b.waves?.[0]?.note) {
              b.waves[0].note = transpose(modalPitch, semitones);
            }
          });
        }

        return chunkBeeps as Tone[];
      });
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
      for (let i = 0; i < chunkEls.length; i += 1) {
        const { time, elements } = chunkEls[i] || {};
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
