import type { RailIndexGroup } from "@impower/impower-ui/components";

export type SettingsSectionInfo = {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly detail?: string;
};

export type SettingsScopeInfo = {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly SettingsSectionInfo[];
};

export const SETTINGS_SCOPES = [
  {
    id: "settings-preferences",
    label: "Editor preferences",
    sections: [
      { id: "theme-preferences", label: "Appearance", title: "Appearance" },
      { id: "editor-preferences", label: "Script editor", title: "Script editor" },
      {
        id: "shortcut-preferences",
        label: "Keyboard shortcuts",
        title: "Keyboard shortcuts",
        detail: "Change which keys trigger what actions.",
      },
      {
        id: "preview-preferences",
        label: "Preview",
        title: "Preview",
        detail: "The screenplay preview follows the Screenplay settings; page numbers, dialogue split across pages and bookmarks appear only in exports.",
      },
    ],
  },
  {
    id: "settings-project",
    label: "Project preferences",
    sections: [
      {
        id: "story-details",
        label: "Metadata",
        title: "Project metadata",
        detail: "Written in a front matter block at the top of Main.",
      },
      {
        id: "screenplay-settings",
        label: "Screenplay",
        title: "Screenplay",
        detail: "How your story looks when previewing or exporting it as a screenplay.",
      },
      {
        id: "add-folder-preferences",
        label: "Add menu",
        title: "Add menu",
        detail: "Specify which folders determine what's shown in each Add menu category.",
      },
      {
        id: "file-types",
        label: "File types",
        title: "File types",
        detail: "The file extensions detected by each type of asset.",
      },
      { id: "save-settings", label: "Save & sync", title: "Save & sync" },
    ],
  },
] as const satisfies readonly SettingsScopeInfo[];

export type SettingsSectionId =
  (typeof SETTINGS_SCOPES)[number]["sections"][number]["id"];

export const SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = SETTINGS_SCOPES.flatMap(
  (scope) => scope.sections.map((section) => section.id),
);

export const SETTINGS_INDEX: readonly RailIndexGroup[] = SETTINGS_SCOPES.map((scope) => ({
  id: scope.id,
  label: scope.label,
  items: scope.sections.map((section) => ({ id: section.id, label: section.label })),
}));

export const isSettingsSectionId = (id: string | undefined): id is SettingsSectionId =>
  !!id && (SETTINGS_SECTION_IDS as readonly string[]).includes(id);
