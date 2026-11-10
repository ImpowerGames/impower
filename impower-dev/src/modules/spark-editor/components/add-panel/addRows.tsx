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
} from "@impower/impower-ui/components";
import {
  TOP_LEVEL_CONSTRUCTS,
  type InsertConstruct,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import type { ComponentChildren } from "preact";

export type AddRow = {
  construct: InsertConstruct;
  icon: ComponentChildren;
  label: string;
  help: string;
  picker: boolean;
};

export const ADD_ROWS: readonly AddRow[] = [
  {
    construct: "character",
    icon: <AccountIcon />,
    label: "Character",
    help: "Define a new character.",
    picker: false,
  },
  {
    construct: "scene",
    icon: <SceneIcon />,
    label: "Scene",
    help: "Start a new part of the story.",
    picker: false,
  },
  {
    construct: "branch",
    icon: <BranchIcon />,
    label: "Branch",
    help: "Create a named path inside this scene.",
    picker: false,
  },
  {
    construct: "choose",
    icon: <ChooseIcon />,
    label: "Choice Menu",
    help: "Present the reader with a decision.",
    picker: false,
  },
  {
    construct: "dialogue",
    icon: <DialogueIcon />,
    label: "Dialogue",
    help: "Give a character something to say.",
    picker: false,
  },
  {
    construct: "backdrop",
    icon: <ArtIcon />,
    label: "Backdrop",
    help: "Change the location in the background.",
    picker: true,
  },
  {
    construct: "portrait",
    icon: <FaceIcon />,
    label: "Portrait",
    help: "Show a character or expression.",
    picker: true,
  },
  {
    construct: "sound",
    icon: <VolumeIcon />,
    label: "Sound",
    help: "Play a sound effect.",
    picker: true,
  },
  {
    construct: "music",
    icon: <SoundIcon />,
    label: "Music",
    help: "Play background music.",
    picker: true,
  },
];

export const rowDisabled = (row: AddRow, inScene: boolean | undefined) =>
  inScene === false && !TOP_LEVEL_CONSTRUCTS.includes(row.construct);
