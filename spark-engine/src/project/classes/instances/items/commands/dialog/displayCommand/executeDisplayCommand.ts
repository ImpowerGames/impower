/* eslint-disable no-continue */
import { format } from "../../../../../../../../../spark-evaluate";
import {
  DisplayCommandConfig,
  DisplayCommandData,
  DisplayType,
} from "../../../../../../../data";
import {
  getElement,
  getElements,
  getUIElementId,
  loadStyles,
  loadUI,
} from "../../../../../../../dom";
import { SparkGame } from "../../../../../../../game";

const dialoguePitch = "D#6";

export const defaultDisplayCommandConfig: DisplayCommandConfig = {
  root: {
    id: "Display",
    typing: {
      delay: 0,
      pauseScale: 0,
      beepDuration: 0,
      syllableLength: 0,
    },
    indicator: {
      id: "Indicator",
      fadeDuration: 0.15,
      animationName: "bounce",
      animationDuration: 0.5,
      animationEase: "ease",
    },
  },
  background: { id: "Background" },
  portrait: { id: "Portrait" },
  choice: { id: "Choice" },
  action: {
    id: "Action",
  },
  centered: { id: "Centered" },
  transition: { id: "Transition" },
  scene: { id: "Scene" },
  description_group: { id: "DescriptionGroup" },
  dialogue_group: { id: "DialogueGroup" },
  character: { id: "Character" },
  parenthetical: { id: "Parenthetical", hidden: "beat" },
  dialogue: {
    id: "Dialogue",
    typing: {
      fadeDuration: 0,
      delay: 0.025,
      pauseScale: 6,
      beepDuration: 0.05,
      syllableLength: 3,
    },
  },
};

const hideChoices = (ui: string, config: DisplayCommandConfig): void => {
  const choiceEls = getElements(ui, config?.choice?.id || "");
  choiceEls.forEach((el) => {
    if (el) {
      el.innerHTML = "";
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
    ? "none"
    : `opacity ${letterFadeDuration}s linear ${totalDelay}s`;
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k as "all"] = v as string;
  });
  spanEl.appendChild(textEl);
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
  type: string,
  content: string,
  valueMap: Record<string, unknown>,
  config: DisplayCommandConfig,
  instant = false,
  debug?: boolean
): [
  HTMLSpanElement[],
  [number, HTMLSpanElement[]][],
  [number, number | null][]
] => {
  const letterFadeDuration = get(
    config[type]?.typing?.fadeDuration,
    config?.root?.typing?.fadeDuration,
    0
  );
  const letterDelay = get(
    config[type]?.typing?.delay,
    config?.root?.typing?.delay,
    0
  );
  const pauseScale = get(
    config[type]?.typing?.pauseScale,
    config?.root?.typing?.pauseScale,
    1
  );
  const pauseDelay = letterDelay * pauseScale;
  const averageSyllableLength = get(
    config[type]?.typing?.syllableLength,
    config?.root?.typing?.syllableLength
  );
  const beepDuration = get(
    config[type]?.typing?.beepDuration,
    config?.root?.typing?.beepDuration,
    letterDelay
  );

  const partEls: HTMLSpanElement[] = [];
  const spanEls: HTMLSpanElement[] = [];
  const chunkEls: [number, HTMLSpanElement[]][] = [];
  const beeps: [number, number | null][] = [];
  let prevBeep: [number, number] | undefined = undefined;
  let wordLength = 0;
  let syllableLength = 0;
  let totalDelay = 0;
  let chunkDelay = 0;
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let spaceLength = 0;
  let pauseLength = 0;
  let unpauseLength = 0;
  let pauseSpan: HTMLSpanElement | undefined = undefined;
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
      textDecoration: isUnderline ? "underline" : (null as unknown as string),
      fontStyle:
        isItalic || isBoldAndItalic ? "italic" : (null as unknown as string),
      fontWeight:
        isBold || isBoldAndItalic ? "bold" : (null as unknown as string),
      whiteSpace: part === "\n" ? "pre-wrap" : (null as unknown as string),
    };
    const span = createCharSpan(
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
        chunkEls[chunkEls.length - 1]?.[1].push(span);
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
        chunkEls[chunkEls.length - 1]?.[1].push(span);
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
        if (pauseSpan) {
          pauseSpan.textContent = "";
        }
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
      const [lastMark, lastMarkIndex] = marks[marks.length - 1] || [];
      const invalidStyleEls = partEls.slice(lastMarkIndex).map((x) => x);
      invalidStyleEls.forEach((e) => {
        if (lastMark === "***") {
          e.style.fontWeight = null as unknown as string;
          e.style.fontStyle = null as unknown as string;
        }
        if (lastMark === "**") {
          e.style.fontWeight = null as unknown as string;
        }
        if (lastMark === "*") {
          e.style.fontStyle = null as unknown as string;
        }
        if (lastMark === "_") {
          e.style.textDecoration = null as unknown as string;
        }
      });
      marks.pop();
    }
  }
  const validBeeps: [number, number | null][] = beeps.map(
    ([time, duration]) => {
      if (!duration) {
        return [time, duration];
      }
      return [time, beepDuration];
    }
  );
  return [spanEls, chunkEls, validBeeps];
};

