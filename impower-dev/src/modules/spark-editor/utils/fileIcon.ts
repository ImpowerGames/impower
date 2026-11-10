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
import { assetEndings } from "./assetTypes";

const configuredCategory = (ext: string): "image" | "audio" | undefined => {
  const { image, audio } = assetEndings.value;
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
