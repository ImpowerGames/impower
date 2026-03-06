import { SparkProgram } from "@impower/sparkdown/src/compiler";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { colord } from "colord";
import { Color, type ColorInformation } from "vscode-languageserver";

const IDENTIFIER_REGEX = /^[_\p{L}][_\p{L}0-9-]*$/u;

export const getDocumentColors = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations,
  program: SparkProgram | undefined,
): ColorInformation[] => {
  if (!document) {
    return [];
  }
  const cur = annotations.colors.iter();
  const infoMap = new Map<Number, ColorInformation>();
  const compiledColorAnnotations = program?.colorAnnotations?.[document.uri];
  if (compiledColorAnnotations) {
    for (const range of compiledColorAnnotations) {
      const text = document.getText(range);
      const color = getColor(text, program, false);
      if (color) {
        infoMap.set(document.offsetAt(range.start), { color, range });
      }
    }
  }
  while (cur.value) {
    const text = document.read(cur.from, cur.to);
    const color = getColor(text, program, true);
    if (color) {
      infoMap.set(cur.from, { color, range: document.range(cur.from, cur.to) });
    }
    cur.next();
  }
  return Array.from(infoMap.values());
};

const stripQuotes = (str: string): string => {
  return str.replace(/^(['"])(.*)\1$/, "$2");
};

const getColor = (
  text: string,
  program: SparkProgram | undefined,
  requireValidReference: boolean,
) => {
  if (text === "transparent") {
    const color = Color.create(0, 0, 0, 0);
    return color;
  }
  if (text.startsWith("color.") || IDENTIFIER_REGEX.test(text)) {
    const [pathPart1, pathPart2] = text.split(".");
    const name = pathPart2 ? pathPart2 : pathPart1;
    if (name) {
      const colorStruct = program?.context?.["color"]?.[name];
      if (colorStruct) {
        const value = colorStruct.value;
        const rgb = colord(value).toRgb();
        const color = Color.create(
          rgb.r / 255,
          rgb.g / 255,
          rgb.b / 255,
          rgb.a,
        );
        return color;
      }
    }
    if (requireValidReference) {
      // Could not find a matching defined color
      return null;
    }
  }
  const trimmedText = stripQuotes(text);
  if (trimmedText) {
    const rgb = colord(trimmedText).toRgb();
    return Color.create(rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.a);
  }
  return null;
};
