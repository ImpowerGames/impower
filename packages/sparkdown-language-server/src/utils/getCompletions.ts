import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { getBlockMatch } from "@impower/sparkdown/src/utils/getBlockMatch";
import { getBlockType } from "@impower/sparkdown/src/utils/getBlockType";
import getDocumentation from "./getFencedCode";
import getLineText from "./getLineText";
import getUniqueOptions from "./getUniqueOptions";

const getSceneCompletions = () => {
  return [
    {
      label: "INT.",
      labelDetails: { description: "Interior Scene" },
      kind: CompletionItemKind.Class,
      documentation: {
        kind: MarkupKind.Markdown,
        value: getDocumentation("An indoor scene.", `INT. BEDROOM - NIGHT`),
      },
    },
    {
      label: "EXT.",
      labelDetails: { description: "Exterior Scene" },
      kind: CompletionItemKind.Class,
      documentation: {
        kind: MarkupKind.Markdown,
        value: getDocumentation("An outdoor scene.", `EXT. BEACH - DAY`),
      },
    },
    {
      label: "INT./EXT.",
      labelDetails: { description: "Intercut Scene" },
      kind: CompletionItemKind.Class,
      documentation: {
        kind: MarkupKind.Markdown,
        value: getDocumentation(
          "A scene that is intercut between indoors and outdoors.",
          `INT./EXT. PHONE BOOTH`
        ),
      },
    },
  ];
};

const getCharacterCompletions = (program: SparkProgram | undefined) => {
  const characters = getUniqueOptions(
    Object.keys(program?.metadata?.characters || {})
  );
  return characters.map((c) => ({
    label: c,
    labelDetails: { description: "Character Dialogue" },
    kind: CompletionItemKind.Constant,
    documentation: {
      kind: MarkupKind.Markdown,
      value: getDocumentation(
        "Dialogue is represented with an UPPERCASE character name followed by a line of text.",
        `JEFFERY\nDo you know where we are?`
      ),
    },
  }));
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
      kind: CompletionItemKind.Enum,
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
      kind: CompletionItemKind.Enum,
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
        return [...getCharacterCompletions(program), ...getSceneCompletions()];
      }
    }
  }
  return [];
};

export default getCompletions;
