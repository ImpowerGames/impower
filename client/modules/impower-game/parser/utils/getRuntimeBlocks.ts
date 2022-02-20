import {
  FountainDialogueToken,
  FountainSection,
  FountainToken,
} from "../../../impower-script-parser";
import { FountainVariable } from "../../../impower-script-parser/types/FountainVariable";
import {
  BlockData,
  CommandTypeId,
  CompareOperator,
  CompareTriggerData,
  createAudioFileReference,
  createBlockData,
  createBlockReference,
  createCommandData,
  createCommandReference,
  createTriggerData,
  createTriggerReference,
  createVariableData,
  createVariableReference,
  DisplayCommandData,
  DisplayPosition,
  DisplayType,
  DynamicData,
  SetCommandData,
  SetOperator,
  TriggerTypeId,
  VariableReference,
} from "../../data";

export const getRuntimeBlocks = (
  sections: Record<string, FountainSection>
): Record<string, BlockData> => {
  const getVariableReference = (
    variable: FountainVariable
  ): VariableReference => {
    return createVariableReference({
      parentContainerId: variable?.id?.split(".").slice(0, -1).join(".") || "",
      refId: variable.id || "",
      refTypeId:
        variable.type === "number" ? "NumberVariable" : "StringVariable",
    });
  };

  const getDynamicData = <T extends string | number>(
    value: T | FountainVariable
  ): DynamicData<T> => {
    const constant =
      typeof value === "string" || typeof value === "number"
        ? value
        : value?.type === "number"
        ? 0
        : "";
    const dynamic =
      typeof value === "string" || typeof value === "number"
        ? null
        : getVariableReference(value);
    return {
      constant: constant as T,
      dynamic,
    };
  };

  const getDisplayCommand = (
    refId: string,
    token: FountainToken,
    character = "",
    parenthetical = ""
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
      type: dialogueToken.type as DisplayType,
      position:
        (dialogueToken.dual as DisplayPosition) || DisplayPosition.Default,
      character,
      parenthetical,
      content: dialogueToken.content,
      voice: createAudioFileReference(),
      waitUntilFinished: dialogueToken.dual !== "left",
    };
  };

  const blocks: { [refId: string]: BlockData } = {};
  Object.entries(sections).forEach(([sectionId, section]) => {
    const block = createBlockData({
      reference: createBlockReference({
        parentContainerId: sectionId.split(".").slice(0, -1).join("."),
        refId: sectionId,
      }),
      name: section.name,
      childContainerIds: section.children || [],
    });
    let character: string;
    let parenthetical: string;
    let previousToken: FountainToken;
    section.tokens.forEach((token) => {
      if (token.type === "declare") {
        const refId = token?.variable?.id;
        const name = refId.split(".").slice(-1).join(".");
        const value = token?.value;
        block.variables.order.push(refId);
        block.variables.data[refId] = createVariableData({
          reference: getVariableReference(token.variable),
          name,
          value,
        });
      } else if (token.type === "assign") {
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
          variable: getVariableReference(token.variable),
          operator: token.operator as SetOperator,
          value: getDynamicData(token.value),
        };
        block.commands.order.push(refId);
        block.commands.data[refId] = newCommand;
      } else if (token.type === "trigger") {
        const refId = `${sectionId}.${token.start}`;
        const refTypeId: TriggerTypeId =
          token.content === "all" ? "AllTrigger" : "AnyTrigger";
        const newTrigger = createTriggerData({
          reference: createTriggerReference({
            parentContainerId: sectionId,
            refId,
            refTypeId,
          }),
        });
        block.triggers.order.push(refId);
        block.triggers.data[refId] = newTrigger;
        if (
          (previousToken?.type === "trigger" ||
            previousToken?.type === "compare") &&
          token.indent < previousToken.indent
        ) {
          const closeRefId = `${refId}-close`;
          block.triggers.order.push(closeRefId);
          block.triggers.data[closeRefId] = createTriggerData({
            reference: createTriggerReference({
              parentContainerId: sectionId,
              refId,
              refTypeId,
            }),
          });
        }
      } else if (token.type === "compare") {
        const refId = `${sectionId}.${token.start}`;
        const refTypeId = "CompareTrigger";
        const newTrigger: CompareTriggerData = {
          ...createTriggerData({
            reference: createTriggerReference({
              parentContainerId: sectionId,
              refId,
              refTypeId,
            }),
          }),
          variable: getVariableReference(token.variable),
          operator: token.operator as CompareOperator,
          value: getDynamicData(token.value),
        };
        block.triggers.order.push(refId);
        block.triggers.data[refId] = newTrigger;
        if (
          (previousToken?.type === "trigger" ||
            previousToken?.type === "compare") &&
          token.indent < previousToken.indent
        ) {
          const closeRefId = `${refId}-close`;
          block.triggers.order.push(closeRefId);
          block.triggers.data[closeRefId] = createTriggerData({
            reference: createTriggerReference({
              parentContainerId: sectionId,
              refId,
              refTypeId,
            }),
          });
        }
      } else if (token.type === "character") {
        character = token.content;
      } else if (token.type === "parenthetical") {
        parenthetical = token.content;
      } else if (token.type === "dialogue") {
        const refId = `${sectionId}.${token.start}`;
        block.commands.order.push(refId);
        block.commands.data[refId] = getDisplayCommand(
          refId,
          token,
          character,
          parenthetical
        );
      } else if (token.type === "dialogue_end") {
        character = undefined;
        parenthetical = undefined;
      } else if (token.type === "action") {
        const refId = `${sectionId}.${token.start}`;
        block.commands.order.push(refId);
        block.commands.data[refId] = getDisplayCommand(refId, token);
      } else if (token.type === "centered") {
        const refId = `${sectionId}.${token.start}`;
        block.commands.order.push(refId);
        block.commands.data[refId] = getDisplayCommand(refId, token);
      } else if (token.type === "transition") {
        const refId = `${sectionId}.${token.start}`;
        block.commands.order.push(refId);
        block.commands.data[refId] = getDisplayCommand(refId, token);
      } else if (token.type === "scene") {
        const refId = `${sectionId}.${token.start}`;
        block.commands.order.push(refId);
        block.commands.data[refId] = getDisplayCommand(refId, token);
      }
      previousToken = token;
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
