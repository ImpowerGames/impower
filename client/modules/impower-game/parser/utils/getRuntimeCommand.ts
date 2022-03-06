import {
  FountainAsset,
  FountainDialogueToken,
  FountainToken,
  FountainVariable,
} from "../../../impower-script-parser";
import {
  CommandData,
  CommandTypeId,
  createCommandData,
  createCommandReference,
  DisplayCommandData,
  DisplayPosition,
  DisplayType,
  SetCommandData,
  SetOperator,
} from "../../data";
import { getFountainAsset } from "./getFountainAsset";
import { getRuntimeDynamicData } from "./getRuntimeDynamicData";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

const getDisplayCommand = (
  token: FountainToken,
  sectionId = "",
  assets: Record<string, FountainAsset>
): DisplayCommandData => {
  const refId = `${sectionId}.${token.start}`;
  const refTypeId: CommandTypeId = "DisplayCommand";
  const dialogueToken = token as FountainDialogueToken;
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
    type: token.type as DisplayType,
    position:
      (dialogueToken.position as DisplayPosition) || DisplayPosition.Default,
    character: dialogueToken.character || "",
    parenthetical: dialogueToken.parenthetical || "",
    content: dialogueToken.text || dialogueToken.content,
    assets:
      dialogueToken.assets?.map(({ name }) =>
        getFountainAsset(name, sectionId, assets)
      ) || [],
    waitUntilFinished: dialogueToken.position !== "left",
  };
};

export const getRuntimeCommand = (
  token: FountainToken,
  sectionId = "",
  variables: Record<string, FountainVariable>,
  assets: Record<string, FountainAsset>
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
      variable: getRuntimeVariableReference(token.name, sectionId, variables),
      operator: token.operator as SetOperator,
      value: getRuntimeDynamicData(token.value, sectionId, variables),
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
    return getDisplayCommand(token, sectionId, assets);
  }

  return null;
};
