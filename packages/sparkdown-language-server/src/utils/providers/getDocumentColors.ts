import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { colord } from "colord";
import { Color, type ColorInformation } from "vscode-languageserver";

export const getDocumentColors = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations
): ColorInformation[] => {
  const infos: ColorInformation[] = [];
  if (!document) {
    return infos;
  }
  const cur = annotations.colors.iter();
  while (cur.value) {
    const text = document.read(cur.from, cur.to);
    const rgb = colord(text).toRgb();
    const color = Color.create(rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.a);
    infos.push({
      color,
      range: document.range(cur.from, cur.to),
    });
    cur.next();
  }
  return infos;
};
