import { ConfigureScreenplayParams } from "@impower/spark-editor-protocol/src";
import * as vscode from "vscode";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";

export const getConfigureScreenplayParams = (
  textDocumentUri: string
): ConfigureScreenplayParams => {
  const configuration = getSparkdownPreviewConfig(
    vscode.Uri.parse(textDocumentUri)
  );
  return {
    textDocument: { uri: textDocumentUri },
    options: {
      scrollSynced: configuration.screenplay_preview_synchronized_with_cursor,
      theme: configuration.screenplay_preview_theme,
      texture: configuration.screenplay_preview_texture,
      paperProfile: configuration.screenplay_print_profile,
      boldSceneHeaders: configuration.screenplay_print_scene_headers_bold,
      printSections: configuration.screenplay_print_sections,
      printSynopses: configuration.screenplay_print_synopses,
      printNotes: configuration.screenplay_print_notes,
      printTitlePage: configuration.screenplay_print_title_page,
      printPageNumbers: configuration.screenplay_print_page_numbers,
      printSectionNumbers: configuration.screenplay_print_section_numbers,
      printSceneNumbers: configuration.screenplay_print_scene_numbers,
      splitDialogueAcrossPages:
        configuration.screenplay_print_dialogue_split_across_pages,
      moreDialogueText: configuration.screenplay_print_dialogue_more,
      continuedDialogueText: configuration.screenplay_print_dialogue_contd,
      headerText: configuration.screenplay_print_header,
      footerText: configuration.screenplay_print_footer,
      watermarkText: configuration.screenplay_print_watermark,
    },
  };
};
