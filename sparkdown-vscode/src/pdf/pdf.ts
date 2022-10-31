import * as vscode from "vscode";
import {
  printProfiles,
  SparkScreenplayConfig,
} from "../../../spark-screenplay";
import { SparkParseResult, SparkSectionToken } from "../../../sparkdown";
import { Liner } from "./liner";
import {
  generatePdf,
  generatePdfStats,
  PdfOptions,
  PdfStats,
} from "./pdfmaker";

//Creates the PDF, or returns stats if output path is "$STATS$"
export const createPdf = async (
  context: vscode.ExtensionContext,
  outputPath: string,
  screenplayConfig: SparkScreenplayConfig,
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
    const hiddenTitleTokens = parsedDocument.titleTokens["hidden"] || [];
    for (let index = 0; index < hiddenTitleTokens.length; index++) {
      const titleToken = hiddenTitleTokens[index];
      if (titleToken) {
        const text = titleToken.text?.trimEnd();
        if (titleToken.type === "watermark") {
          watermark = text;
        }
        if (titleToken.type === "header") {
          header = text;
        }
        if (titleToken.type === "footer") {
          footer = text;
        }
        if (titleToken.type === "font") {
          font = text;
        }
      }
    }
  }
  let currentIndex = 0;

  const sceneInvisibleSections: Record<string | number, SparkSectionToken[]> =
    {};
  // tidy up separators
  let invisibleSections = [];
  while (currentIndex < parsedDocument.tokens.length) {
    const currentToken = parsedDocument.tokens[currentIndex];
    if (!currentToken) {
      break;
    }
    if (
      currentToken.type === "dual_dialogue_start" ||
      currentToken.type === "dialogue_start" ||
      currentToken.type === "dialogue_end" ||
      currentToken.type === "dual_dialogue_end" ||
      (!screenplayConfig.screenplay_print_notes &&
        (currentToken.type === "note" ||
          currentToken.type === "assets" ||
          currentToken.type === "dialogue_asset" ||
          currentToken.type === "action_asset")) ||
      (!screenplayConfig.screenplay_print_sections &&
        currentToken.type === "section") ||
      (!screenplayConfig.screenplay_print_synopses &&
        currentToken.type === "synopsis")
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

    currentIndex++;
  }

  // clean separators at the end
  while (
    parsedDocument.tokens.length > 0 &&
    parsedDocument.tokens[parsedDocument.tokens.length - 1]?.type ===
      "separator"
  ) {
    parsedDocument.tokens.pop();
  }

  if (!screenplayConfig.screenplay_print_watermark && watermark !== undefined) {
    screenplayConfig.screenplay_print_watermark = watermark;
  }
  if (!screenplayConfig.screenplay_print_header && header !== undefined) {
    screenplayConfig.screenplay_print_header = header;
  }
  if (!screenplayConfig.screenplay_print_footer && footer !== undefined) {
    screenplayConfig.screenplay_print_footer = footer;
  }

  const lines = liner.line(parsedDocument.tokens, {
    print:
      printProfiles[screenplayConfig.screenplay_print_profile] ||
      printProfiles.usletter,
    screenplay_print_dialogue_more:
      screenplayConfig.screenplay_print_dialogue_more,
    screenplay_print_dialogue_contd:
      screenplayConfig.screenplay_print_dialogue_contd,
    screenplay_print_dialogue_split_across_pages: true,
  });

  const pdfOptions: PdfOptions = {
    filepath: outputPath,
    parsed: parsedDocument,
    lines: lines,
    print:
      printProfiles[screenplayConfig.screenplay_print_profile] ||
      printProfiles.usletter,
    screenplayConfig: screenplayConfig,
    font: font,
    sceneInvisibleSections,
  };

  if (outputPath === "$STATS$") {
    return generatePdfStats(context, pdfOptions);
  } else {
    generatePdf(context, pdfOptions, progress);
  }
};
