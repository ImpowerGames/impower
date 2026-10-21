import { LUAU_EXTENSION, luauFileName, projectPath } from "./projectMembership";

// A `run` statement's operand has two forms, told apart by its quotes: an
// unquoted operand is a name, the one `.luau` file of that name in the
// project, and a quoted one is a path relative to the script, `.luau`
// implied (#1389). Both are case exact; an operand that differs from a file
// only by case reports the file's spelling instead of resolving (#1334). The
// compiler reports these messages, with the quick fixes the language server
// offers for them (`RunFixData`).

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

/** An operand that opens a quote and never closes it. */
export const closeQuoteMessage = (operand: string): string =>
  `Close the quote: run ${operand}${operand[0]}`;

/** A quick fix of a diagnostic on a run operand: the text that replaces the
 *  operand, which is the diagnostic's range. The compiler computes them,
 *  since it knows the files and the script the operand is in, and carries
 *  them in the diagnostic's `data` (`RunFixData`); the language server offers
 *  them as they are. */
export interface RunFix {
  title: string;
  newText: string;
}

/** The `data` of a diagnostic on a run operand that has quick fixes. */
export interface RunFixData {
  runFixes: RunFix[];
}

/** The quick fixes `data` carries, if it is a run diagnostic's. */
export const runFixesOf = (data: unknown): RunFix[] => {
  const fixes = (data as Partial<RunFixData> | undefined)?.runFixes;
  return Array.isArray(fixes)
    ? fixes.filter(
        (fix): fix is RunFix =>
          typeof fix?.title === "string" && typeof fix?.newText === "string",
      )
    : [];
};

/**
 * The path of the file `fileUri` relative to the folder of the script
 * `scriptUri`, as the file system names it (`projectPath`; `asWritten` is the
 * host's `uriPathsAsWritten`): `lib/helpers.luau` from main.sd at the root,
 * `../lib/helpers.luau` from `chapters/act1.sd`.
 */
export function relativeRunPath(
  scriptUri: string,
  fileUri: string,
  asWritten = false,
): string {
  const from = scriptUri.split("/").slice(0, -1);
  const to = fileUri.split("/");
  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length - 1 &&
    from[shared] === to[shared]
  ) {
    shared += 1;
  }
  return [
    ...from.slice(shared).map(() => ".."),
    ...to.slice(shared).map((segment) => projectPath(segment, asWritten)),
  ].join("/");
}

/** `uri` with each path segment as the file system names it (`projectPath`):
 *  decoded, unless the host spells URIs as file names are written
 *  (`asWritten`). An author writes a run path in these terms. */
const fileSystemUri = (uri: string, asWritten: boolean): string =>
  asWritten
    ? uri
    : uri
        .split("/")
        .map((segment) => projectPath(segment))
        .join("/");

/** The file a quoted run path `path` names from the script `scriptUri`, in
 *  file system terms (`fileSystemUri`): the path's segments joined to the
 *  script's folder as the author wrote them, a leading `/` ignored and `.`
 *  and `..` resolved. */
function runPathTarget(
  scriptUri: string,
  path: string,
  asWritten: boolean,
): string {
  const script = fileSystemUri(scriptUri, asWritten);
  const scheme = script.indexOf("://");
  const rootEnd = script.indexOf("/", scheme < 0 ? 0 : scheme + 3) + 1;
  const segments = script.slice(rootEnd).split("/").slice(0, -1);
  for (const segment of path.trim().split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "." && segment !== "") {
      segments.push(segment);
    }
  }
  return script.slice(0, rootEnd) + segments.join("/");
}

/**
 * The file of `luauUris` a quoted run path `path`, written in the script
 * `scriptUri`, names, case exact, or `undefined` when none does. Each URI is
 * compared as the file system names it (`fileSystemUri`), the way a name
 * operand is, so a path the author writes, or a quick fix writes for them,
 * finds `lib space/helpers.luau` or `lib#one/helpers.luau` whether the host
 * spells that URI as written (the web editor, `asWritten`) or percent-encoded
 * (VS Code).
 */
export function findRunPath(
  scriptUri: string,
  path: string,
  luauUris: Iterable<string>,
  asWritten = false,
): string | undefined {
  const target = runPathTarget(scriptUri, path, asWritten);
  for (const uri of luauUris) {
    if (fileSystemUri(uri, asWritten) === target) {
      return uri;
    }
  }
  return undefined;
}

/** The offsets, in a run operand's text as written (`text`, quotes and any
 *  whitespace after them included), of the name of the file it names: the
 *  last path segment, before its first dot, inside the quotes. Renaming the
 *  file renames this part. */
export function runOperandNameSpan(text: string): [number, number] {
  const trimmed = text.trimEnd();
  const quoted = /^["']/.test(trimmed);
  const innerStart = quoted ? 1 : 0;
  const innerEnd =
    quoted && trimmed.length > 1 && trimmed.endsWith(trimmed[0]!)
      ? trimmed.length - 1
      : trimmed.length;
  const start = Math.max(innerStart, trimmed.lastIndexOf("/", innerEnd - 1) + 1);
  const dot = trimmed.indexOf(".", start);
  return [start, dot < 0 || dot > innerEnd ? innerEnd : dot];
}

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
    runPathTarget(scriptUri, relative, asWritten).toLowerCase();
  const targets = new Set([resolve(path + LUAU_EXTENSION)]);
  if (endsWithLuauExtension(path)) {
    targets.add(resolve(path));
  }
  const suggestions: string[] = [];
  for (const uri of luauUris) {
    if (targets.has(fileSystemUri(uri, asWritten).toLowerCase())) {
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
