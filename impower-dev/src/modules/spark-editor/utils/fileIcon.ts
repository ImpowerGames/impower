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
import { signal } from "@preact/signals";
import { patternEndings } from "../workspace/settings/fileEndings";

type ConfiguredCategory = "image" | "audio";

const configuredEndings = signal<Readonly<Record<ConfiguredCategory, readonly string[]>>>({
  image: [],
  audio: [],
});

export const setAssetFiles = ({ imageFiles, audioFiles }: { imageFiles: string; audioFiles: string }): void => {
  configuredEndings.value = { image: patternEndings(imageFiles), audio: patternEndings(audioFiles) };
};

const configuredCategory = (ext: string): ConfiguredCategory | undefined => {
  const { image, audio } = configuredEndings.value;
  return image.includes(ext) ? "image" : audio.includes(ext) ? "audio" : undefined;
};

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
  const ext = extOf(path);
  return configuredCategory(ext) ?? CATEGORY_BY_EXT[ext] ?? "other";
}

export function iconForPath(
  path: string,
  isDirectory: boolean,
): IconComponent {
  if (isDirectory) {
    return FolderIcon;
  }
  const ext = extOf(path);
  const configured = configuredCategory(ext);
  if (configured) {
    return configured === "image" ? ImageIcon : MusicIcon;
  }
  return ICON_BY_EXT[ext] ?? TextIcon;
}

export function isImagePath(path: string): boolean {
  return iconForPath(path, false) === ImageIcon;
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
