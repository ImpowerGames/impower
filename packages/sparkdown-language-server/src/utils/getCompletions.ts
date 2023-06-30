import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  InsertTextMode,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { getBlockMatch } from "@impower/sparkdown/src/utils/getBlockMatch";
import { getBlockType } from "@impower/sparkdown/src/utils/getBlockType";
import getFencedCode from "./getFencedCode";
import getLineText from "./getLineText";
import getUniqueOptions from "./getUniqueOptions";

const getSceneCompletions = () => {
  return [
    {
      label: "INT.",
      labelDetails: {
        description: "Interior Scene",
      },
      detail: "An indoor scene",
      documentation: {
        kind: MarkupKind.Markdown,
        value: getFencedCode(`INT. BEDROOM - NIGHT`),
      },
      insertText: "INT. ${1:LOCATION} - ${2:TIME}",
      insertTextFormat: InsertTextFormat.Snippet,
      insertTextMode: InsertTextMode.adjustIndentation,
      kind: CompletionItemKind.Interface,
    },
    {
      label: "EXT.",
      labelDetails: {
        description: "Exterior Scene",
      },
      detail: "An outdoor scene",
      documentation: {
        kind: MarkupKind.Markdown,
        value: getFencedCode(`EXT. BEACH - DAY`),
      },
      insertText: "EXT. ${1:LOCATION} - ${2:TIME}",
      insertTextFormat: InsertTextFormat.Snippet,
      insertTextMode: InsertTextMode.adjustIndentation,
      kind: CompletionItemKind.Interface,
    },
    {
      label: "INT./EXT.",
      labelDetails: {
        description: "Intercut Scene",
      },
      detail: "A scene that is intercut between indoors and outdoors",
      documentation: {
        kind: MarkupKind.Markdown,
        value: getFencedCode(`INT./EXT. PHONE BOOTH`),
      },
      insertText: "INT./EXT. ${1:LOCATION} - ${2:TIME}",
      insertTextFormat: InsertTextFormat.Snippet,
      insertTextMode: InsertTextMode.adjustIndentation,
      kind: CompletionItemKind.Interface,
    },
  ];
};
const getSceneCaptureCompletions = (
  match: string[],
  program: SparkProgram | undefined
) => {
  const location = match[3];
  const dash = match[5];
  const time = match[7];
  if (!location) {
    const locations = getUniqueOptions(
      program?.metadata.scenes?.map((s) => s.location)
    );
    return locations.map((location) => ({
      label: location,
      kind: CompletionItemKind.Module,
    }));
  }
  if (dash && !time) {
    const times = getUniqueOptions([
      ...(program?.metadata.scenes?.map((s) => s.time) || []),
      "DAY",
      "NIGHT",
    ]);
    return times.map((time) => ({
      label: time,
      kind: CompletionItemKind.Module,
    }));
  }
  return [];
};

const getCompletions = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined,
  position: Position,
  context: CompletionContext | undefined
): CompletionItem[] => {
  if (!document) {
    return [];
  }
  const lineText = getLineText(document, position);
  const triggerCharacter = context?.triggerCharacter;
  if (triggerCharacter === "\n" || triggerCharacter === "\r") {
    return [];
  }
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopeName = program?.scopes?.[lineMetadata?.scope ?? -1];
  if (!scopeName) {
    const match = getBlockMatch(lineText);
    const blockType = getBlockType(match);
    if (match) {
      if (blockType === "scene" && triggerCharacter === " ") {
        return getSceneCaptureCompletions(match, program);
      }
    } else {
      if (!triggerCharacter) {
        return getSceneCompletions();
      }
    }
  }
  return [];
};

export default getCompletions;
