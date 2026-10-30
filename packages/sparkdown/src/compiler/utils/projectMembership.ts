export const DEFAULT_MAIN_SCRIPT_FILENAME = "main.sd";

export function projectRootUri(entryUri: string): string | undefined {
  const at = entryUri.lastIndexOf("/");
  if (at < 0) {
    return undefined;
  }
  return entryUri.slice(0, at + 1);
}

export const isSkippedName = (name: string): boolean =>
  name === "node_modules" || name.startsWith(".");

export function isInProject(
  rootUri: string,
  uri: string,
  mainScriptFilename: string,
  hasScript: (uri: string) => boolean,
): boolean {
  if (!uri.startsWith(rootUri)) {
    return false;
  }
  const segments = uri.slice(rootUri.length).split("/");
  if (segments.some(isSkippedName)) {
    return false;
  }
  let folder = rootUri;
  for (const segment of segments.slice(0, -1)) {
    folder += `${segment}/`;
    if (hasScript(folder + mainScriptFilename)) {
      return false;
    }
  }
  return true;
}

export function projectScripts(
  entryUri: string,
  scriptUris: Iterable<string>,
  mainScriptFilename: string = DEFAULT_MAIN_SCRIPT_FILENAME,
  pathsAsWritten = false,
): string[] {
  const root = projectRootUri(entryUri);
  if (root === undefined) {
    return [entryUri];
  }
  const registered = new Set(scriptUris);
  const has = (uri: string) => registered.has(uri);
  const members = [...registered]
    .filter(
      (uri) =>
        uri !== entryUri && isInProject(root, uri, mainScriptFilename, has),
    )
    .map((uri) => ({
      uri,
      path: projectPath(uri.slice(root.length), pathsAsWritten),
    }))
    .sort((a, b) => compareCodePoints(a.path, b.path))
    .map(({ uri }) => uri);
  return [entryUri, ...members];
}

export const projectPath = (relative: string, asWritten = false): string => {
  if (asWritten) {
    return relative;
  }
  try {
    return decodeURIComponent(relative);
  } catch {
    return relative;
  }
};

function compareCodePoints(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const difference = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

export const LUAU_EXTENSION = ".luau";

export const hasLuauExtension = (uri: string): boolean =>
  uri.endsWith(LUAU_EXTENSION);

export function projectLuauFiles(
  entryUri: string,
  fileUris: Iterable<string>,
  hasScript: (uri: string) => boolean,
  mainScriptFilename: string = DEFAULT_MAIN_SCRIPT_FILENAME,
  pathsAsWritten = false,
): string[] {
  const root = projectRootUri(entryUri);
  if (root === undefined) {
    return [];
  }
  return [...new Set(fileUris)]
    .filter(
      (uri) =>
        hasLuauExtension(uri) &&
        isInProject(root, uri, mainScriptFilename, hasScript),
    )
    .map((uri) => ({
      uri,
      path: projectPath(uri.slice(root.length), pathsAsWritten),
    }))
    .sort((a, b) => compareCodePoints(a.path, b.path))
    .map(({ uri }) => uri);
}

export const luauFileName = (uri: string, asWritten = false): string => {
  const file = projectPath(uri.slice(uri.lastIndexOf("/") + 1), asWritten);
  const dot = file.indexOf(".");
  return dot < 0 ? file : file.slice(0, dot);
};
