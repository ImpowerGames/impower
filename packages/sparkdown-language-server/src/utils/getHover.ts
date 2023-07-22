import {
  CompletionItemKind,
  Hover,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";

const getImageCompletions = (program: SparkProgram | undefined) => {
  if (!program) {
    return [];
  }
  return Object.entries(program?.objectMap?.["image"] || {}).map(
    ([name, { src, type }]) => ({
      label: name,
      labelDetails: { description: type },
      kind: CompletionItemKind.Constructor,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `![${name}](${src})`,
      },
    })
  );
};

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
    const reference = references[i]!;
    const hoveredOffset = document.offsetAt(position);
    if (hoveredOffset >= reference.from && hoveredOffset <= reference.to) {
      const name = reference.name;
      const imageAsset = program?.objectMap?.["image"]?.[name];
      if (imageAsset) {
        const src = imageAsset.src;
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `![${name}](${src})`,
          },
          range: {
            start: document.positionAt(reference.from),
            end: document.positionAt(reference.to),
          },
        };
      }
    }
  }
  return null;
};

export default getHover;
