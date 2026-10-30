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

const URI_WITH_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]+:/;

const normalizeSeparators = (path: string) => path.replace(/\\/g, "/");

const normalizeFsPath = (path: string) =>
  normalizeSeparators(path).replace(/^([a-zA-Z]):/, (_m, d: string) =>
    `${d.toLowerCase()}:`,
  );

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

export function debugUriToPath(Uri: DebugUriFactory, uri: string): string {
  const parsed = Uri.parse(uri);
  return parsed.scheme === "file" ? parsed.fsPath : parsed.toString();
}
