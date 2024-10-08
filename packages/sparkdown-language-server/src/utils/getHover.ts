import { Hover, MarkupKind, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import type { SparkReference } from "@impower/sparkdown/src/types/SparkReference";
import getFencedCode from "./getFencedCode";

const getHover = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined,
  position: Position
): Hover | null => {
  const references = program?.metadata?.lines?.[position.line]?.references;
  if (!document || !references) {
    return null;
  }
  for (let i = 0; i < references.length; i += 1) {
    const reference = references[i]! as SparkReference;
    const range = {
      start: document.positionAt(reference.from),
      end: document.positionAt(reference.to),
    };
    const hoveredOffset = document.offsetAt(position);
    if (hoveredOffset >= reference.from && hoveredOffset <= reference.to) {
      const name = reference.name;
      const asset =
        program.compiled?.structDefs?.["layered_image"]?.[name] ||
        program.compiled?.structDefs?.["image"]?.[name];
      if (asset) {
        if (asset.src) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `<img src="${asset.src}" alt="${name}" width="300px" />`,
            },
            range,
          };
        }
      }
      if (name && !reference.declaration) {
        const section = program.sections?.[name];
        if (section) {
          const fencedCode = getFencedCode(
            `${"".padStart(section.level, "#")} ${section.name}`
          );
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: fencedCode,
            },
            range,
          };
        }
        const variable = program.variables?.[name];
        if (variable && typeof variable?.compiled !== "object") {
          const fencedCode = getFencedCode(
            `: ${JSON.stringify(variable?.compiled)}`
          );
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: fencedCode,
            },
            range,
          };
        }
      }
    }
  }
  return null;
};

export default getHover;
