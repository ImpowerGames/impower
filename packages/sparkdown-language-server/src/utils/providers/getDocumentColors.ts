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
  const read = (from: number, to: number) =>
    document.getText({
      start: document.positionAt(from),
      end: document.positionAt(to),
    });
  const cur = annotations.colors.iter();
  while (cur.value) {
    const text = read(cur.from, cur.to);
    const rgb = colord(text).toRgb();
    const color = Color.create(rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.a);
    infos.push({
      color,
      range: {
        start: document.positionAt(cur.from),
        end: document.positionAt(cur.to),
      },
    });
    cur.next();
  }
  return infos;
};
