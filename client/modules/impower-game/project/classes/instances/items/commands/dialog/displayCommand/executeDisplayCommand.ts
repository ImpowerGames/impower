/* eslint-disable no-continue */
import { format } from "../../../../../../../../impower-evaluate";
import {
  DisplayCommandConfig,
  DisplayCommandData,
  DisplayType,
} from "../../../../../../../data";

export const defaultDisplayCommandConfig: DisplayCommandConfig = {
  ui: "impower_ui",
  letterFadeDuration: 0,
  letterDelay: 0.03,
  pauseDelay: 0.15,
  indicatorFadeDuration: 0.15,
  indicatorAnimationName: "bounce",
  indicatorAnimationDuration: 0.5,
  indicatorAnimationEase: "ease",
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

export const displayCommandClassNames = {
  character: "character",
  portrait: "portrait",
  parenthetical: "parenthetical",
  dialogue_area: "dialogue_area",
  dialogue_content: "dialogue_content",
  indicator: "indicator",
  choice: "choice",
  dialogue: "dialogue",
  action: "action",
  centered: "centered",
  transition: "transition",
  scene: "scene",
  assets: "assets",
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
  const choiceEls = getElements(ui, displayCommandClassNames.choice);
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
  totalDelay: number,
  style?: Partial<CSSStyleDeclaration>
): HTMLSpanElement => {
  const textEl = document.createTextNode(part);
  const spanEl = document.createElement("span");
  spanEl.style.opacity = totalDelay > 0 ? "0" : "1";
  spanEl.style.transition =
    totalDelay > 0
      ? `opacity ${letterFadeDuration}s linear ${totalDelay}s`
      : null;
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k] = v;
  });
  spanEl.appendChild(textEl);
  return spanEl;
};

const getAnimatedSpanElements = (
  content: string,
  portraitEl?: HTMLElement,
  valueMap?: Record<string, unknown>,
  config: DisplayCommandConfig = defaultDisplayCommandConfig,
  instant?: boolean,
  debug?: boolean
): [HTMLSpanElement[], HTMLImageElement[], number] => {
  const letterFadeDuration = config?.letterFadeDuration || 0;
  const pauseDelay = config?.pauseDelay || 0;
  const letterDelay = config?.letterDelay || 0;

  const partEls: HTMLSpanElement[] = [];
  const contentEls: HTMLSpanElement[] = [];
  const imageEls: HTMLImageElement[] = [];
  let totalDelay = 0;
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let pauseLength = 0;
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
    if (part === " ") {
      pauseLength += 1;
    } else {
      pauseLength = 0;
    }
    const markers = marks.map((x) => x[0]);
    const isUnderline = markers.includes("_");
    const isBoldAndItalic = markers.includes("***");
    const isBold = markers.includes("**");
    const isItalic = markers.includes("*");
    const isPause = pauseLength > 1;
    const style: Partial<CSSStyleDeclaration> = {
      textDecoration: isUnderline ? "underline" : null,
      fontStyle: isItalic || isBoldAndItalic ? "italic" : null,
      fontWeight: isBold || isBoldAndItalic ? "bold" : null,
      whiteSpace: part === "\n" ? "pre-wrap" : null,
    };
    const span = createCharSpan(part, letterFadeDuration, totalDelay, style);
    partEls[i] = span;
    contentEls.push(span);
    if (pauseLength === 1) {
      pauseSpan = span;
    }
    if (isPause && pauseSpan && debug) {
      pauseSpan.style.backgroundColor = `hsla(0, 100%, 50%, ${
        (pauseLength - 1) / 5
      })`;
    }
    if (pauseLength > 0) {
      if (hideSpace) {
        pauseSpan.textContent = "";
        span.textContent = "";
      }
    } else {
      hideSpace = false;
    }
    if (!instant) {
      totalDelay += isPause ? pauseDelay : letterDelay;
    }
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
  return [contentEls, imageEls, totalDelay];
};

