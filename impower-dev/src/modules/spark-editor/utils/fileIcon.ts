import {
  BracketsIcon,
  FolderIcon,
  type IconComponent,
  ImageIcon,
  LinkIcon,
  MusicIcon,
  OtherIcon,
  SoundSpeakerIcon,
  StoryIcon,
  TextIcon,
  VideoIcon,
} from "@impower/impower-ui/icons";

const ICON_BY_EXT: Record<string, IconComponent> = {
  sd: StoryIcon,

  txt: TextIcon,
  md: TextIcon,
  name: TextIcon,

  json: BracketsIcon,
  js: BracketsIcon,
  ts: BracketsIcon,
  jsx: BracketsIcon,
  tsx: BracketsIcon,
  csv: BracketsIcon,
  xml: BracketsIcon,

  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  gif: ImageIcon,
  webp: ImageIcon,
  svg: ImageIcon,

  mid: MusicIcon,
  mp3: MusicIcon,
  ogg: MusicIcon,
  wav: MusicIcon,
  m4a: MusicIcon,

  mp4: VideoIcon,
  webm: VideoIcon,
  mov: VideoIcon,
  m4v: VideoIcon,
  ogv: VideoIcon,
  mkv: VideoIcon,
  avi: VideoIcon,

  synth: SoundSpeakerIcon,

  url: LinkIcon,
  zip: OtherIcon,
  pdf: OtherIcon,
  html: BracketsIcon,
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
): IconComponent {
  if (isDirectory) {
    return FolderIcon;
  }
  return ICON_BY_EXT[extOf(path)] ?? TextIcon;
}

export function isImagePath(path: string): boolean {
  return ICON_BY_EXT[extOf(path)] === ImageIcon;
}

export function iconForCategory(category: string | undefined): IconComponent {
  switch (category) {
    case "image":
      return ImageIcon;
    case "audio":
      return MusicIcon;
    case "video":
      return VideoIcon;
    case "text":
      return TextIcon;
    default:
      return LinkIcon;
  }
}
