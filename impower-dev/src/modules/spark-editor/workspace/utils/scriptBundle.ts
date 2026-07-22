import type { FileData } from "@impower/spark-editor-protocol/src/types";

// A project's `.sd` scripts are serialized into a SINGLE text blob for Google
// Drive text-sync. Each non-main script is introduced by a separator line:
//
//   //// <project-relative-path> ////
//
// The body before the first separator is the project's `main.sd`. The path in
// the separator is PROJECT-RELATIVE and may contain `/` so nested scripts (and
// two scripts sharing a basename in different folders) round-trip without
// collision.
//
// Back-compat: old (flat) bundles wrote `//// name.ext ////` (no slashes). The
// parser below treats the separator's contents as an opaque relative path, so a
// slashless legacy separator simply maps to a root-level file — old bundles read
// unchanged, and a flat project re-bundles byte-identically to the legacy format
// (zero Drive churn).
//
// NOTE: this also fixes a shipped regression. Commit e7162cd3c hardcoded the
// splitter as a 6-capture-group regex while the old parse loop assumed simple
// alternating even/odd `String.split` output, so `splitProjectTextContent`
// collapsed every script onto `main.sd` (last-chunk-wins). The line-scanning
// parser here replaces that brittle capture-group interleaving.

const FILE_SEPARATOR_PREFIX = "//// ";
const FILE_SEPARATOR_SUFFIX = " ////";

// Matches one separator line: optional indent, >=4 slashes, the path (captured,
// group 1, non-greedy so it stops at the trailing ` ////`), >=4 slashes, optional
// trailing whitespace. `m` => per line; tolerant of a trailing CR (CRLF bundles).
const FILE_SEPARATOR_LINE_SOURCE =
  String.raw`^[ \t]*\/{4,}[ \t]+(.+?)[ \t]+\/{4,}[ \t]*\r?$`;

const cmp = (a: string, b: string) => (a > b ? 1 : a < b ? -1 : 0);

/**
 * Serialize a project's scripts into the single text bundle. `main` (the file
 * whose project-relative path equals `mainRelativePath`) leads with no
 * separator; every other text file follows under a path-carrying separator,
 * ordered deterministically by (ext, name, relative-path).
 */
export const bundleScripts = (
  files: FileData[],
  mainRelativePath: string,
  getRelativePath: (uri: string) => string,
): string => {
  const main = files.find((f) => getRelativePath(f.uri) === mainRelativePath);
  let content = "";
  if (main?.text != null) {
    content += `${main.text}`;
  }
  files
    .filter((f) => f !== main && f.text != null && f.name)
    .sort(
      (a, b) =>
        cmp(a.ext, b.ext) ||
        cmp(a.name, b.name) ||
        cmp(getRelativePath(a.uri), getRelativePath(b.uri)),
    )
    .forEach((f) => {
      const relativePath = getRelativePath(f.uri);
      content += `\n\n${FILE_SEPARATOR_PREFIX}${relativePath}${FILE_SEPARATOR_SUFFIX}`;
      content += `\n\n${f.text}`;
    });
  return content.trim();
};

/**
 * Parse the text bundle back into `{ relativePath: body }`. The body before the
 * first separator is keyed by `mainRelativePath`; each subsequent body is keyed
 * by the path from the separator that precedes it.
 */
export const splitScriptBundle = (
  text: string,
  mainRelativePath: string,
): Record<string, string> => {
  // Fresh RegExp per call so the stateful `g`-flag `lastIndex` can't leak.
  const separatorLine = new RegExp(FILE_SEPARATOR_LINE_SOURCE, "gm");
  const separators: { path: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = separatorLine.exec(text))) {
    separators.push({
      path: match[1]!.trim(),
      start: match.index,
      end: separatorLine.lastIndex,
    });
  }
  const chunks: Record<string, string> = {};
  let cursor = 0;
  let pathForBody = mainRelativePath;
  for (const separator of separators) {
    chunks[pathForBody] = text.slice(cursor, separator.start).trim();
    pathForBody = separator.path;
    cursor = separator.end;
  }
  chunks[pathForBody] = text.slice(cursor).trim();
  return chunks;
};
