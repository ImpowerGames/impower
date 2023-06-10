import { SparkDisplayToken, SparkToken } from "../../../../sparkdown/src";
import {
  AssignCommandData,
  ChoiceCommandData,
  CommandData,
  CommandTypeId,
  ConditionCommandData,
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

const generateDisplayCommand = (
  token: SparkDisplayToken,
  sectionId = ""
): DisplayCommandData => {
  const refId = getCommandId(token as SparkToken, sectionId);
  const refTypeId: CommandTypeId = "DisplayCommand";
  return {
    disabled: false,
    reference: {
      parentContainerType: "Block",
      parentContainerId: refId.split(".").slice(0, -1).join("."),
      refType: "Command",
      refTypeId,
      refId,
    },
    from: token.from,
    to: token.to,
    line: token.line,
    indent: token.indent,
    type: token.type as DisplayType,
    position: (token.position as DisplayPosition) || "default",
    character: token.character || "",
    parenthetical: token.parenthetical || "",
    content: token.content,
    assets: token.assets?.map(({ name }) => name),
    autoAdvance: token.autoAdvance || false,
    clearPreviousText: token.clearPreviousText || false,
    waitUntilFinished: token.wait || false,
  };
};

export const generateCommand = (
  token: SparkToken,
  sectionId = ""
): CommandData | null => {
  if (!token) {
    return null;
  }
  if (token.ignore) {
    return null;
  }
  if (
    token.type === "assign" ||
    token.type === "string" ||
    token.type === "number" ||
    token.type === "boolean"
  ) {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "AssignCommand";
    const newCommand: AssignCommandData = {
      reference: {
        parentContainerType: "Block",
        parentContainerId: sectionId,
        refType: "Command",
        refId,
        refTypeId,
      },
      from: token.from,
      to: token.to,
      line: token.line,
      indent: token.indent,
      variable: token.name || "",
      operator: token.operator as SetOperator,
      value: token.value as string,
      waitUntilFinished: true,
    };
    return newCommand;
  }
  if (token.type === "condition") {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "ConditionCommand";
    const newCommand: ConditionCommandData = {
      reference: {
        parentContainerType: "Block",
        parentContainerId: sectionId,
        refType: "Command",
        refId,
        refTypeId,
      },
      from: token.from,
      to: token.to,
      line: token.line,
      indent: token.indent,
      waitUntilFinished: true,
      value: token.value as string,
      check: (token.check || "") as "if" | "elif" | "else" | "close",
    };
    return newCommand;
  }
  if (token.type === "call" || token.type === "jump") {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "EnterCommand";
    const newCommand: EnterCommandData = {
      reference: {
        parentContainerType: "Block",
        parentContainerId: sectionId,
        refType: "Command",
        refId,
        refTypeId,
      },
      from: token.from,
      to: token.to,
      line: token.line,
      indent: token.indent,
      waitUntilFinished: true,
      value: token.value as string,
      calls: token.calls || {},
      returnWhenFinished: token.type === "call",
    };
    return newCommand;
  }
  if (token.type === "return") {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "ReturnCommand";
    const newCommand: ReturnCommandData = {
      reference: {
        parentContainerType: "Block",
        parentContainerId: sectionId,
        refType: "Command",
        refId,
        refTypeId,
      },
      from: token.from,
      to: token.to,
      line: token.line,
      indent: token.indent,
      waitUntilFinished: true,
      value: token.value as string,
    };
    return newCommand;
  }
  if (token.type === "repeat") {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "RepeatCommand";
    const newCommand: CommandData = {
      reference: {
        parentContainerType: "Block",
        parentContainerId: sectionId,
        refType: "Command",
        refId,
        refTypeId,
      },
      from: token.from,
      to: token.to,
      line: token.line,
      indent: token.indent,
      waitUntilFinished: true,
    };
    return newCommand;
  }
  if (token.type === "choice") {
    const refId = getCommandId(token, sectionId);
    const refTypeId: CommandTypeId = "ChoiceCommand";
    const newCommand: ChoiceCommandData = {
      reference: {
        parentContainerType: "Block",
        parentContainerId: sectionId,
        refType: "Command",
        refId,
        refTypeId,
      },
      from: token.from,
      to: token.to,
      line: token.line,
      indent: token.indent,
      waitUntilFinished: token.operator === "end",
      operator: token.operator as "end" | "+" | "-" | "start",
      value: token.value as string,
      calls: token.calls || {},
      content: token.content,
      order: token.order,
    };
    return newCommand;
  }
  if (token.type === "dialogue") {
    return generateDisplayCommand(token, sectionId);
  }
  if (token.type === "action") {
    return generateDisplayCommand(token, sectionId);
  }
  if (token.type === "centered") {
    return generateDisplayCommand(token, sectionId);
  }
  if (token.type === "transition") {
    return generateDisplayCommand(token, sectionId);
  }
  if (token.type === "scene") {
    return generateDisplayCommand(token, sectionId);
  }
  if (token.type === "assets") {
    return generateDisplayCommand(token, sectionId);
  }

  return null;
};
