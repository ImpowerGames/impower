import { Hover, MarkupKind, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import type { SparkReference } from "@impower/sparkdown/src/types/SparkReference";
import getFencedCode from "./getFencedCode";
import { isAssetOfType } from "./isAsset";

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
      const id = reference.id || "";
      const name = reference.name;
      const asset = program.variables?.[id]?.compiled;
      if (isAssetOfType(asset, "image")) {
        const src = asset.src;
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `![${name}](${src})`,
          },
          range,
        };
      }
      if (id && !reference.declaration) {
        const section = program.sections?.[id];
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
        const variable = program.variables?.[id];
        if (variable) {
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
