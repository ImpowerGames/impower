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
  letterDelay: 0.02,
  pauseDelay: 0.3,
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
  dialogue_group: "dialogue_group",
  indicator: "indicator",
  choice: "choice",
  dialogue: "dialogue",
  action: "action",
  centered: "centered",
  transition: "transition",
  scene: "scene",
  assets: "assets",
};

export const displayCommandRegexes = {
  spaceAfterSplitter: /([ ](?![-]))/g,
};

export const displayCommandDebugColors = {
  punctuation: "yellow",
  spaceAfter: "orange",
  ellipsis: "red",
};

const getElementSelector = (ui: string, className: string): string =>
  `#${ui} .${className}`;

const getElement = <T extends HTMLElement>(ui: string, className: string): T =>
  document.querySelector<T>(getElementSelector(ui, className));

const getElements = <T extends HTMLElement>(
  ui: string,
  className: string
): NodeListOf<T> =>
  document.querySelectorAll<T>(getElementSelector(ui, className));

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
  config: DisplayCommandConfig = defaultDisplayCommandConfig,
  instant?: boolean,
  debug?: boolean
): [HTMLSpanElement[], number] => {
  const letterFadeDuration = config?.letterFadeDuration || 0;
  const pauseDelay = config?.pauseDelay || 0;
  const letterDelay = config?.letterDelay || 0;
  const partEls: HTMLSpanElement[][] = [];
  const contentEls: HTMLSpanElement[] = [];
  let totalDelay = 0;
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let pauseLength = 0;
  let pauseSpan: HTMLSpanElement;
  for (let i = 0; i < splitContent.length; ) {
    const part = splitContent[i];
    const lastMark = marks[marks.length - 1]?.[0];
    if (splitContent.slice(i, i + 3).join("") === "***") {
      if (lastMark === "***") {
        marks.pop();
      } else {
        marks.push(["***", i]);
      }
      i += 3;
      continue;
    }
    if (splitContent.slice(i, i + 2).join("") === "**") {
      if (lastMark === "**") {
        marks.pop();
      } else {
        marks.push(["**", i]);
      }
      i += 2;
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
    };
    const span = createCharSpan(part, letterFadeDuration, totalDelay, style);
    partEls[i] = [span];
    contentEls.push(span);
    if (pauseLength === 1) {
      pauseSpan = span;
    }
    if (isPause && pauseSpan && debug) {
      pauseSpan.style.backgroundColor = `hsla(0, 100%, 50%, ${
        (pauseLength - 1) / 5
      })`;
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
      const invalidStyleEls = partEls.slice(lastMarkIndex).flatMap((x) => x);
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
  return [contentEls, totalDelay];
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
  const dialogueGroupEl = getElement(
    ui,
    displayCommandClassNames.dialogue_group
  );
  const characterEl = getElement(ui, displayCommandClassNames.character);
  const portraitEl = getElement(ui, displayCommandClassNames.portrait);
  const parentheticalEl = getElement(
    ui,
    displayCommandClassNames.parenthetical
  );
  const indicatorEl = getElement(ui, displayCommandClassNames.indicator);
  const contentElEntries: [DisplayType, HTMLElement][] = Object.values(
    DisplayType
  ).map((x) => [x, getElement(ui, x)]);
  const character = data?.type === DisplayType.Dialogue ? data?.character : "";
  const assets = data?.assets;
  const parenthetical =
    data?.type === DisplayType.Dialogue ? data?.parenthetical : "";
  const content =
    data?.content?.trim() === "_"
      ? ""
      : (data?.content || "")
          .replace(/(?:\[{2}(?!\[+))([\s\S]+?)(?:\]{2}(?!\[+)) ?/g, "") // Replace [[image]]
          .replace(/(?:\({2}(?!\(+))([\s\S]+?)(?:\){2}(?!\(+)) ?/g, ""); // Replace ((audio))
  const [replaceTagsResult] = format(content, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  if (portraitEl) {
    const portraitName = assets?.[0];
    const portraitUrl = valueMap?.[portraitName];
    if (portraitUrl) {
      portraitEl.style.backgroundImage = `url("${portraitUrl}")`;
      portraitEl.style.backgroundRepeat = "no-repeat";
      portraitEl.style.backgroundPosition = "center";
      portraitEl.style.display = null;
    } else {
      portraitEl.style.display = "none";
    }
  }

  const assetsOnly = data?.type === DisplayType.Assets;
  if (assetsOnly) {
    return 0;
  }

  hideChoices();

  if (dialogueGroupEl) {
    dialogueGroupEl.style.display = data?.type === "dialogue" ? null : "none";
  }
  if (characterEl) {
    characterEl.replaceChildren(character);
    characterEl.style.display = character ? null : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.replaceChildren(parenthetical);
    parentheticalEl.style.display = parenthetical ? null : "none";
  }
  const [partEls, totalDelay] = getAnimatedSpanElements(
    evaluatedContent,
    config,
    instant,
    debug
  );
  contentElEntries.forEach(([type, el]) => {
    if (el) {
      if (type === data?.type) {
        el.replaceChildren(...partEls);
        el.style.display = null;
      } else {
        el.replaceChildren("");
        el.style.display = "none";
      }
    }
  });
  if (indicatorEl) {
    if (data) {
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
      partEls.forEach((charEl) => {
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
