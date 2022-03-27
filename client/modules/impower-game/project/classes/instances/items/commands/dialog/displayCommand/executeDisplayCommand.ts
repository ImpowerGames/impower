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
  punctuationDelay: 0.2,
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

const regexes = {
  ellipsis: /[.][.][.]+(?:$|[ ]+)/,
  endPunctuation: /[.!?]+[ ][ ]+/,
  midPunctuation: /[:;,]+[ ]+/,
  longPause: /[ ]+[-][-]+[ ]+/,
  shortPause: /[-][-]+[ ]+/,
};
const punctuationRegexes = [
  regexes?.ellipsis.source,
  regexes?.endPunctuation.source,
  regexes?.midPunctuation.source,
  regexes?.longPause.source,
  regexes?.shortPause.source,
];
export const displayCommandRegexes = {
  punctuation: new RegExp(`(${punctuationRegexes.join("|")})`, "g"),
  ellipsisPart: new RegExp(`^${regexes?.ellipsis.source}$`),
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

const getAnimatedSpanElements = (
  content: string,
  config: DisplayCommandConfig = defaultDisplayCommandConfig,
  instant?: boolean,
  debug?: boolean
): [HTMLSpanElement[], number] => {
  const letterFadeDuration = config?.letterFadeDuration || 0;
  const letterDelay = config?.letterDelay || 0;
  const punctuationDelay = config?.punctuationDelay || 0;
  const punctuationRegex = displayCommandRegexes?.punctuation;
  const ellipsisPartRegex = displayCommandRegexes?.ellipsisPart;
  const afterPunctuationSpaceSplitter =
    displayCommandRegexes?.spaceAfterSplitter;
  const partEls: HTMLSpanElement[][] = [];
  const flatPartEls: HTMLSpanElement[] = [];
  const createCharSpan = (
    part: string,
    totalDelay: number,
    style?: Partial<CSSStyleDeclaration>
  ): HTMLSpanElement => {
    const partTextEl = document.createTextNode(part);
    const partWrapperEl = document.createElement("span");
    partWrapperEl.style.opacity = instant ? "1" : "0";
    partWrapperEl.style.transition = instant
      ? null
      : `opacity ${letterFadeDuration}s linear ${totalDelay}s`;
    Object.entries(style || {}).forEach(([k, v]) => {
      partWrapperEl.style[k] = v;
    });
    partWrapperEl.appendChild(partTextEl);
    return partWrapperEl;
  };
  let totalDelay = 0;
  const splitContent = content
    .split(punctuationRegex)
    .flatMap((s) => (s.match(punctuationRegex) ? s : s.split("")));
  const marks: [string, number][] = [];
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
    const markers = marks.map((x) => x[0]);
    const isUnderline = markers.includes("_");
    const isBoldAndItalic = markers.includes("***");
    const isBold = markers.includes("**");
    const isItalic = markers.includes("*");
    const style: Partial<CSSStyleDeclaration> = {
      textDecoration: isUnderline ? "underline" : null,
      fontStyle: isItalic || isBoldAndItalic ? "italic" : null,
      fontWeight: isBold || isBoldAndItalic ? "bold" : null,
    };
    if (part.length > 1) {
      const isEllipsis = ellipsisPartRegex.test(part);
      const splitPunctuation = isEllipsis
        ? part.split("")
        : part.split(afterPunctuationSpaceSplitter);
      const spans: HTMLSpanElement[] = [];
      for (let p = 0; p < splitPunctuation.length; p += 1) {
        const punctuation = splitPunctuation[p];
        const charDelay =
          isEllipsis || punctuation === " " ? punctuationDelay : letterDelay;
        style.backgroundColor = debug
          ? charDelay === punctuationDelay
            ? displayCommandDebugColors.spaceAfter
            : displayCommandDebugColors.punctuation
          : undefined;
        spans.push(createCharSpan(punctuation, totalDelay, style));
        totalDelay += charDelay;
      }
      partEls[i] = spans;
      flatPartEls.push(...spans);
    } else {
      const span = createCharSpan(part, totalDelay, style);
      partEls[i] = [span];
      flatPartEls.push(span);
      totalDelay += letterDelay;
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
  return [flatPartEls, totalDelay];
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
