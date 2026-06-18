// Folder-aware generalization of `getValidFileName`. Where `getValidFileName`
// sanitizes a single basename (and destroys folder structure by rewriting `/`
// to `_`), this sanitizes a project-relative PATH: it keeps `/` between
// segments so dropped/uploaded folder hierarchies survive, sanitizes each
// segment with the SAME character rule as `getValidFileName` (so a slash-less
// path sanitizes identically to before), and REJECTS path-traversal /
// absolute-escape attempts so a malicious archive entry can't write outside the
// project directory in OPFS.
//
// Returns the cleaned relative path, or `null` if the input is empty after
// cleaning or contains a `..` segment (treat `null` as "skip this entry").
//
// NOTE: not yet wired into the import paths (FileDropzone / AssetsFab); that
// swap is part of the folder-import work. This is the pure, tested primitive.

// Same class as getValidFileName: replace anything that isn't a word char,
// newline/CR, or dot with `_` — applied PER SEGMENT so `/` is preserved.
const SEGMENT_DISALLOWED = /[^\w\n\r.]/g;

const sanitizeSegment = (segment: string): string =>
  segment.replace(SEGMENT_DISALLOWED, "_");

export const sanitizeRelativePath = (input: string): string | null => {
  // Normalize Windows-style separators from OS drops (`webkitRelativePath`
  // is `/`-delimited, but raw drops/zip entries can carry `\`).
  const segments = input.replace(/\\/g, "/").split("/");

  const cleaned: string[] = [];
  for (const rawSegment of segments) {
    // Drop empty (leading/trailing/double slash) and `.` segments.
    if (rawSegment === "" || rawSegment === ".") {
      continue;
    }
    // A `..` segment is a traversal attempt — refuse the whole path.
    if (rawSegment === "..") {
      return null;
    }
    cleaned.push(sanitizeSegment(rawSegment));
  }

  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.join("/");
};

export default sanitizeRelativePath;
