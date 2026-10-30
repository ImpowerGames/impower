import { LUAU_EXTENSION, luauFileName, projectPath } from "./projectMembership";

export const endsWithLuauExtension = (text: string): boolean =>
  text.toLowerCase().endsWith(LUAU_EXTENSION);

const withoutLuauExtension = (text: string): string =>
  endsWithLuauExtension(text) ? text.slice(0, -LUAU_EXTENSION.length) : text;

export const runPathDisplay = (path: string): string =>
  endsWithLuauExtension(path) ? path : path + LUAU_EXTENSION;

const quotedList = (items: string[], conjunction: string): string => {
  const quoted = items.map((item) => `'${item}'`);
  return quoted.length <= 1
    ? (quoted[0] ?? "")
    : `${quoted.slice(0, -1).join(", ")} ${conjunction} ${quoted.at(-1)}`;
};

const didYouMean = (suggestions: string[]): string =>
  suggestions.length > 0 ? ` Did you mean ${quotedList(suggestions, "or")}?` : "";

export const quotePathMessage = (operand: string): string =>
  `Quote a path: run "${operand}"`;

export const missingRunNameMessage = (
  name: string,
  suggestions: string[] = [],
): string =>
  `Could not find a Luau file named '${name}' in the project.${didYouMean(suggestions)}`;

export const missingRunPathMessage = (
  path: string,
  suggestions: string[] = [],
): string =>
  `Could not find '${runPathDisplay(path)}' for 'run' statement.${didYouMean(suggestions.map(runPathDisplay))}`;

export const ambiguousRunNameMessage = (name: string, paths: string[]): string =>
  `More than one Luau file in the project is named '${name}': ${quotedList(paths, "and")}. Quote the path of the one to run.`;

export const closeQuoteMessage = (operand: string): string =>
  `Close the quote: run ${operand}${operand[0]}`;

export interface RunFix {
  title: string;
  newText: string;
}

export interface RunFixData {
  runFixes: RunFix[];
}

export const runFixesOf = (data: unknown): RunFix[] => {
  const fixes = (data as Partial<RunFixData> | undefined)?.runFixes;
  return Array.isArray(fixes)
    ? fixes.filter(
        (fix): fix is RunFix =>
          typeof fix?.title === "string" && typeof fix?.newText === "string",
      )
    : [];
};

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

const fileSystemUri = (uri: string, asWritten: boolean): string =>
  asWritten
    ? uri
    : uri
        .split("/")
        .map((segment) => projectPath(segment))
        .join("/");

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

export const quotedRunPath = (path: string): string =>
  path.endsWith(LUAU_EXTENSION) ? path.slice(0, -LUAU_EXTENSION.length) : path;

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
