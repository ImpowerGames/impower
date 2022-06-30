/* eslint-disable no-continue */
import { SynthOptions } from "tone";
import { RecursivePartial } from "../../../../../../../../impower-core";
import { format } from "../../../../../../../../impower-evaluate";
import {
  DisplayCommandConfig,
  DisplayCommandData,
  DisplayType,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";

const dialoguePitches: [string, number][] = [
  ["D#5", 0.5],
  ["D#6", 0.5],
  ["B5", 0.25],
];

export const dialogueInstrumentOptions: RecursivePartial<SynthOptions> = {
  detune: 0,
  portamento: 0,
  volume: 0,
  envelope: {
    attack: 0.0025,
    attackCurve: "cosine",
    decay: 0,
    decayCurve: "linear",
    release: 0.0025,
    releaseCurve: "cosine",
    sustain: 1,
  },
  oscillator: {
    partialCount: 0,
    phase: 0,
    type: "triangle",
  },
};

export const defaultDisplayCommandConfig: DisplayCommandConfig = {
  ui: {
    root: "impower_ui",
    character: "character",
    background: "background",
    portrait: "portrait",
    parenthetical: "parenthetical",
    dialogue_group: "dialogue_group",
    indicator: "indicator",
    choice: "choice",
    dialogue: "dialogue",
    action: "action",
    centered: "centered",
    transition: "transition",
    scene: "scene",
  },
  hidden: {
    character: undefined,
    parenthetical: "beat",
  },
  typing: {
    fadeDuration: 0,
    delay: 0.025,
    pauseScale: 6,
    beepDuration: 0.03,
    syllableLength: 3,
  },
  indicator: {
    fadeDuration: 0.15,
    animationName: "bounce",
    animationDuration: 0.5,
    animationEase: "ease",
  },
  css: `
  @keyframes bounce {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(4px);
    }
  }
  `,
};

const getElementSelector = (ui: string, ...classNames: string[]): string =>
  `#${ui} .${classNames.join(" .")}`;

const getElement = <T extends HTMLElement>(
  ui: string,
  ...classNames: string[]
): T => document.querySelector<T>(getElementSelector(ui, ...classNames));

const getElements = <T extends HTMLElement>(
  ui: string,
  ...classNames: string[]
): T[] =>
  Array.from(
    document.querySelectorAll<T>(getElementSelector(ui, ...classNames))
  );

const getStyleId = (ui: string): string => `${ui}-style`;

const setupStyle = (ui: string, css: string): HTMLStyleElement => {
  const styleId = getStyleId(ui);
  const styleEl =
    (document.getElementById(styleId) as HTMLStyleElement) ||
    document.createElement("style");
  styleEl.id = styleId;
  styleEl.textContent = css;
  document.body.appendChild(styleEl);
  return styleEl;
};

const hideChoices = (
  config: DisplayCommandConfig = defaultDisplayCommandConfig
): void => {
  const ui = config?.ui;
  const choiceEls = getElements(ui?.root, ui?.choice);
  choiceEls.forEach((el) => {
    if (el) {
      el.replaceChildren("");
      el.style.display = "none";
    }
  });
};

const createCharSpan = (
  part: string,
  letterFadeDuration: number,
  instant: boolean,
  totalDelay: number,
  style?: Partial<CSSStyleDeclaration>
): HTMLSpanElement => {
  const textEl = document.createTextNode(part);
  const spanEl = document.createElement("span");
  spanEl.style.opacity = instant ? "1" : "0";
  spanEl.style.transition = instant
    ? null
    : `opacity ${letterFadeDuration}s linear ${totalDelay}s`;
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k] = v;
  });
  spanEl.appendChild(textEl);
  return spanEl;
};

