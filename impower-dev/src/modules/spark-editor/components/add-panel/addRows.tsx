import {
  AccountIcon,
  ArtIcon,
  BranchIcon,
  ChooseIcon,
  DialogueIcon,
  FaceIcon,
  SceneIcon,
  SoundIcon,
  VolumeIcon,
  type IconComponent,
} from "@impower/impower-ui/components";
import {
  TOP_LEVEL_CONSTRUCTS,
  type InsertConstruct,
} from "@impower/codemirror-vscode-lsp-client/src/insert";

import type { AddMenuKind } from "../../utils/addMenuFolders";

export type PickerWording = {
  kind: AddMenuKind;
  audition: "picture" | "sound";
  thumbnailPreference: boolean;
  use: string;
  empty: string;
  emptyHelp: (folder: string) => string;
  idle: string;
  active: string;
  browse: string;
  previous: string;
  next: string;
};

export type AddRow = {
  construct: InsertConstruct;
  Icon: IconComponent;
  label: string;
  help: string;
  picker?: PickerWording;
};

export type PickerRow = AddRow & { picker: PickerWording };

export const ADD_ROWS: readonly AddRow[] = [
  {
    construct: "character",
    Icon: AccountIcon,
    label: "Character",
    help: "Define a new character.",
  },
  {
    construct: "scene",
    Icon: SceneIcon,
    label: "Scene",
    help: "Start a new part of the story.",
  },
  {
    construct: "branch",
    Icon: BranchIcon,
    label: "Branch",
    help: "Create a named path inside this scene.",
  },
  {
    construct: "choose",
    Icon: ChooseIcon,
    label: "Choice Menu",
    help: "Present the reader with a decision.",
  },
  {
    construct: "dialogue",
    Icon: DialogueIcon,
    label: "Dialogue",
    help: "Give a character something to say.",
  },
  {
    construct: "backdrop",
    Icon: ArtIcon,
    label: "Backdrop",
    help: "Change the location in the background.",
    picker: {
      kind: "backdrop",
      audition: "picture",
      thumbnailPreference: false,
      use: "Use backdrop",
      empty: "No backdrops yet.",
      emptyHelp: (folder) => `Pictures in a folder called ${folder} are listed here.`,
      idle: "Select to preview",
      active: "Previewing",
      browse: "Browse backdrop options",
      previous: "Previous backdrops",
      next: "Next backdrops",
    },
  },
  {
    construct: "portrait",
    Icon: FaceIcon,
    label: "Portrait",
    help: "Show a character or expression.",
    picker: {
      kind: "portrait",
      audition: "picture",
      thumbnailPreference: true,
      use: "Use portrait",
      empty: "No portraits yet.",
      emptyHelp: (folder) => `Pictures in a folder called ${folder} are listed here.`,
      idle: "Select to preview",
      active: "Previewing",
      browse: "Browse portrait options",
      previous: "Previous portraits",
      next: "Next portraits",
    },
  },
  {
    construct: "sound",
    Icon: VolumeIcon,
    label: "Sound",
    help: "Play a sound effect.",
    picker: {
      kind: "sound",
      audition: "sound",
      thumbnailPreference: false,
      use: "Use sound",
      empty: "No sounds yet.",
      emptyHelp: (folder) => `Sounds in a folder called ${folder} are listed here.`,
      idle: "Select to listen",
      active: "Playing",
      browse: "Browse sound options",
      previous: "Previous sounds",
      next: "Next sounds",
    },
  },
  {
    construct: "music",
    Icon: SoundIcon,
    label: "Music",
    help: "Play background music.",
    picker: {
      kind: "music",
      audition: "sound",
      thumbnailPreference: false,
      use: "Use music",
      empty: "No music yet.",
      emptyHelp: (folder) => `Sounds in a folder called ${folder} are listed here.`,
      idle: "Select to listen",
      active: "Playing",
      browse: "Browse music options",
      previous: "Previous music",
      next: "Next music",
    },
  },
];

export const isPickerRow = (row: AddRow): row is PickerRow => !!row.picker;

export const rowDisabled = (row: AddRow, inScene: boolean | undefined) =>
  inScene === false && !TOP_LEVEL_CONSTRUCTS.includes(row.construct);