export const executeDisplayCommand = (
  data?: DisplayCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    instant?: boolean;
    debug?: boolean;
  },
  config: DisplayCommandConfig = defaultDisplayCommandConfig
): number => {
  const type = data?.type;
  const character = data?.character;
  const parenthetical = data?.parenthetical;
  const content = data?.content;
  const assets = data?.assets;
  const autoAdvance = data?.autoAdvance;
  const clearPreviousText = data?.clearPreviousText;
  const clearPreviousAssets = data?.clearPreviousAssets;

  const valueMap = context?.valueMap;
  const instant = context?.instant;
  const debug = context?.debug;

  const ui = config?.ui;
  const css = config?.css;
  const indicatorFadeDuration = config?.indicatorFadeDuration || 0;
  const indicatorAnimationName = config?.indicatorAnimationName;
  const indicatorAnimationDuration = config?.indicatorAnimationDuration;
  const indicatorAnimationEase = config?.indicatorAnimationEase;

  setupStyle(ui, css);
  const dialogueAreaEl = getElement(ui, displayCommandClassNames.dialogue_area);
  const dialogueContentEls = getElements(
    ui,
    displayCommandClassNames.dialogue_content
  );
  const portraitEl = getElement(ui, displayCommandClassNames.portrait);
  const indicatorEl = getElement(ui, displayCommandClassNames.indicator);
  const validCharacter = type === DisplayType.Dialogue ? character : "";
  const validParenthetical = type === DisplayType.Dialogue ? parenthetical : "";
  const trimmedContent = content?.trim() === "_" ? "" : content || "";
  const [replaceTagsResult] = format(trimmedContent, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  if (portraitEl) {
    const portraitName = assets?.[0];
    const portraitUrl = valueMap?.[portraitName];
    if (portraitUrl) {
      portraitEl.style.backgroundImage = `url("${portraitUrl}")`;
      portraitEl.style.backgroundRepeat = "no-repeat";
      portraitEl.style.backgroundPosition = "center";
      portraitEl.style.display = null;
    } else if (clearPreviousAssets) {
      portraitEl.style.display = "none";
    }
  }

  const assetsOnly = type === DisplayType.Assets;
  if (assetsOnly) {
    return 0;
  }

  hideChoices();

  if (dialogueAreaEl) {
    dialogueAreaEl.style.display = type === "dialogue" ? null : "none";
  }

  const positions = ["default", "left", "right"];
  const validPosition = data?.position || "default";
  const lastContentEl = dialogueContentEls?.[dialogueContentEls.length - 1];
  const parentEl = lastContentEl?.parentElement;
  for (let i = 0; i < positions.length; i += 1) {
    const el =
      dialogueContentEls?.[i] ||
      parentEl.appendChild(lastContentEl?.cloneNode(true) as HTMLElement);
    el.classList.add(positions[i]);
    el.style.visibility = "hidden";
    el.style.display = "none";
  }

  const characterEl = getElement(
    ui,
    validPosition,
    displayCommandClassNames.character
  );
  const parentheticalEl = getElement(
    ui,
    validPosition,
    displayCommandClassNames.parenthetical
  );
  const contentElEntries: [DisplayType, HTMLElement][] = Object.values(
    DisplayType
  ).map((x) => [
    x,
    x === DisplayType.Dialogue
      ? getElement(ui, validPosition, x)
      : getElement(ui, x),
  ]);
  const [defaultEl, leftEl, rightEl] = dialogueContentEls;
  if (type !== DisplayType.Dialogue) {
    dialogueContentEls.forEach((el) => {
      el.style.display = "none";
    });
  } else if (validPosition === "default") {
    if (defaultEl) {
      defaultEl.style.display = null;
      defaultEl.style.visibility = null;
    }
    if (leftEl) {
      leftEl.style.display = "none";
      leftEl.style.visibility = "hidden";
    }
    if (rightEl) {
      rightEl.style.display = "none";
      rightEl.style.visibility = "hidden";
    }
  } else if (validPosition === "left") {
    if (defaultEl) {
      defaultEl.style.display = "none";
      defaultEl.style.visibility = "hidden";
    }
    if (leftEl) {
      leftEl.style.display = null;
      leftEl.style.visibility = null;
    }
    if (rightEl) {
      rightEl.style.display = null;
      rightEl.style.visibility = "hidden";
    }
  } else if (validPosition === "right") {
    if (defaultEl) {
      defaultEl.style.display = "none";
    }
    if (leftEl) {
      leftEl.style.display = null;
      leftEl.style.visibility = null;
    }
    if (rightEl) {
      rightEl.style.display = null;
      rightEl.style.visibility = null;
    }
  }

  if (characterEl) {
    characterEl.replaceChildren(validCharacter);
    characterEl.style.display = validCharacter ? null : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.replaceChildren(validParenthetical);
    parentheticalEl.style.display = validParenthetical ? null : "none";
  }
  const [spanEls, , totalDelay] = getAnimatedSpanElements(
    evaluatedContent,
    portraitEl,
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
  if (data) {
    window.requestAnimationFrame(() => {
      spanEls.forEach((charEl) => {
        charEl.style.opacity = "1";
      });
      if (indicatorEl) {
        indicatorEl.style.transition = instant
          ? null
          : `opacity ${indicatorFadeDuration}s linear ${totalDelay}s`;
        indicatorEl.style.opacity = "1";
        indicatorEl.style.animation = instant
          ? null
          : `${indicatorAnimationName} ${indicatorAnimationDuration}s ${indicatorAnimationEase} ${totalDelay}s infinite`;
      }
    });
  }

  return totalDelay;
};
