/** The file name of a project's main script when the compiler's configuration
 *  names none. */
export const DEFAULT_MAIN_SCRIPT_FILENAME = "main.sd";

/**
 * The folder of the project a compile that starts from `entryUri` belongs to:
 * the folder of that script, as a URI ending in `/`. A host starts a compile
 * from the nearest main script above the edited one, so this is the folder of
 * that main script; a script with no main script above it is the root of a
 * project of its own. A URI with no folder has no project. A URI is read as
 * the host spells the path, so a `?` or `#` in it is part of a file name, as
 * the web editor writes an imported `act#1.sd`.
 */
export function projectRootUri(entryUri: string): string | undefined {
  const at = entryUri.lastIndexOf("/");
  if (at < 0) {
    return undefined;
  }
  return entryUri.slice(0, at + 1);
}

/** Whether a file or folder name puts what it holds outside every project:
 *  `node_modules`, or a name beginning with `.`. */
export const isSkippedName = (name: string): boolean =>
  name === "node_modules" || name.startsWith(".");

/**
 * Whether the script `uri` belongs to the project rooted at `rootUri`: it is
 * under the root, no file or folder on its path below the root has a skipped
 * name (`isSkippedName`), and no folder on that path below the root holds a
 * main script of its own, which makes that folder the root of another
 * project. `hasScript` says whether a script is registered.
 */
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

/**
 * The scripts of the project a compile that starts from `entryUri` reads, in
 * the order their declarations register: the entry first, then every other
 * script of `scriptUris` in the project (`isInProject`) by its path below the
 * root as the host spells it, in byte order. A URI with no folder is a project
 * of itself alone.
 */
export function projectScripts(
  entryUri: string,
  scriptUris: Iterable<string>,
  mainScriptFilename: string = DEFAULT_MAIN_SCRIPT_FILENAME,
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
    .map((uri) => ({ uri, path: uri.slice(root.length) }))
    .sort((a, b) => compareCodePoints(a.path, b.path))
    .map(({ uri }) => uri);
  return [entryUri, ...members];
}

/** Orders two strings by their code points, which is the byte order of their
 *  UTF-8 encodings, where `<` compares UTF-16 code units. */
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
