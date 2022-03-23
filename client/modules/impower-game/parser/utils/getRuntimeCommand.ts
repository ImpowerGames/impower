import {
  SparkDialogueToken,
  SparkDisplayToken,
  SparkToken,
} from "../../../impower-script-parser";
import {
  AssignCommandData,
  ChoiceCommandData,
  CommandData,
  CommandTypeId,
  createCommandData,
  createCommandReference,
  createItemData,
  DisplayCommandData,
  DisplayPosition,
  DisplayType,
  EnterCommandData,
  IfCommandData,
  ReturnCommandData,
  SetOperator,
} from "../../data";

const getDisplayCommand = (
  token: SparkDisplayToken,
  sectionId = ""
): DisplayCommandData => {
  const refId = `${sectionId}.${token.line}`;
  const refTypeId: CommandTypeId = "DisplayCommand";
  const dialogueToken = token as SparkDialogueToken;
  return {
    ...createCommandData({
      ...createItemData({
        reference: createCommandReference(),
      }),
      disabled: false,
      reference: createCommandReference({
        parentContainerId: refId.split(".").slice(0, -1).join("."),
        refId,
        refTypeId,
      }),
    }),
    pos: token.from,
    line: token.line,
    ui: "",
    type: token.type as DisplayType,
    position:
      (dialogueToken.position as DisplayPosition) || DisplayPosition.Default,
    character: dialogueToken.character || "",
    parenthetical: dialogueToken.parenthetical || "",
    content: dialogueToken.text || dialogueToken.content,
    assets: dialogueToken.assets?.map(({ name }) => name) || [],
    waitUntilFinished: token.wait,
  };
};

export const getRuntimeCommand = (
  token: SparkToken,
  sectionId = ""
): CommandData => {
  if (token.type === "assign") {
    const refId = `${sectionId}.${token.line}`;
    const refTypeId: CommandTypeId = "AssignCommand";
    const newCommand: AssignCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
      variable: token.name,
      operator: token.operator as SetOperator,
      value: token.value,
    };
    return newCommand;
  }
  if (token.type === "condition") {
    const refId = `${sectionId}.${token.line}`;
    const refTypeId: CommandTypeId = "IfCommand";
    const newCommand: IfCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
      value: token.value,
    };
    return newCommand;
  }
  if (token.type === "call" || token.type === "go") {
    const refId = `${sectionId}.${token.line}`;
    const refTypeId: CommandTypeId = "EnterCommand";
    const newCommand: EnterCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
      name: token.name,
      values: token.methodArgs,
      returnWhenFinished: token.type === "call",
    };
    return newCommand;
  }
  if (token.type === "return") {
    const refId = `${sectionId}.${token.line}`;
    const refTypeId: CommandTypeId = "ReturnCommand";
    const newCommand: ReturnCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
      value: token.value,
      returnToTop: token.returnToTop,
    };
    return newCommand;
  }
  if (token.type === "repeat") {
    const refId = `${sectionId}.${token.line}`;
    const refTypeId: CommandTypeId = "RepeatCommand";
    const newCommand: CommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
    };
    return newCommand;
  }
  if (token.type === "choice") {
    const refId = `${sectionId}.${token.line}`;
    const refTypeId: CommandTypeId = "ChoiceCommand";
    const newCommand: ChoiceCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
      name: token.name,
      values: token.methodArgs,
      content: token.content,
      index: token.index,
      count: token.count,
      waitUntilFinished: token.index === token.count - 1,
    };
    return newCommand;
  }
  if (token.type === "dialogue") {
    return getDisplayCommand(token, sectionId);
  }
  if (token.type === "action") {
    return getDisplayCommand(token, sectionId);
  }
  if (token.type === "centered") {
    return getDisplayCommand(token, sectionId);
  }
  if (token.type === "transition") {
    return getDisplayCommand(token, sectionId);
  }
  if (token.type === "scene") {
    return getDisplayCommand(token, sectionId);
  }

  return null;
};
