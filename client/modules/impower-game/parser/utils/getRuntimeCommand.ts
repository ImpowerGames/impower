import {
  FountainDialogueToken,
  FountainToken,
} from "../../../impower-script-parser";
import {
  CommandData,
  CommandTypeId,
  createAudioFileReference,
  createCommandData,
  createCommandReference,
  DisplayCommandData,
  DisplayPosition,
  DisplayType,
  SetCommandData,
  SetOperator,
} from "../../data";
import { getRuntimeDynamicData } from "./getRuntimeDynamicData";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

const getDisplayCommand = (
  refId: string,
  token: FountainToken
): DisplayCommandData => {
  const dialogueToken = token as FountainDialogueToken;
  const refTypeId: CommandTypeId = "DisplayCommand";
  return {
    ...createCommandData({
      reference: createCommandReference({
        parentContainerId: refId.split(".").slice(0, -1).join("."),
        refId,
        refTypeId,
      }),
    }),
    pos: token.start,
    line: token.line,
    ui: "",
    type:
      dialogueToken.type === "character" ||
      dialogueToken.type === "parenthetical"
        ? DisplayType.Dialogue
        : (dialogueToken.type as DisplayType),
    position:
      (dialogueToken.dual as DisplayPosition) || DisplayPosition.Default,
    character: dialogueToken.character || "",
    parenthetical: dialogueToken.parenthetical || "",
    content: dialogueToken.dialogue || dialogueToken.content,
    voice: createAudioFileReference(),
    waitUntilFinished: dialogueToken.dual !== "left",
  };
};

export const getRuntimeCommand = (
  token: FountainToken,
  sectionId = ""
): CommandData => {
  if (token.type === "assign") {
    const refId = `${sectionId}.${token.start}`;
    const refTypeId: CommandTypeId = "SetCommand";
    const newCommand: SetCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.start,
      line: token.line,
      variable: getRuntimeVariableReference(token.variable),
      operator: token.operator as SetOperator,
      value: getRuntimeDynamicData(token.value),
    };
    return newCommand;
  }
  if (
    token.type === "character" ||
    token.type === "parenthetical" ||
    token.type === "dialogue"
  ) {
    const refId = `${sectionId}.${token.start}`;
    return getDisplayCommand(refId, token);
  }
  if (token.type === "action") {
    const refId = `${sectionId}.${token.start}`;
    return getDisplayCommand(refId, token);
  }
  if (token.type === "centered") {
    const refId = `${sectionId}.${token.start}`;
    return getDisplayCommand(refId, token);
  }
  if (token.type === "transition") {
    const refId = `${sectionId}.${token.start}`;
    return getDisplayCommand(refId, token);
  }
  if (token.type === "scene") {
    const refId = `${sectionId}.${token.start}`;
    return getDisplayCommand(refId, token);
  }

  return null;
};