const getAnimatedSpanElements = (
  content: string,
  valueMap?: Record<string, unknown>,
  config: DisplayCommandConfig = defaultDisplayCommandConfig,
  instant?: boolean,
  debug?: boolean
): [HTMLSpanElement[], [number, HTMLSpanElement[]][], [number, number][]] => {
  const letterFadeDuration = config?.typing?.fadeDuration || 0;
  const letterDelay = config?.typing?.delay || 0;
  const pauseScale =
    config?.typing?.pauseScale != null ? config?.typing?.pauseScale : 1;
  const pauseDelay = letterDelay * pauseScale;
  const averageSyllableLength = config?.typing?.syllableLength;
  const beepDuration =
    config?.typing?.beepDuration != null
      ? config?.typing?.beepDuration
      : letterDelay;

  const partEls: HTMLSpanElement[] = [];
  const spanEls: HTMLSpanElement[] = [];
  const chunkEls: [number, HTMLSpanElement[]][] = [];
  const beeps: [number, number][] = [];
  let prevBeep: [number, number];
  let wordLength = 0;
  let syllableLength = 0;
  let totalDelay = 0;
  let chunkDelay = 0;
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let spaceLength = 0;
  let pauseLength = 0;
  let unpauseLength = 0;
  let pauseSpan: HTMLSpanElement;
  const imageUrls = new Set<string>();
  const audioUrls = new Set<string>();
  let hideSpace = false;
  for (let i = 0; i < splitContent.length; ) {
    const part = splitContent[i];
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
    const style: Partial<CSSStyleDeclaration> = {
      textDecoration: isUnderline ? "underline" : null,
      fontStyle: isItalic || isBoldAndItalic ? "italic" : null,
      fontWeight: isBold || isBoldAndItalic ? "bold" : null,
      whiteSpace: part === "\n" ? "pre-wrap" : null,
    };
    const span = createCharSpan(
      part,
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
      wordLength += 1;
    }
    const isPause = spaceLength > 1;
    if (isPause) {
      pauseLength += 1;
      unpauseLength = 0;
      if (pauseLength === 1) {
        // start pause chunk
        chunkEls.push([totalDelay, [span]]);
      } else {
        // continue pause chunk
        chunkEls[chunkEls.length - 1][1].push(span);
      }
      chunkDelay = 0;
    } else {
      pauseLength = 0;
      unpauseLength += 1;
      if (unpauseLength === 1) {
        // start letter chunk
        chunkEls.push([totalDelay, [span]]);
      } else {
        // continue letter chunk
        chunkEls[chunkEls.length - 1][1].push(span);
      }
      chunkDelay += letterDelay;
    }
    spanEls.push(span);
    partEls[i] = span;
    const charIndex = wordLength - 1;
    const shouldBeep = part !== "-" && charIndex % averageSyllableLength === 0;
    if (prevBeep && syllableLength > 0) {
      prevBeep[1] = syllableLength + 1;
    }
    if (charIndex < 0) {
      // whitespace
      syllableLength = 0;
      beeps.push([totalDelay, null]);
    } else if (shouldBeep) {
      const beep: [number, number] = [totalDelay, 1];
      syllableLength = 0;
      beeps.push(beep);
      prevBeep = beep;
      if (debug) {
        span.style.backgroundColor = `hsl(185, 100%, 50%)`;
      }
    } else {
      beeps.push([totalDelay, null]);
      syllableLength += 1;
    }
    if (spaceLength === 1) {
      pauseSpan = span;
    }
    if (isPause && pauseSpan && debug) {
      pauseSpan.style.backgroundColor = `hsla(0, 100%, 50%, ${
        (spaceLength - 1) / 5
      })`;
    }
    if (spaceLength > 0) {
      if (hideSpace) {
        pauseSpan.textContent = "";
        span.textContent = "";
      }
    } else {
      hideSpace = false;
    }
    totalDelay += isPause ? pauseDelay : letterDelay;
    i += 1;
  }
  // Invalidate any leftover open markers
  if (marks.length > 0) {
    while (marks.length > 0) {
      const [lastMark, lastMarkIndex] = marks[marks.length - 1];
      const invalidStyleEls = partEls.slice(lastMarkIndex).map((x) => x);
      invalidStyleEls.forEach((e) => {
        if (lastMark === "***") {
          e.style.fontWeight = null;
          e.style.fontStyle = null;
        }
        if (lastMark === "**") {
          e.style.fontWeight = null;
        }
        if (lastMark === "*") {
          e.style.fontStyle = null;
        }
        if (lastMark === "_") {
          e.style.textDecoration = null;
        }
      });
      marks.pop();
    }
  }
  const validBeeps: [number, number][] = beeps.map(([time, duration]) => {
    if (!duration) {
      return [time, duration];
    }
    return [time, beepDuration];
  });
  return [spanEls, chunkEls, validBeeps];
};

