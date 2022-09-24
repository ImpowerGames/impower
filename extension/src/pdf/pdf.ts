import * as vscode from "vscode";
import { printProfiles, SparkScreenplayConfig } from "../../../screenplay";
import { SparkParseResult, SparkSectionToken } from "../../../sparkdown";
import { ExportConfig } from "../types/ExportConfig";
import { createSeparator, Liner } from "./liner";
import {
  generatePdf,
  generatePdfStats,
  PdfOptions,
  PdfStats,
} from "./pdfmaker";

//Creates the PDF, or returns stats if output path is "$STATS$"
export const createPdf = async (
  outputPath: string,
  screenplayConfig: SparkScreenplayConfig,
  exportConfig: ExportConfig | undefined,
  parsedDocument: SparkParseResult,
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<PdfStats | void> => {
  if (progress) {
    progress.report({
      message: "Converting to individual lines",
      increment: 25,
    });
  }
  const liner = new Liner();
  let watermark = undefined;
  let header = undefined;
  let footer = undefined;
  let font = "Courier Prime";
  if (parsedDocument.titleTokens) {
    for (
      let index = 0;
      index < parsedDocument.titleTokens["hidden"].length;
      index++
    ) {
      if (parsedDocument.titleTokens["hidden"][index].type === "watermark") {
        watermark = parsedDocument.titleTokens["hidden"][index].content;
      }
      if (parsedDocument.titleTokens["hidden"][index].type === "header") {
        header = parsedDocument.titleTokens["hidden"][index].content;
      }
      if (parsedDocument.titleTokens["hidden"][index].type === "footer") {
        footer = parsedDocument.titleTokens["hidden"][index].content;
      }
      if (parsedDocument.titleTokens["hidden"][index].type === "font") {
        font = parsedDocument.titleTokens["hidden"][index].content;
      }
    }
  }
  let currentIndex = 0;
  let previousType: string | null = null;

  const sceneInvisibleSections: Record<string | number, SparkSectionToken[]> =
    {};
  // tidy up separators
  let invisibleSections = [];
  while (currentIndex < parsedDocument.tokens.length) {
    const currentToken = parsedDocument.tokens[currentIndex];

    if (
      currentToken.type === "dual_dialogue_start" ||
      currentToken.type === "dialogue_start" ||
      currentToken.type === "dialogue_end" ||
      currentToken.type === "dual_dialogue_end" ||
      (!screenplayConfig.print_actions &&
        ["action", "transition", "centered", "shot"].includes(
          currentToken.type
        )) ||
      (!screenplayConfig.print_notes && currentToken.type === "note") ||
      (!screenplayConfig.print_headers && currentToken.type === "scene") ||
      (!screenplayConfig.print_sections && currentToken.type === "section") ||
      (!screenplayConfig.print_synopsis && currentToken.type === "synopsis") ||
      (!screenplayConfig.print_dialogues &&
        ["character", "parenthetical", "dialogue"].includes(
          currentToken.type
        )) ||
      (screenplayConfig.merge_empty_lines &&
        currentToken.type === "separator" &&
        previousType === "separator")
    ) {
      if (currentToken.type === "section") {
        //on the next scene header, add an invisible section (for keeping track of sections when creating bookmarks and generating pdf-side)
        invisibleSections.push(currentToken);
      }
      parsedDocument.tokens.splice(currentIndex, 1);

      continue;
    }
    if (currentToken.type === "scene") {
      if (invisibleSections.length > 0) {
        sceneInvisibleSections[currentToken.scene] = invisibleSections;
      }
      invisibleSections = [];
    }

    if (
      screenplayConfig.double_space_between_scenes &&
      currentToken.type === "scene" &&
      currentToken.scene !== 1
    ) {
      const additionalSeparator = createSeparator(
        parsedDocument.tokens[currentIndex].from,
        parsedDocument.tokens[currentIndex].to
      );
      parsedDocument.tokens.splice(currentIndex, 0, additionalSeparator);
      currentIndex++;
    }
    previousType = currentToken.type;
    currentIndex++;
  }

  // clean separators at the end
  while (
    parsedDocument.tokens.length > 0 &&
    parsedDocument.tokens[parsedDocument.tokens.length - 1].type === "separator"
  ) {
    parsedDocument.tokens.pop();
  }

  if (!screenplayConfig.print_watermark && watermark !== undefined) {
    screenplayConfig.print_watermark = watermark;
  }
  if (!screenplayConfig.print_header && header !== undefined) {
    screenplayConfig.print_header = header;
  }
  if (!screenplayConfig.print_footer && footer !== undefined) {
    screenplayConfig.print_footer = footer;
  }

  const lines = liner.line(parsedDocument.tokens, {
    print: printProfiles[screenplayConfig.print_profile],
    text_more: screenplayConfig.text_more,
    text_contd: screenplayConfig.text_contd,
    split_dialogue: true,
  });

  const pdfOptions: PdfOptions = {
    filepath: outputPath,
    parsed: parsedDocument,
    lines: lines,
    print: printProfiles[screenplayConfig.print_profile],
    screenplayConfig: screenplayConfig,
    font: font,
    exportConfig: exportConfig,
    sceneInvisibleSections,
  };

  if (outputPath === "$STATS$") {
    return generatePdfStats(pdfOptions);
  } else {
    generatePdf(pdfOptions, progress);
  }
};
