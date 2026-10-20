/**
 * The part of a uri the mapping reads. `vscode.Uri` satisfies it in the
 * extension; tests pass `vscode-uri`'s `URI`, which has the same behavior.
 */
export interface DebugUri {
  readonly scheme: string;
  readonly path: string;
  readonly fsPath: string;
  with(change: { path: string }): DebugUri;
  toString(): string;
}

export interface DebugUriFactory {
  parse(value: string): DebugUri;
  file(path: string): DebugUri;
}

// A uri scheme has at least two characters, so a Windows drive ("C:") is not one.
const URI_WITH_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]+:/;

const normalizeSeparators = (path: string) => path.replace(/\\/g, "/");

// Compares file system paths ignoring separator style and drive-letter case,
// which the debug client and the document model may spell differently.
const normalizeFsPath = (path: string) =>
  normalizeSeparators(path).replace(/^([a-zA-Z]):/, (_m, d: string) =>
    `${d.toLowerCase()}:`,
  );

/**
 * Maps a source path from the debug client to the uri string of the document
 * it names, keeping that document's own scheme (`file:`, `vscode-test-web:`,
 * `memfs:`, ...).
 *
 * The client may send a uri string (what `debugUriToPath` hands it for a
 * non-file document), a file system path, or a bare path such as `\main.sd`
 * for a document under a non-file workspace folder. A path matching one of
 * `knownUris` (the open documents) maps to that uri; a rooted path in a
 * workspace whose `rootUris` folders are all non-file maps under the first
 * folder; anything else is a `file:` uri.
 */
export function debugPathToUri(
  Uri: DebugUriFactory,
  path: string,
  knownUris: readonly string[],
  rootUris: readonly string[] = [],
): string {
  if (URI_WITH_SCHEME.test(path)) {
    return Uri.parse(path).toString();
  }
  const normalized = normalizeSeparators(path);
  for (const known of knownUris) {
    const uri = Uri.parse(known);
    if (uri.scheme === "file") {
      if (normalizeFsPath(uri.fsPath) === normalizeFsPath(path)) {
        return uri.toString();
      }
    } else if (
      uri.path === normalized ||
      normalizeSeparators(uri.fsPath) === normalized
    ) {
      return uri.toString();
    }
  }
  const roots = rootUris.map((root) => Uri.parse(root));
  const [firstRoot] = roots;
  if (
    firstRoot &&
    normalized.startsWith("/") &&
    roots.every((root) => root.scheme !== "file")
  ) {
    const base = firstRoot.path.replace(/\/+$/, "");
    return firstRoot.with({ path: base + normalized }).toString();
  }
  try {
    return Uri.file(path).toString();
  } catch {
    return Uri.parse(path).toString();
  }
}

/**
 * Maps a document uri string to the source path handed to the debug client: a
 * file system path for a `file:` document, otherwise the uri string itself,
 * which the client opens as a uri and which `debugPathToUri` maps back.
 */
export function debugUriToPath(Uri: DebugUriFactory, uri: string): string {
  const parsed = Uri.parse(uri);
  return parsed.scheme === "file" ? parsed.fsPath : parsed.toString();
}