const isHidden = (content, hiddenRegex): boolean => {
  if (!hiddenRegex) {
    return false;
  }
  return new RegExp(`^${hiddenRegex}$`).test(content);
};

export const executeDisplayCommand = (
  data?: DisplayCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    instant?: boolean;
    debug?: boolean;
  },
  game?: ImpowerGame,
  config: DisplayCommandConfig = defaultDisplayCommandConfig,
  onFinished?: () => void
): void => {
  const id = data?.reference?.refId;
  const type = data?.type;
  const assets = data?.assets;

  const valueMap = context?.valueMap;

  const ui = config?.ui;
  const css = config?.css;
  const hidden = config?.hidden;

  const backgroundEl = getElement(ui?.root, ui?.background);

  setupStyle(ui?.root, css);

  const assetsOnly = type === DisplayType.Assets;

  if (assetsOnly) {
    if (backgroundEl) {
      const imageName = assets?.[0];
      const imageUrl = valueMap?.[imageName];
      if (imageName && imageUrl) {
        backgroundEl.style.backgroundImage = `url("${imageUrl}")`;
        backgroundEl.style.backgroundRepeat = "no-repeat";
        backgroundEl.style.backgroundPosition = "center";
        backgroundEl.style.display = null;
      } else {
        backgroundEl.style.display = "none";
      }
    }
    return;
  }

  const character = data?.character;
  const parenthetical = data?.parenthetical;
  const content = data?.content;
  const autoAdvance = data?.autoAdvance;
  const clearPreviousText = data?.clearPreviousText;

  const instant = context?.instant;
  const debug = context?.debug;
  const indicatorFadeDuration = config?.indicator?.fadeDuration || 0;
  const indicatorAnimationName = config?.indicator?.animationName;
  const indicatorAnimationDuration = config?.indicator?.animationDuration;
  const indicatorAnimationEase = config?.indicator?.animationEase;

  const dialogueAreaEl = getElement(ui?.root, ui?.dialogue_group);
  const portraitEl = getElement(ui?.root, ui?.portrait);
  const indicatorEl = getElement(ui?.root, ui?.indicator);
  const validCharacter =
    type === DisplayType.Dialogue && !isHidden(character, hidden?.character)
      ? character
      : "";
  const validParenthetical =
    type === DisplayType.Dialogue &&
    !isHidden(parenthetical, hidden?.parenthetical)
      ? parenthetical
      : "";
  const trimmedContent = content?.trim() === "_" ? "" : content || "";
  const [replaceTagsResult] = format(trimmedContent, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);

  if (portraitEl) {
    const imageName = assets?.[0];
    const imageUrl = valueMap?.[imageName];
    if (imageName && imageUrl) {
      portraitEl.style.backgroundImage = `url("${imageUrl}")`;
      portraitEl.style.backgroundRepeat = "no-repeat";
      portraitEl.style.backgroundPosition = "center";
      portraitEl.style.display = null;
    } else {
      portraitEl.style.display = "none";
    }
  }

  hideChoices();

  if (dialogueAreaEl) {
    dialogueAreaEl.style.display = type === "dialogue" ? null : "none";
  }

  const characterEl = getElement(ui?.root, ui?.character);
  const parentheticalEl = getElement(ui?.root, ui?.parenthetical);
  const contentElEntries: [DisplayType, HTMLElement][] = [
    [DisplayType.Dialogue, getElement(ui?.root, ui?.dialogue)],
    [DisplayType.Action, getElement(ui?.root, ui?.action)],
    [DisplayType.Centered, getElement(ui?.root, ui?.centered)],
    [DisplayType.Scene, getElement(ui?.root, ui?.scene)],
    [DisplayType.Transition, getElement(ui?.root, ui?.transition)],
  ];

  if (characterEl) {
    characterEl.replaceChildren(validCharacter);
    characterEl.style.display = validCharacter ? null : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.replaceChildren(`(${validParenthetical})`);
    parentheticalEl.style.display = validParenthetical ? null : "none";
  }
  const [spanEls, chunkEls, beeps] = getAnimatedSpanElements(
    evaluatedContent,
    valueMap,
    config,
    instant,
    debug
  );
  contentElEntries.forEach(([t, el]) => {
    if (el) {
      if (t === type) {
        if (clearPreviousText) {
          el.replaceChildren(...spanEls);
        } else {
          spanEls.forEach((p) => el.appendChild(p));
        }
        el.style.display = null;
      } else {
        el.replaceChildren("");
        el.style.display = "none";
      }
    }
  });
  if (indicatorEl) {
    if (data && !autoAdvance) {
      indicatorEl.style.transition = null;
      indicatorEl.style.animation = null;
      indicatorEl.style.opacity = instant ? "1" : "0";
      indicatorEl.style.display = null;
    } else {
      indicatorEl.style.display = "none";
    }
  }
  const handleFinished = (): void => {
    for (let i = 0; i < spanEls.length; i += 1) {
      const spanEl = spanEls[i];
      if (spanEl && spanEl.style.opacity !== "1") {
        spanEl.style.opacity = "1";
      }
    }
    if (indicatorEl) {
      indicatorEl.style.transition = `opacity ${indicatorFadeDuration}s linear`;
      indicatorEl.style.opacity = "1";
      indicatorEl.style.animation = `${indicatorAnimationName} ${indicatorAnimationDuration}s ${indicatorAnimationEase} infinite`;
    }
    onFinished?.();
  };
  if (game) {
    if (instant) {
      game.audio.stopNotes();
      handleFinished();
    } else {
      const handleDraw = (time: number): void => {
        for (let i = 0; i < chunkEls.length; i += 1) {
          const [chunkTime, chunk] = chunkEls[i];
          if (chunkTime < time) {
            chunk.forEach((c) => {
              if (c.style.opacity !== "1") {
                c.style.opacity = "1";
              }
            });
          } else {
            break;
          }
        }
      };
      const notes: {
        time: number;
        note: string[];
        duration: number[];
        velocity?: number[];
        offset?: number[];
      }[] = beeps.map(([time, duration]) => {
        if (!duration) {
          return {
            time,
            note: null,
            duration: null,
            velocity: null,
            offset: null,
          };
        }
        const noteDuration = duration / dialoguePitches.length;
        return {
          time,
          note: dialoguePitches.map(([p]) => p),
          duration: dialoguePitches.map(() => noteDuration),
          velocity: dialoguePitches.map(([, v]) => v),
          offset: dialoguePitches.map((p, index) => noteDuration * index),
        };
      });
      const instrumentId = data.reference.refTypeId;
      game.audio.configureInstrument({
        instrumentId,
        instrumentType: "default",
        options: dialogueInstrumentOptions,
      });
      game.audio.playNotes({
        instrumentId,
        instrumentType: "default",
        partId: id,
        notes,
        onDraw: handleDraw,
        onFinished: handleFinished,
      });
    }
  }
  if (data) {
    if (indicatorEl && (!game || instant)) {
      window.requestAnimationFrame(() => {
        indicatorEl.style.transition = null;
        indicatorEl.style.opacity = "1";
        indicatorEl.style.animation = null;
      });
    }
  }
};