const isHidden = (content: string, hiddenRegex?: string): boolean => {
  if (!hiddenRegex) {
    return false;
  }
  return new RegExp(`^[(]${hiddenRegex}[)]$`).test(content);
};

export const executeDisplayCommand = (
  data?: DisplayCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    objectMap: Record<string, Record<string, unknown>>;
    instant?: boolean;
    debug?: boolean;
  },
  game?: SparkGame,
  onFinished?: () => void
): void => {
  const ui = getUIElementId();
  const id = data?.reference?.refId || "";
  const type = data?.type || "";
  const assets = data?.assets || [];

  const valueMap = context?.valueMap || {};
  const config =
    (context?.objectMap?.["DisplayCommand"] as DisplayCommandConfig) ||
    defaultDisplayCommandConfig;
  const objectMap = context?.objectMap || {};

  loadStyles(objectMap, ...Object.keys(objectMap?.["style"] || {}));
  loadUI(objectMap, "Display");

  const assetsOnly = type === "assets";
  if (assetsOnly) {
    const backgroundEl = getElement(
      ui,
      config?.root?.id,
      config?.background?.id
    );
    if (backgroundEl) {
      const imageName = assets?.[0] || "";
      const imageUrl = valueMap?.[imageName];
      if (imageName && imageUrl) {
        backgroundEl.style.backgroundImage = `url("${imageUrl}")`;
        backgroundEl.style.backgroundRepeat = "no-repeat";
        backgroundEl.style.display = null as unknown as string;
      } else {
        backgroundEl.style.display = "none";
      }
    }
    return;
  }

  const character = data?.character || "";
  const parenthetical = data?.parenthetical || "";
  const content = data?.content;
  const autoAdvance = data?.autoAdvance;
  const clearPreviousText = data?.clearPreviousText;

  const instant =
    context?.instant ||
    !get(config?.[type || ""]?.typing?.delay, config?.root?.typing?.delay);
  const debug = context?.debug;
  const indicatorFadeDuration = config?.root?.indicator?.fadeDuration || 0;
  const indicatorAnimationName = config?.root?.indicator?.animationName;
  const indicatorAnimationDuration = config?.root?.indicator?.animationDuration;
  const indicatorAnimationEase = config?.root?.indicator?.animationEase;

  const descriptionGroupEl = getElement(
    ui,
    config?.root?.id,
    config?.description_group?.id
  );
  const dialogueGroupEl = getElement(
    ui,
    config?.root?.id,
    config?.dialogue_group?.id
  );
  const portraitEl = getElement(ui, config?.root?.id, config?.portrait?.id);
  const indicatorEl = getElement(
    ui,
    config?.root?.id,
    config?.root?.indicator?.id || ""
  );
  const validCharacter =
    type === "dialogue" && !isHidden(character, config?.character?.hidden)
      ? character || ""
      : "";
  const validParenthetical =
    type === "dialogue" &&
    !isHidden(parenthetical, config?.parenthetical?.hidden)
      ? parenthetical || ""
      : "";
  const trimmedContent = content?.trim() === "_" ? "" : content || "";
  const [replaceTagsResult] = format(trimmedContent, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);

  if (portraitEl) {
    const imageName = assets?.[0] || "";
    const imageUrl = valueMap?.[imageName];
    if (imageName && imageUrl) {
      portraitEl.style.backgroundImage = `url("${imageUrl}")`;
      portraitEl.style.backgroundRepeat = "no-repeat";
      portraitEl.style.backgroundPosition = "center";
      portraitEl.style.display = null as unknown as string;
    } else {
      portraitEl.style.display = "none";
    }
  }

  hideChoices(ui, config);

  if (dialogueGroupEl) {
    dialogueGroupEl.style.display =
      type === "dialogue" ? (null as unknown as string) : "none";
  }
  if (descriptionGroupEl) {
    descriptionGroupEl.style.display =
      type !== "dialogue" ? (null as unknown as string) : "none";
  }

  const characterEl = getElement(
    ui,
    config?.root?.id,
    config?.character?.id || ""
  );
  const parentheticalEl = getElement(
    ui,
    config?.root?.id,
    config?.parenthetical?.id || ""
  );
  const contentElEntries: [DisplayType, HTMLElement | null][] = [
    ["dialogue", getElement(ui, config?.root?.id, config?.dialogue?.id || "")],
    ["action", getElement(ui, config?.root?.id, config?.action?.id || "")],
    ["centered", getElement(ui, config?.root?.id, config?.centered?.id || "")],
    ["scene", getElement(ui, config?.root?.id, config?.scene?.id || "")],
    [
      "transition",
      getElement(ui, config?.root?.id, config?.transition?.id || ""),
    ],
  ];

  if (characterEl) {
    characterEl.innerHTML = validCharacter;
    characterEl.style.display = validCharacter
      ? (null as unknown as string)
      : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.innerHTML = validParenthetical;
    parentheticalEl.style.display = validParenthetical
      ? (null as unknown as string)
      : "none";
  }
  const [spanEls, chunkEls, beeps] = getAnimatedSpanElements(
    type,
    evaluatedContent?.trimStart(),
    valueMap,
    config,
    instant,
    debug
  );
  contentElEntries.forEach(([t, el]) => {
    if (el) {
      if (t === type) {
        if (clearPreviousText) {
          el.innerHTML = "";
          el.append(...spanEls);
        } else {
          spanEls.forEach((p) => el.appendChild(p));
        }
        el.style.display = null as unknown as string;
      } else {
        el.innerHTML = "";
        el.style.display = "none";
      }
    }
  });
  if (indicatorEl) {
    if (data && !autoAdvance) {
      indicatorEl.style.transition = null as unknown as string;
      indicatorEl.style.animation = null as unknown as string;
      indicatorEl.style.opacity = instant ? "1" : "0";
      indicatorEl.style.display = null as unknown as string;
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
  const instrumentId = data?.reference?.refTypeId || "";
  if (game) {
    if (instant) {
      game.synth.stopInstrument(instrumentId);
      handleFinished();
    } else {
      const tones: {
        pitch?: string;
        offset?: number;
        duration?: number;
      }[] = beeps.map(([offset, duration]) => {
        if (!duration) {
          return {
            offset,
          };
        }
        return {
          pitch: dialoguePitch,
          offset,
          duration,
        };
      });
      game.synth.configureInstrument(instrumentId, { volume: 0.5 });
      game.synth.playInstrument(instrumentId, id, tones);
      let startTime: number | undefined;
      let finished = false;
      const handleTick = (timeMS: number): void => {
        if (!finished) {
          const time = timeMS / 1000;
          if (startTime === undefined) {
            startTime = time;
          }
          const endTime =
            startTime +
            Math.max(...tones.map((t) => (t.offset || 0) + (t.duration || 0)));
          const elapsed = time - startTime;
          if (elapsed >= endTime) {
            finished = true;
            game.ticker.remove(type);
            handleFinished();
          }
          for (let i = 0; i < chunkEls.length; i += 1) {
            const [chunkTime, chunk] = chunkEls[i] || [];
            if (
              chunkTime !== undefined &&
              chunk !== undefined &&
              chunkTime < elapsed
            ) {
              chunk.forEach((c) => {
                if (c.style.opacity !== "1") {
                  c.style.opacity = "1";
                }
              });
            } else {
              break;
            }
          }
        }
      };
      game.ticker.add(type, handleTick);
    }
  }
  if (data) {
    if (indicatorEl && (!game || instant)) {
      window.requestAnimationFrame(() => {
        indicatorEl.style.transition = null as unknown as string;
        indicatorEl.style.opacity = "1";
        indicatorEl.style.animation = null as unknown as string;
      });
    }
  }
};
