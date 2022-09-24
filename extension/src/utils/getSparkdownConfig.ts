import * as vscode from "vscode";
import { SparkScreenplayConfig } from "../../../screenplay";

export const getSparkdownConfig = function (
  docuri: vscode.Uri
): SparkScreenplayConfig {
  if (!docuri && vscode.window.activeTextEditor !== undefined) {
    docuri = vscode.window.activeTextEditor.document.uri;
  }
  const pdfConfig = vscode.workspace.getConfiguration("sparkdown.pdf", docuri);
  const generalConfig = vscode.workspace.getConfiguration(
    "sparkdown.general",
    docuri
  );
  return {
    refresh_stats_on_save: generalConfig.refreshStatisticsOnSave,
    embolden_scene_headers: pdfConfig.emboldenSceneHeaders,
    underline_scene_headers: pdfConfig.underlineSceneHeaders,
    embolden_character_names: pdfConfig.emboldenCharacterNames,
    show_page_numbers: pdfConfig.showPageNumbers,
    split_dialogue: pdfConfig.splitDialog,
    print_title_page: pdfConfig.printTitlePage,
    print_profile: pdfConfig.printProfile,
    double_space_between_scenes: pdfConfig.doubleSpaceBetweenScenes,
    print_sections: pdfConfig.printSections,
    print_synopsis: pdfConfig.printSynopsis,
    print_actions: pdfConfig.printActions,
    print_headers: pdfConfig.printHeaders,
    print_dialogues: pdfConfig.printDialogues,
    number_sections: pdfConfig.numberSections,
    use_dual_dialogue: pdfConfig.useDualDialogue,
    print_notes: pdfConfig.printNotes,
    print_header: pdfConfig.pageHeader,
    print_footer: pdfConfig.pageFooter,
    print_watermark: pdfConfig.watermark,
    scenes_numbers: pdfConfig.sceneNumbers,
    each_scene_on_new_page: pdfConfig.eachSceneOnNewPage,
    merge_empty_lines: pdfConfig.mergeEmptyLines,
    create_bookmarks: pdfConfig.createBookmarks,
    invisible_section_bookmarks: pdfConfig.invisibleSectionBookmarks,
    text_more: pdfConfig.textMORE,
    text_contd: pdfConfig.textCONTD,
    text_scene_continued: pdfConfig.textSceneContinued,
    scene_continuation_top: pdfConfig.sceneContinuationTop,
    scene_continuation_bottom: pdfConfig.sceneContinuationBottom,
    synchronized_markup_and_preview: generalConfig.synchronizedMarkupAndPreview,
    preview_theme: generalConfig.previewTheme,
    preview_texture: generalConfig.previewTexture,
    parenthetical_newline_helper: generalConfig.parentheticalNewLineHelper,
  };
};
