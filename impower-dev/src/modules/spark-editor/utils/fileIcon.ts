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

const ICON_BY_EXT: Record<string, IconComponent> = {
  sd: Script,

  txt: FileText,
  md: FileText,
  name: FileText,

  json: FileCode,
  js: FileTypeJs,
  ts: FileTypeTs,
  jsx: FileTypeJsx,
  tsx: FileTypeJsx,
  csv: FileTypeCsv,
  xml: FileTypeXml,

  png: Photo,
  jpg: Photo,
  jpeg: Photo,
  gif: Photo,
  webp: Photo,
  svg: Photo,

  mid: Music,
  mp3: Music,
  ogg: Music,
  wav: Music,
  m4a: Music,

  mp4: Movie,
  webm: Movie,
  mov: Movie,
  m4v: Movie,
  ogv: Movie,
  mkv: Movie,
  avi: Movie,

  synth: WaveSaw,

  url: Link,
  zip: FileZip,
  pdf: FileTypePdf,
  html: FileTypeHtml,
};

export function extOf(path: string): string {
  const basename = path.split("/").slice(-1)[0] ?? path;
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex > 0 ? basename.slice(dotIndex + 1).toLowerCase() : "";
}

export type FileCategory = "image" | "audio" | "video" | "text" | "other";

const CATEGORY_BY_EXT: Record<string, FileCategory> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  ico: "image",
  mid: "audio",
  midi: "audio",
  mp3: "audio",
  ogg: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  mp4: "video",
  webm: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  m4v: "video",
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

export function fileCategory(path: string): FileCategory {
  return CATEGORY_BY_EXT[extOf(path)] ?? "other";
}

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

export function isImagePath(path: string): boolean {
  return ICON_BY_EXT[extOf(path)] === Photo;
}

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
