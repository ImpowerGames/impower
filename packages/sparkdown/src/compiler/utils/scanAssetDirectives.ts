import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import {
  type SceneAssetCapture,
  type SceneBeat,
} from "../types/SceneAssets";

// The token rules mirror the runtime parser (`InterpreterModule.createAssetChunk`):
// a directive body is split on spaces; when the first token is a control verb,
// the second token is the target (a layer, a channel, a layout, or a scene) and
// the rest are names; a clause keyword ends the names; names split on `+`.
// Keyword lists come from the grammar so the two parsers cannot drift apart.
// The grammar JSON also carries string-valued variables (regex fragments),
// so the lookup type goes through `unknown`.
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
// `write` is a runtime-only control verb (`[[write layer …]]`); it names no asset.
const OTHER_CONTROL_KEYWORDS: string[] = ["write"];

const CONTROL_KEYWORDS = new Set<string>([
  ...IMAGE_CONTROL_KEYWORDS,
  ...AUDIO_CONTROL_KEYWORDS,
  ...LAYOUT_CONTROL_KEYWORDS,
  ...LOAD_CONTROL_KEYWORDS,
  ...OTHER_CONTROL_KEYWORDS,
]);
const CLAUSE_KEYWORDS = new Set<string>([
  ...(VARIABLES["IMAGE_CLAUSE_KEYWORDS"] ?? []),
  ...(VARIABLES["AUDIO_CLAUSE_KEYWORDS"] ?? []),
]);
const LAYOUT_CONTROLS = new Set<string>(LAYOUT_CONTROL_KEYWORDS);
const LOAD_CONTROLS = new Set<string>(LOAD_CONTROL_KEYWORDS);
// Verbs that take an asset name but never need it loaded.
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

/** Names before the first clause keyword, split on `+`, without `none`. */
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
    // No verb: every token up to the first clause is a name shown on the
    // default layer or played on the default channel.
    readNames(tokens, kind === "image" ? names.image : names.audio);
    return;
  }
  if (LOAD_CONTROLS.has(verb)) {
    // `[[load A B with fade]]`: every token up to the first clause is a flow
    // (or world) name.
    readNames(tokens.slice(1), names.loads);
    return;
  }
  if (LAYOUT_CONTROLS.has(verb)) {
    if (verb === "navigate") {
      // `navigate <screen> to <layout>`: the destination follows `to`.
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
  // `<verb> <target> <names…>`: the token after the verb is the layer or
  // channel, not an asset.
  readNames(tokens.slice(2), kind === "image" ? names.image : names.audio);
};

/**
 * The static prefix of a name cut off by an interpolation.
 *
 * `[[show portrait bunny~{mood}]]` reaches the scanner as the text run
 * `[[show portrait bunny~` (the expression splits the literal), so the last
 * token before the cut, up to its first `~`, is the base every variant shares.
 * A run that ends in a space has no base: the whole name is dynamic.
 */
const dynamicBaseOf = (fragment: string, hasVerb: boolean): string | null => {
  if (fragment.endsWith(" ") || fragment.endsWith("\t")) {
    return null;
  }
  const tokens = tokenize(fragment);
  // With a verb, the first two tokens are the verb and the target.
  const minimum = hasVerb ? 2 : 0;
  if (tokens.length <= minimum) {
    return null;
  }
  const last = tokens[tokens.length - 1]!;
  if (CLAUSE_KEYWORDS.has(last)) {
    return null;
  }
  const base = last.split("~")[0] ?? "";
  return base && base !== "none" ? base : null;
};

/**
 * Scan one text leaf for `[[…]]` and `((…))` directives and record what they
 * reference into `capture` under `path`.
 *
 * Mirrors the runtime interpreter's scan: a backslash escapes the next
 * character and a backtick toggles a raw run in which brackets are literal. An
 * opener with no closer in the same run means an interpolation split the
 * directive, which marks the flow dynamic.
 */
export function scanAssetDirectives(
  text: string,
  path: string,
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
      // Cut off by an interpolation: the name (or its tail) is runtime-only.
      capture.dynamic = true;
      const fragment = text.slice(bodyStart);
      const verb = tokenize(fragment)[0];
      const hasVerb = verb !== undefined && CONTROL_KEYWORDS.has(verb);
      if (
        opener === "image" &&
        (!hasVerb || (verb && !NON_LOADING_CONTROLS.has(verb)))
      ) {
        const base = dynamicBaseOf(fragment, hasVerb);
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
  const beat: SceneBeat = { path };
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
