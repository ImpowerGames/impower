import { FountainSection, FountainToken } from "../../../impower-script-parser";
import { FountainVariable } from "../../../impower-script-parser/types/FountainVariable";
import {
  BlockData,
  CommandTypeId,
  CompareOperator,
  CompareTriggerData,
  createBlockData,
  createBlockReference,
  createCommandData,
  createCommandReference,
  createTriggerData,
  createTriggerReference,
  createVariableData,
  createVariableReference,
  DynamicData,
  SetCommandData,
  SetOperator,
  TriggerTypeId,
  VariableReference,
} from "../../data";

export const getRuntimeBlocks = (
  sections: Record<string, FountainSection>
): Record<string, BlockData> => {
  const getGlobalId = (sectionId: string, name: string | number): string => {
    return `${sectionId}.${name}`;
  };
  const getVariableReference = (
    sectionId: string,
    variable: FountainVariable
  ): VariableReference => {
    return createVariableReference({
      refId: getGlobalId(sectionId, variable.name),
      refTypeId:
        variable.type === "number" ? "NumberVariable" : "StringVariable",
    });
  };
  const getDynamicData = (
    sectionId: string,
    value: string | number | FountainVariable
  ): DynamicData<string | number> => {
    const constant =
      typeof value === "string" || typeof value === "number"
        ? value
        : value?.type === "number"
        ? 0
        : "";
    const dynamic =
      typeof value === "string" || typeof value === "number"
        ? null
        : getVariableReference(sectionId, value);
    return {
      constant,
      dynamic,
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
    let previousToken: FountainToken;
    section.tokens.forEach((token) => {
      if (token.type === "declare") {
        const refId = getGlobalId(sectionId, token.variable.name);
        const name = token?.variable?.name;
        const value = token?.value;
        block.variables.data[refId] = createVariableData({
          reference: getVariableReference(sectionId, token.variable),
          name,
          value,
        });
      } else if (token.type === "assign") {
        const refId = getGlobalId(sectionId, token.start);
        const refTypeId: CommandTypeId = "SetCommand";
        const newCommand: SetCommandData = {
          ...createCommandData({
            reference: createCommandReference({
              refId,
              refTypeId,
            }),
          }),
          variable: getVariableReference(sectionId, token.variable),
          operator: token.operator as SetOperator,
          value: getDynamicData(sectionId, token.value),
        };
        block.commands.data[refId] = newCommand;
      } else if (token.type === "trigger") {
        const refId = getGlobalId(sectionId, `trigger-${token.start}`);
        const refTypeId: TriggerTypeId =
          token.content === "all" ? "AllTrigger" : "AnyTrigger";
        const newTrigger = createTriggerData({
          reference: createTriggerReference({
            refId,
            refTypeId,
          }),
        });
        block.triggers.data[refId] = newTrigger;
        if (
          (previousToken?.type === "trigger" ||
            previousToken?.type === "compare") &&
          token.indent < previousToken.indent
        ) {
          const closeRefId = `${refId}-close`;
          block.triggers.data[closeRefId] = createTriggerData({
            reference: createTriggerReference({
              refId,
              refTypeId,
            }),
          });
        }
      } else if (token.type === "compare") {
        const refId = getGlobalId(sectionId, `trigger-${token.start}`);
        const refTypeId = "CompareTrigger";
        const newTrigger: CompareTriggerData = {
          ...createTriggerData({
            reference: createTriggerReference({
              refId,
              refTypeId,
            }),
          }),
          variable: getVariableReference(sectionId, token.variable),
          operator: token.operator as CompareOperator,
          value: getDynamicData(sectionId, token.value),
        };
        block.triggers.data[refId] = newTrigger;
        if (
          (previousToken?.type === "trigger" ||
            previousToken?.type === "compare") &&
          token.indent < previousToken.indent
        ) {
          const closeRefId = `${refId}-close`;
          block.triggers.data[closeRefId] = createTriggerData({
            reference: createTriggerReference({
              refId,
              refTypeId,
            }),
          });
        }
      }
      previousToken = token;
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
