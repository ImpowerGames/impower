import type { ScreenplayConfig } from "../../../../../../packages/sparkdown-screenplay/src/types/ScreenplayConfig";
import type { ProjectSettingKey, ProjectSettings } from "./settingsSchema";

export const SCREENPLAY_SETTING_KEYS = [
  "screenplayTitlePage",
  "screenplayHeadingsBold",
  "screenplaySceneNumbers",
  "screenplaySceneNames",
  "screenplayBranchNames",
  "screenplayKnotNames",
  "screenplayPaperSize",
  "screenplayPageNumbers",
  "screenplaySplitDialogue",
  "screenplayMore",
  "screenplayContd",
  "screenplayBookmarks",
  "screenplayHiddenBookmarks",
] as const satisfies readonly ProjectSettingKey[];

type Labels<V extends string> = readonly { readonly value: V; readonly label: string }[];

export const SCENE_NUMBER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "left", label: "Left margin" },
  { value: "right", label: "Right margin" },
  { value: "both", label: "Both margins" },
] as const satisfies Labels<ProjectSettings["screenplaySceneNumbers"]>;

export const PAPER_SIZE_OPTIONS = [
  { value: "usletter", label: "US Letter" },
  { value: "a4", label: "A4" },
] as const satisfies Labels<ProjectSettings["screenplayPaperSize"]>;

const SCENE_NUMBER_SUMMARY: Record<ProjectSettings["screenplaySceneNumbers"], string> = {
  none: "No scene numbers",
  left: "Scene numbers on the left",
  right: "Scene numbers on the right",
  both: "Scene numbers on both sides",
};

export const screenplaySummary = (settings: ProjectSettings): string =>
  [
    PAPER_SIZE_OPTIONS.find((option) => option.value === settings.screenplayPaperSize)!.label,
    settings.screenplayTitlePage ? "Title page" : "No title page",
    SCENE_NUMBER_SUMMARY[settings.screenplaySceneNumbers],
  ].join(" · ");

export const screenplayConfig = (settings: ProjectSettings): ScreenplayConfig => ({
  screenplay_print_title_page: settings.screenplayTitlePage,
  screenplay_print_headings_bold: settings.screenplayHeadingsBold,
  screenplay_print_scene_numbers: settings.screenplaySceneNumbers,
  screenplay_print_scene_identifiers: settings.screenplaySceneNames,
  screenplay_print_branch_identifiers: settings.screenplayBranchNames,
  screenplay_print_knot_identifiers: settings.screenplayKnotNames,
  screenplay_print_stitch_identifiers: settings.screenplayKnotNames,
  screenplay_print_paper_size: settings.screenplayPaperSize,
  screenplay_print_page_numbers: settings.screenplayPageNumbers,
  screenplay_print_dialogue_split_across_pages: settings.screenplaySplitDialogue,
  screenplay_print_dialogue_more: settings.screenplayMore,
  screenplay_print_dialogue_contd: settings.screenplayContd,
  screenplay_print_bookmarks: settings.screenplayBookmarks,
  screenplay_print_bookmarks_for_invisible_headings: settings.screenplayHiddenBookmarks,
});
