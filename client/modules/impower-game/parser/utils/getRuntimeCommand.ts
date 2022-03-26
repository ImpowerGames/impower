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
  ConditionCommandData,
  createCommandData,
  createCommandReference,
  createItemData,
  DisplayCommandData,
  DisplayPosition,
  DisplayType,
  EnterCommandData,
  ReturnCommandData,
  SetOperator,
} from "../../data";

const getCommandId = (token: SparkToken, sectionId = ""): string => {
  return `${sectionId}.${token.line}_${token.from}-${token.to}_${token.indent}`;
};

const getDisplayCommand = (
  token: SparkDisplayToken,
  sectionId = ""
): DisplayCommandData => {
  const refId = getCommandId(token, sectionId);
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
    indent: token.indent,
    ui: "",
    type: token.type as DisplayType,
    position:
      (dialogueToken.position as DisplayPosition) || DisplayPosition.Default,
    character: dialogueToken.character || "",
    parenthetical: dialogueToken.parenthetical || "",
    content: dialogueToken.text || dialogueToken.content,
    assets: dialogueToken.assets?.map(({ name }) => name) || [],
    waitUntilFinished: Boolean(token.wait),
  };
};

export const getRuntimeCommand = (
  token: SparkToken,
  sectionId = ""
): CommandData => {
  if (token.type === "assign") {
    const refId = getCommandId(token, sectionId);
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
      indent: token.indent,
      variable: token.name,
      operator: token.operator as SetOperator,
      value: token.value,
    };
    return newCommand;
  }
  if (token.type === "condition") {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "ConditionCommand";
    const newCommand: ConditionCommandData = {
      ...createCommandData({
        reference: createCommandReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
      }),
      pos: token.from,
      line: token.line,
      indent: token.indent,
      value: token.value,
      check: token.check,
    };
    return newCommand;
  }
  if (token.type === "call" || token.type === "go") {
    const refId = getCommandId(token, sectionId);
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
      indent: token.indent,
      value: token.value,
      calls: token.calls,
      returnWhenFinished: token.type === "call",
    };
    return newCommand;
  }
  if (token.type === "return") {
    const refId = getCommandId(token, sectionId);
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
      indent: token.indent,
      value: token.value,
      returnToTop: token.returnToTop,
    };
    return newCommand;
  }
  if (token.type === "repeat") {
    const refId = getCommandId(token, sectionId);
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
      indent: token.indent,
    };
    return newCommand;
  }
  if (token.type === "choice") {
    const refId = getCommandId(token, sectionId);
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
      indent: token.indent,
      operator: token.operator,
      value: token.value,
      calls: token.calls,
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
