import type { ProgramAddress } from "../types/ProgramAddress";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import {
  type SceneAssetCapture,
  type SceneBeat,
} from "../types/SceneAssets";

const VARIABLES = GRAMMAR_DEFINITION.variables as unknown as Record<
  string,
  string[] | undefined
>;

const IMAGE_CONTROL_KEYWORDS: string[] = VARIABLES["IMAGE_CONTROL_KEYWORDS"] ?? [
  "show",
  "hide",
  "animate",
];
const AUDIO_CONTROL_KEYWORDS: string[] = VARIABLES["AUDIO_CONTROL_KEYWORDS"] ?? [
  "play",
  "stop",
  "fade",
  "queue",
  "await",
];
const LAYOUT_CONTROL_KEYWORDS: string[] = VARIABLES[
  "LAYOUT_CONTROL_KEYWORDS"
] ?? ["open", "close", "navigate"];
const LOAD_CONTROL_KEYWORDS: string[] = VARIABLES["LOAD_CONTROL_KEYWORDS"] ?? [
  "load",
];
const MOVIE_CONTROL_KEYWORDS: string[] = VARIABLES["MOVIE_CONTROL_KEYWORDS"] ?? [
  "play",
];
const OTHER_CONTROL_KEYWORDS: string[] = ["write"];

const CONTROL_KEYWORDS = new Set<string>([
  ...IMAGE_CONTROL_KEYWORDS,
  ...AUDIO_CONTROL_KEYWORDS,
  ...LAYOUT_CONTROL_KEYWORDS,
  ...LOAD_CONTROL_KEYWORDS,
  ...MOVIE_CONTROL_KEYWORDS,
  ...OTHER_CONTROL_KEYWORDS,
]);
const CLAUSE_KEYWORDS = new Set<string>([
  ...(VARIABLES["IMAGE_CLAUSE_KEYWORDS"] ?? []),
  ...(VARIABLES["AUDIO_CLAUSE_KEYWORDS"] ?? []),
]);
const LAYOUT_CONTROLS = new Set<string>(LAYOUT_CONTROL_KEYWORDS);
const LOAD_CONTROLS = new Set<string>(LOAD_CONTROL_KEYWORDS);
const MOVIE_CONTROLS = new Set<string>(MOVIE_CONTROL_KEYWORDS);

const isCutsceneVerb = (verb: string | undefined, kind: "image" | "audio") =>
  kind === "image" && verb !== undefined && MOVIE_CONTROLS.has(verb);
const NON_LOADING_CONTROLS = new Set<string>([
  "hide",
  "stop",
  "fade",
  "await",
  "close",
  "write",
]);

interface ScannedNames {
  image: string[];
  audio: string[];
  layouts: string[];
  loads: string[];
}

const tokenize = (body: string): string[] =>
  body
    .replaceAll("\t", " ")
    .split(" ")
    .filter((t) => t !== "");

const readNames = (tokens: string[], into: string[]) => {
  for (const token of tokens) {
    if (CLAUSE_KEYWORDS.has(token)) {
      break;
    }
    for (const name of token.split("+")) {
      if (name && name !== "none") {
        into.push(name);
      }
    }
  }
};

const scanBody = (
  body: string,
  kind: "image" | "audio",
  names: ScannedNames,
) => {
  const tokens = tokenize(body);
  const verb = tokens[0];
  if (verb === undefined) {
    return;
  }
  if (!CONTROL_KEYWORDS.has(verb)) {
    readNames(tokens, kind === "image" ? names.image : names.audio);
    return;
  }
  if (isCutsceneVerb(verb, kind)) {
    const video = tokens[1];
    if (video && !CLAUSE_KEYWORDS.has(video)) {
      names.image.push(video);
    }
    return;
  }
  if (LOAD_CONTROLS.has(verb)) {
    if (kind === "image") {
      readNames(tokens.slice(1), names.loads);
    }
    return;
  }
  if (LAYOUT_CONTROLS.has(verb)) {
    if (verb === "navigate") {
      const toIndex = tokens.indexOf("to");
      const destination = toIndex >= 0 ? tokens[toIndex + 1] : undefined;
      if (destination && !CLAUSE_KEYWORDS.has(destination)) {
        names.layouts.push(destination);
      }
    } else if (verb === "open") {
      const layout = tokens[1];
      if (layout && !CLAUSE_KEYWORDS.has(layout)) {
        names.layouts.push(layout);
      }
    }
    return;
  }
  if (NON_LOADING_CONTROLS.has(verb)) {
    return;
  }
  readNames(tokens.slice(2), kind === "image" ? names.image : names.audio);
};

const dynamicBaseOf = (
  fragment: string,
  hasVerb: boolean,
  cutscene: boolean,
): string | null => {
  if (fragment.endsWith(" ") || fragment.endsWith("\t")) {
    return null;
  }
  const tokens = tokenize(fragment);
  const minimum = cutscene ? 1 : hasVerb ? 2 : 0;
  if (tokens.length <= minimum) {
    return null;
  }
  const last = tokens[tokens.length - 1]!;
  if (CLAUSE_KEYWORDS.has(last)) {
    return null;
  }
  const base = last.split(/[:~]/)[0] ?? "";
  return base && base !== "none" ? base : null;
};

export function scanAssetDirectives(
  text: string,
  address: ProgramAddress,
  capture: SceneAssetCapture,
): SceneBeat | undefined {
  const names: ScannedNames = { image: [], audio: [], layouts: [], loads: [] };
  let raw = false;
  let escaped = false;
  for (let i = 0; i < text.length; ) {
    const char = text[i]!;
    const next = text[i + 1] ?? "";
    if (escaped) {
      escaped = false;
      i += 1;
      continue;
    }
    if (char === "`") {
      raw = !raw;
      i += 1;
      continue;
    }
    if (raw) {
      i += 1;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      i += 1;
      continue;
    }
    const opener =
      char === "[" && next === "["
        ? ("image" as const)
        : char === "(" && next === "("
          ? ("audio" as const)
          : null;
    if (!opener) {
      i += 1;
      continue;
    }
    const closer = opener === "image" ? "]]" : "))";
    const bodyStart = i + 2;
    const closeIndex = text.indexOf(closer, bodyStart);
    if (closeIndex < 0) {
      capture.dynamic = true;
      const fragment = text.slice(bodyStart);
      const verb = tokenize(fragment)[0];
      const hasVerb = verb !== undefined && CONTROL_KEYWORDS.has(verb);
      if (
        opener === "image" &&
        (!hasVerb || (verb && !NON_LOADING_CONTROLS.has(verb)))
      ) {
        const base = dynamicBaseOf(
          fragment,
          hasVerb,
          isCutsceneVerb(verb, opener),
        );
        if (base && !capture.dynamicBases.includes(base)) {
          capture.dynamicBases.push(base);
        }
      }
      break;
    }
    scanBody(text.slice(bodyStart, closeIndex), opener, names);
    i = closeIndex + 2;
  }
  if (
    names.image.length === 0 &&
    names.audio.length === 0 &&
    names.layouts.length === 0 &&
    names.loads.length === 0
  ) {
    return undefined;
  }
  const beat: SceneBeat = { address };
  if (names.image.length > 0) {
    beat.image = names.image;
  }
  if (names.audio.length > 0) {
    beat.audio = names.audio;
  }
  if (names.layouts.length > 0) {
    beat.layouts = names.layouts;
  }
  if (names.loads.length > 0) {
    beat.loads = names.loads;
  }
  capture.beats.push(beat);
  return beat;
}
