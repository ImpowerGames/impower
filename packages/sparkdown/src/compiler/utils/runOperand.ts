import { LUAU_EXTENSION, luauFileName, projectPath } from "./projectMembership";
import { resolveFileUsingImpliedExtension } from "./resolveFileUsingImpliedExtension";

// A `run` statement's operand has two forms, told apart by its quotes: an
// unquoted operand is a name, the one `.luau` file of that name in the
// project, and a quoted one is a path relative to the script, `.luau`
// implied (#1389). Both are case exact; an operand that differs from a file
// only by case reports the file's spelling instead of resolving (#1334). The
// compiler reports these messages and the language server's quick fixes read
// them back.

/** Whether `text` ends in `.luau`, in any case. */
export const endsWithLuauExtension = (text: string): boolean =>
  text.toLowerCase().endsWith(LUAU_EXTENSION);

/** `text` without a trailing `.luau` in any case. */
const withoutLuauExtension = (text: string): string =>
  endsWithLuauExtension(text) ? text.slice(0, -LUAU_EXTENSION.length) : text;

/** A path operand as a message names the file: with `.luau` unless it ends
 *  in it already. */
export const runPathDisplay = (path: string): string =>
  endsWithLuauExtension(path) ? path : path + LUAU_EXTENSION;

/** `'a'`, `'a' and 'b'`, or `'a', 'b' and 'c'`. */
const quotedList = (items: string[], conjunction: string): string => {
  const quoted = items.map((item) => `'${item}'`);
  return quoted.length <= 1
    ? (quoted[0] ?? "")
    : `${quoted.slice(0, -1).join(", ")} ${conjunction} ${quoted.at(-1)}`;
};

const didYouMean = (suggestions: string[]): string =>
  suggestions.length > 0 ? ` Did you mean ${quotedList(suggestions, "or")}?` : "";

/** An unquoted operand that holds a slash is a path written as a name. */
export const quotePathMessage = (operand: string): string =>
  `Quote a path: run "${operand}"`;

/** No Luau file in the project has the name, with the names that differ from
 *  it only by case. */
export const missingRunNameMessage = (
  name: string,
  suggestions: string[] = [],
): string =>
  `Could not find a Luau file named '${name}' in the project.${didYouMean(suggestions)}`;

/** No file is at the path, with the paths that differ from it only by
 *  case, each as `runPathDisplay` names it. */
export const missingRunPathMessage = (
  path: string,
  suggestions: string[] = [],
): string =>
  `Could not find '${runPathDisplay(path)}' for 'run' statement.${didYouMean(suggestions.map(runPathDisplay))}`;

/** Two or more Luau files of the project have the name: each one's path
 *  below the project's folder. */
export const ambiguousRunNameMessage = (name: string, paths: string[]): string =>
  `More than one Luau file in the project is named '${name}': ${quotedList(paths, "and")}. Quote the path of the one to run.`;

/** A run message the language server has quick fixes for. */
export type RunMessage =
  | { kind: "quotePath" }
  | { kind: "ambiguousName"; paths: string[] }
  | { kind: "missingName"; suggestions: string[] }
  | { kind: "missingPath"; suggestions: string[] };

const QUOTED_ITEM = /'([^']*)'/g;

const quotedItems = (text: string): string[] =>
  [...text.matchAll(QUOTED_ITEM)].map((match) => match[1]!);

/** What a diagnostic's message says about a run operand, or `undefined` for
 *  any other message. */
export const parseRunMessage = (message: string): RunMessage | undefined => {
  if (message.startsWith('Quote a path: run "')) {
    return { kind: "quotePath" };
  }
  const ambiguous = /^More than one Luau file in the project is named '[^']*': (.*)\. Quote the path of the one to run\.$/.exec(
    message,
  );
  if (ambiguous) {
    return { kind: "ambiguousName", paths: quotedItems(ambiguous[1]!) };
  }
  const suggestions = /^Could not find .*? Did you mean (.*)\?$/.exec(message);
  if (message.startsWith("Could not find a Luau file named '")) {
    return {
      kind: "missingName",
      suggestions: suggestions ? quotedItems(suggestions[1]!) : [],
    };
  }
  if (/^Could not find '.*' for 'run' statement\./.test(message)) {
    return {
      kind: "missingPath",
      suggestions: suggestions ? quotedItems(suggestions[1]!) : [],
    };
  }
  return undefined;
};

/** The operand a quoted path resolves to written as `path`, `.luau` implied:
 *  `./lib/helpers` for the file `lib/helpers.luau` below the project's
 *  folder. */
export const quotedRunPath = (path: string): string =>
  path.endsWith(LUAU_EXTENSION) ? path.slice(0, -LUAU_EXTENSION.length) : path;

/** The files of `luauUris` a name operand finds: those whose name
 *  (`luauFileName`) is `name`, and, when none is, the names of those whose
 *  name differs from it only by case, a trailing `.luau` in any case left
 *  out (#1334). */
export function findRunName(
  name: string,
  luauUris: readonly string[],
  asWritten = false,
): { matches: string[]; nearMisses: string[] } {
  const matches = luauUris.filter((uri) => luauFileName(uri, asWritten) === name);
  if (matches.length > 0) {
    return { matches, nearMisses: [] };
  }
  const folded = withoutLuauExtension(name).toLowerCase();
  const nearMisses = new Set<string>();
  for (const uri of luauUris) {
    const fileName = luauFileName(uri, asWritten);
    if (fileName.toLowerCase() === folded) {
      nearMisses.add(fileName);
    }
  }
  return { matches, nearMisses: [...nearMisses] };
}

/**
 * The spellings of a quoted path operand `path`, written in the script
 * `scriptUri`, that name a file of `luauUris` it differs from only by case
 * (#1334): the files whose URI is the one `path` resolves to, `.luau`
 * implied, or the one it names with its own extension when that is `.luau` in
 * another case, compared without case. Each keeps the operand's form: the
 * segments before its last `.` or `..` stay as written, the others take the
 * file's, and the extension is left out when the operand leaves it out.
 */
export function runPathNearMisses(
  path: string,
  scriptUri: string,
  luauUris: readonly string[],
  asWritten = false,
): string[] {
  const resolve = (relative: string) =>
    resolveFileUsingImpliedExtension(scriptUri, relative, "luau").toLowerCase();
  const targets = new Set([resolve(path + LUAU_EXTENSION)]);
  if (endsWithLuauExtension(path)) {
    targets.add(resolve(path));
  }
  const suggestions: string[] = [];
  for (const uri of luauUris) {
    if (targets.has(uri.toLowerCase())) {
      const respelled = respell(path, uri, asWritten);
      if (respelled !== path && !suggestions.includes(respelled)) {
        suggestions.push(respelled);
      }
    }
  }
  return suggestions;
}

/** `path` with the spelling of the file `uri` it names. */
function respell(path: string, uri: string, asWritten: boolean): string {
  const segments = path.split("/");
  let first = segments.length;
  while (first > 0 && ![".", "..", ""].includes(segments[first - 1]!)) {
    first -= 1;
  }
  const count = segments.length - first;
  const fileSegments = uri
    .split("/")
    .slice(-count)
    .map((segment) => projectPath(segment, asWritten));
  if (count === 0 || fileSegments.length !== count) {
    return path;
  }
  if (!endsWithLuauExtension(segments.at(-1)!)) {
    fileSegments[fileSegments.length - 1] = quotedRunPath(fileSegments.at(-1)!);
  }
  return [...segments.slice(0, first), ...fileSegments].join("/");
}
