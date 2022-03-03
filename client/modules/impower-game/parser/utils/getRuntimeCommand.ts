import {
  FountainAsset,
  FountainDialogueToken,
  FountainToken,
  FountainVariable,
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
import { getFountainAsset } from "./getFountainAsset";
import { getRuntimeDynamicData } from "./getRuntimeDynamicData";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

const getDisplayCommand = (
  token: FountainToken,
  sectionId = "",
  assets: {
    image?: Record<string, FountainAsset>;
    video?: Record<string, FountainAsset>;
    audio?: Record<string, FountainAsset>;
    text?: Record<string, FountainAsset>;
  }
): DisplayCommandData => {
  const refId = `${sectionId}.${token.start}`;
  const dialogueToken = token as FountainDialogueToken;
  const refTypeId: CommandTypeId = "DisplayCommand";
  const portrait = dialogueToken?.portrait;
  const asset = getFountainAsset("image", portrait, sectionId, assets);
  const portraitValue = asset?.value;
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
    type: dialogueToken.type as DisplayType,
    position:
      (dialogueToken.position as DisplayPosition) || DisplayPosition.Default,
    character: dialogueToken.character || "",
    portrait: portraitValue || "",
    parenthetical: dialogueToken.parenthetical || "",
    content: dialogueToken.text || dialogueToken.content,
    voice: createAudioFileReference(),
    waitUntilFinished: dialogueToken.position !== "left",
  };
};

export const getRuntimeCommand = (
  token: FountainToken,
  sectionId = "",
  variables: Record<string, FountainVariable>,
  assets: {
    image?: Record<string, FountainAsset>;
    video?: Record<string, FountainAsset>;
    audio?: Record<string, FountainAsset>;
    text?: Record<string, FountainAsset>;
  }
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
      variable: getRuntimeVariableReference(
        token.variable,
        sectionId,
        variables
      ),
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
