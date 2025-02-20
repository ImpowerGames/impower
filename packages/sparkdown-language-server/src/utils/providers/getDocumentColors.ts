import { Color, type ColorInformation } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";
import { colord } from "colord";

import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";

export const getDocumentColors = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): ColorInformation[] => {
  const infos: ColorInformation[] = [];
  const colors = program?.metadata?.colors;
  if (!document || !colors) {
    return infos;
  }
  for (const [c, locations] of Object.entries(colors)) {
    for (const location of locations) {
      if (location.uri === document.uri) {
        const rgb = colord(c).toRgb();
        const color = Color.create(
          rgb.r / 255,
          rgb.g / 255,
          rgb.b / 255,
          rgb.a
        );
        infos.push({ color, range: location.range });
      }
    }
  }
  return infos;
};
