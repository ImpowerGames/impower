import { Color, ColorInformation, Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { colord } from "colord";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";

const getDocumentColors = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): ColorInformation[] => {
  const infos: ColorInformation[] = [];
  const colors = program?.metadata?.colors;
  if (!document || !colors) {
    return infos;
  }
  colors.forEach((c) => {
    const range = Range.create(
      document.positionAt(c.from),
      document.positionAt(c.to)
    );
    const rgb = colord(c.value).toRgb();
    const color = Color.create(rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.a);
    infos.push({ color, range });
  });
  return infos;
};

export default getDocumentColors;
