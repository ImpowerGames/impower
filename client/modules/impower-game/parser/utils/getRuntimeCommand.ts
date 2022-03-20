import {
  FountainDialogueToken,
  FountainToken,
} from "../../../impower-script-parser";
import {
  AssignCommandData,
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
  token: FountainToken,
  sectionId = ""
): DisplayCommandData => {
  const refId = `${sectionId}.${token.from}`;
  const refTypeId: CommandTypeId = "DisplayCommand";
  const dialogueToken = token as FountainDialogueToken;
  return {
    ...createCommandData({
      ...createItemData({
        reference: createCommandReference(),
      }),
      waitUntilFinished: true,
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
    waitUntilFinished: dialogueToken.position !== "left",
  };
};

export const getRuntimeCommand = (
  token: FountainToken,
  sectionId = ""
): CommandData => {
  if (token.type === "assign") {
    const refId = `${sectionId}.${token.from}`;
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
    const refId = `${sectionId}.${token.from}`;
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
    const refId = `${sectionId}.${token.from}`;
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
    const refId = `${sectionId}.${token.from}`;
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
    const refId = `${sectionId}.${token.from}`;
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
  if (
    token.type === "dialogue" ||
    token.type === "action" ||
    token.type === "centered" ||
    token.type === "transition" ||
    token.type === "scene"
  ) {
    return getDisplayCommand(token, sectionId);
  }

  return null;
};
