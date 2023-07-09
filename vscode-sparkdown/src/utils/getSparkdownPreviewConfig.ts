import * as vscode from "vscode";
import { SparkdownPreviewConfig } from "../types/SparkdownPreviewConfig";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";

export const getSparkdownPreviewConfig = (
  uri: vscode.Uri
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
    screenplay_print_scene_headers_bold:
      screenplayConfig["formatting"].printSceneHeadersBold,
    screenplay_print_sections: screenplayConfig["markup"].printSectionHeaders,
    screenplay_print_synopses: screenplayConfig["markup"].printSynopses,
    screenplay_print_notes: screenplayConfig["markup"].printNotes,
    screenplay_print_scene_numbers:
      screenplayConfig["numbering"].printSceneNumbers,
    screenplay_print_section_numbers:
      screenplayConfig["numbering"].printSectionNumbers,
    screenplay_print_title_page: screenplayConfig["pages"].printTitlePage,
    screenplay_print_profile: screenplayConfig["pdf"].printProfile,
    screenplay_print_dialogue_split_across_pages:
      screenplayConfig["pdf"].composition.pageBreaks
        .printDialogueSplitAcrossPages,
    screenplay_print_dialogue_more:
      screenplayConfig["pdf"].composition.printDialogueMORE,
    screenplay_print_dialogue_contd:
      screenplayConfig["pdf"].composition.printDialogueCONTD,
    screenplay_print_header: screenplayConfig["pdf"].extras.printPageHeader,
    screenplay_print_footer: screenplayConfig["pdf"].extras.printPageFooter,
    screenplay_print_watermark:
      screenplayConfig["pdf"].extras.printPageWatermark,
    screenplay_print_page_numbers:
      screenplayConfig["pdf"].numbering.printPageNumbers,
    screenplay_print_bookmarks:
      screenplayConfig["pdf"].bookmarks.printBookmarks,
    screenplay_print_bookmarks_for_invisible_sections:
      screenplayConfig["pdf"].bookmarks.printBookmarksForInvisibleSections,
    editor_parenthetical_newline_helper:
      editorConfig["parentheticalNewlineHelper"],
    editor_refresh_stats_on_save: editorConfig["refreshStatsOnSave"],
  };
};
