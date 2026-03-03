import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkProgram } from "@impower/sparkdown/src/compiler";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { colord } from "colord";
import { Color, type ColorInformation } from "vscode-languageserver";

const STYLING_DEFINE_TYPES = GRAMMAR_DEFINITION.variables.STYLING_DEFINE_TYPES;

export const getDocumentColors = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations,
  program: SparkProgram | undefined,
): ColorInformation[] => {
  const infos: ColorInformation[] = [];
  if (!document) {
    return infos;
  }
  const cur = annotations.colors.iter();
  while (cur.value) {
    if (cur.value.type.possibleColorReference) {
      const text = document.read(cur.from, cur.to);
      const [pathPart1, pathPart2] = text.split(".");
      const type = pathPart2 ? pathPart1 : "";
      const name = pathPart2 ? pathPart2 : pathPart1;
      if (name) {
        const declarationStructType = cur.value.type.declaration?.type || "";
        if (
          type === "color" ||
          STYLING_DEFINE_TYPES.includes(declarationStructType)
        ) {
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
            infos.push({
              color,
              range: document.range(cur.from, cur.to),
            });
          }
        }
      }
    } else {
      const text = document.read(cur.from, cur.to);
      const rgb = colord(text).toRgb();
      const color = Color.create(rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.a);
      infos.push({
        color,
        range: document.range(cur.from, cur.to),
      });
    }
    cur.next();
  }
  return infos;
};
