import {
  FileCode,
  FileText,
  FileTypeCsv,
  FileTypeHtml,
  FileTypeJs,
  FileTypeJsx,
  FileTypePdf,
  FileTypeTs,
  FileTypeXml,
  FileZip,
  Folder,
  FolderOpen,
  type IconComponent,
  Link,
  Movie,
  Music,
  Photo,
  Script,
  WaveSaw,
} from "@impower/impower-ui/icons";

/**
 * File extension → icon component. Keyed by the lowercased extension WITHOUT
 * the leading dot. Anything not listed falls back to {@link FileText}.
 *
 * Grouped to mirror how the editor treats these files:
 *  - `.sd` is the screenplay script (its own glyph)
 *  - prose/data text gets a plain document glyph
 *  - code/structured data gets the code glyph
 *  - images / audio / archives / docs get their medium's glyph
 */
const ICON_BY_EXT: Record<string, IconComponent> = {
  // Screenplay script
  sd: Script,

  // Prose & plain text
  txt: FileText,
  md: FileText,
  name: FileText,

  // Code / structured data (distinct file-type glyphs where Tabler has one;
  // `.json` has no Tabler file-type icon, so it keeps the generic code glyph).
  json: FileCode,
  js: FileTypeJs,
  ts: FileTypeTs,
  jsx: FileTypeJsx,
  tsx: FileTypeJsx,
  csv: FileTypeCsv,
  xml: FileTypeXml,

  // Images
  png: Photo,
  jpg: Photo,
  jpeg: Photo,
  gif: Photo,
  webp: Photo,
  svg: Photo,

  // Audio
  mid: Music,
  mp3: Music,
  ogg: Music,
  wav: Music,
  m4a: Music,

  // Video
  mp4: Movie,
  webm: Movie,
  mov: Movie,
  m4v: Movie,
  ogv: Movie,
  mkv: Movie,
  avi: Movie,

  // Synth instrument
  synth: WaveSaw,

  // Misc media / documents
  url: Link,
  zip: FileZip,
  pdf: FileTypePdf,
  html: FileTypeHtml,
};

/**
 * Lowercased final extension of a path's basename, or `""` when there is none.
 * Leading-dot files (`.folder`) and extension-less names have no extension.
 */
export function extOf(path: string): string {
  const basename = path.split("/").slice(-1)[0] ?? path;
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex > 0 ? basename.slice(dotIndex + 1).toLowerCase() : "";
}

/** Coarse media category of a file, keyed off its extension. */
export type FileCategory = "image" | "audio" | "video" | "text" | "other";

// Extension → category. Derived from the extension (not the worker's FileData
// `type`, which depends on configurable glob patterns that may be unset), so the
// Type filter is reliable regardless of workspace settings.
const CATEGORY_BY_EXT: Record<string, FileCategory> = {
  // image
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  ico: "image",
  // audio
  mid: "audio",
  midi: "audio",
  mp3: "audio",
  ogg: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  // video
  mp4: "video",
  webm: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  m4v: "video",
  // text / data
  txt: "text",
  md: "text",
  name: "text",
  sd: "text",
  json: "text",
  js: "text",
  ts: "text",
  jsx: "text",
  tsx: "text",
  csv: "text",
  xml: "text",
  html: "text",
  url: "text",
};

/** Coarse media category for the Type filter; `"other"` for anything unmapped. */
export function fileCategory(path: string): FileCategory {
  return CATEGORY_BY_EXT[extOf(path)] ?? "other";
}

/**
 * Pick the icon for a file-tree row.
 *
 * Folders render {@link FolderOpen} when expanded and {@link Folder} when
 * collapsed (VS Code's open/closed treatment). Files key off their final
 * extension; unknown extensions get {@link FileText}.
 *
 * @param path - Project-relative path (e.g. `chapters/intro.sd`). Only the
 *   basename's final extension matters; directories in the path are ignored.
 * @param isDirectory - True for a folder row.
 * @param expanded - For folders, whether the row is expanded (open glyph).
 */
export function iconForPath(
  path: string,
  isDirectory: boolean,
  expanded = false,
): IconComponent {
  if (isDirectory) {
    return expanded ? FolderOpen : Folder;
  }
  return ICON_BY_EXT[extOf(path)] ?? FileText;
}

/**
 * True when the path is a raster/vector image whose row should show a live
 * thumbnail instead of the {@link Photo} glyph. Derived from the icon map so
 * the image set has a single source of truth (every image ext maps to Photo,
 * and nothing else does).
 */
export function isImagePath(path: string): boolean {
  return ICON_BY_EXT[extOf(path)] === Photo;
}

/**
 * Pick a glyph for a resolved media category. Used for remote (`.url`) assets,
 * whose path extension is always `.url` (→ {@link Link}) but whose *resolved*
 * type (image/audio/video) is inferred from the remote URL — so the row glyph
 * should reflect the medium, not the `.url` wrapper. Unknown → {@link Link}
 * (a generic "remote reference").
 */
export function iconForCategory(category: string | undefined): IconComponent {
  switch (category) {
    case "image":
      return Photo;
    case "audio":
      return Music;
    case "video":
      return Movie;
    case "text":
      return FileText;
    default:
      return Link;
  }
}
