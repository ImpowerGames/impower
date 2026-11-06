import type {
  ProjectSettingKey,
  ProjectSettings,
} from "../workspace/settings/settingsSchema";

export const ADD_MENU_KINDS = ["backdrop", "portrait", "music", "sound"] as const;

export type AddMenuKind = (typeof ADD_MENU_KINDS)[number];

export type AddMenuFolders = Readonly<Record<AddMenuKind, string>>;

export const ADD_MENU_FOLDER_SETTINGS = {
  backdrop: "addFolderBackdrop",
  portrait: "addFolderPortrait",
  music: "addFolderMusic",
  sound: "addFolderSound",
} as const satisfies Record<AddMenuKind, ProjectSettingKey>;

export const ADD_MENU_FILE_TYPES = {
  backdrop: "image",
  portrait: "image",
  music: "audio",
  sound: "audio",
} as const satisfies Record<AddMenuKind, string>;

const ASSETS_ROOT = "assets";

export const addMenuFolders = (settings: ProjectSettings): AddMenuFolders => ({
  backdrop: settings.addFolderBackdrop,
  portrait: settings.addFolderPortrait,
  music: settings.addFolderMusic,
  sound: settings.addFolderSound,
});

export interface AddMenuCandidate {
  readonly path: string;
  readonly type: string;
}

export const addMenuKindOf = (
  { path, type }: AddMenuCandidate,
  folders: AddMenuFolders,
): AddMenuKind | undefined => {
  const parts = path.split("/");
  if (parts.length < 3 || parts[0]!.toLowerCase() !== ASSETS_ROOT) {
    return undefined;
  }
  const kinds = ADD_MENU_KINDS.filter((kind) => ADD_MENU_FILE_TYPES[kind] === type);
  for (let at = parts.length - 2; at >= 1; at -= 1) {
    const name = parts[at]!.toLowerCase();
    const kind = kinds.find((k) => folders[k].toLowerCase() === name);
    if (kind) {
      return kind;
    }
  }
  return undefined;
};

export const addMenuFiles = <T extends AddMenuCandidate>(
  candidates: Iterable<T>,
  kind: AddMenuKind,
  folders: AddMenuFolders,
): T[] => [...candidates].filter((candidate) => addMenuKindOf(candidate, folders) === kind);

export const addMenuFolderProblem = (name: string): string | undefined => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "A folder name can't be empty";
  }
  if (/[\\/]/.test(trimmed)) {
    return "A folder name can't contain a slash";
  }
  return undefined;
};
