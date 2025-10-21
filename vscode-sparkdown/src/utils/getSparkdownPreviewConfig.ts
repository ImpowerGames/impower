import * as vscode from "vscode";
import { SparkdownPreviewConfig } from "../types/SparkdownPreviewConfig";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";

export const getSparkdownPreviewConfig = (
  uri?: vscode.Uri
): SparkdownPreviewConfig => {
  if (!uri) {
    const activeUri = getActiveSparkdownDocument();
    if (activeUri) {
      uri = activeUri;
    }
  }
  const gameConfig = vscode.workspace.getConfiguration("sparkdown.game", uri);
  const screenplayConfig = vscode.workspace.getConfiguration(
    "sparkdown.screenplay",
    uri
  );
  const editorConfig = vscode.workspace.getConfiguration(
    "sparkdown.editor",
    uri
  );
  return {
    game_preview_synchronized_with_cursor:
      gameConfig["previewSynchronizedWithCursor"],
    screenplay_preview_synchronized_with_cursor:
      screenplayConfig["previewSynchronizedWithCursor"],
    screenplay_preview_theme: screenplayConfig["previewTheme"],
    screenplay_preview_texture: screenplayConfig["previewTexture"],
    screenplay_print_headings_bold:
      screenplayConfig["formatting"].printHeadingsBold,
    screenplay_print_function_identifiers:
      screenplayConfig["markup"].printFunctionIdentifiers,
    screenplay_print_scene_identifiers:
      screenplayConfig["markup"].printSceneIdentifiers,
    screenplay_print_branch_identifiers:
      screenplayConfig["markup"].printBranchIdentifiers,
    screenplay_print_knot_identifiers:
      screenplayConfig["markup"].printKnotIdentifiers,
    screenplay_print_stitch_identifiers:
      screenplayConfig["markup"].printStitchIdentifiers,
    screenplay_print_scene_numbers:
      screenplayConfig["numbering"].printSceneNumbers,
    screenplay_print_title_page: screenplayConfig["pages"].printTitlePage,
    screenplay_print_paper_size: screenplayConfig["pdf"].printPaperSize,
    screenplay_print_dialogue_split_across_pages:
      screenplayConfig["pdf"].composition.pageBreaks
        .printDialogueSplitAcrossPages,
    screenplay_print_dialogue_more:
      screenplayConfig["pdf"].composition.printDialogueMORE,
    screenplay_print_dialogue_contd:
      screenplayConfig["pdf"].composition.printDialogueCONTD,
    screenplay_print_page_numbers:
      screenplayConfig["pdf"].numbering.printPageNumbers,
    screenplay_print_bookmarks:
      screenplayConfig["pdf"].bookmarks.printBookmarks,
    screenplay_print_bookmarks_for_invisible_headings:
      screenplayConfig["pdf"].bookmarks.printBookmarksForInvisibleHeadings,
    editor_newline_helper: editorConfig["newlineHelper"],
    editor_refresh_stats_on_save: editorConfig["refreshStatsOnSave"],
  };
};
