import { FountainToken } from "../../../impower-script-parser";
import {
  CompareOperator,
  createTriggerData,
  createTriggerReference,
  TriggerData,
  TriggerTypeId,
} from "../../data";
import { getRuntimeDynamicData } from "./getRuntimeDynamicData";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

export const getRuntimeTrigger = (
  token: FountainToken,
  sectionId = ""
): TriggerData => {
  if (token.type === "trigger_group_begin") {
    const refId = `${sectionId}.${token.start}`;
    const refTypeId: TriggerTypeId =
      token.content === "all" ? "AllTrigger" : "AnyTrigger";
    return createTriggerData({
      reference: createTriggerReference({
        parentContainerId: sectionId,
        refId,
        refTypeId,
      }),
      line: token.line,
    });
  }
  if (token.type === "compare") {
    const refId = `${sectionId}.${token.start}`;
    const refTypeId = "CompareTrigger";
    return {
      ...createTriggerData({
        reference: createTriggerReference({
          parentContainerId: sectionId,
          refId,
          refTypeId,
        }),
        line: token.line,
      }),
      variable: getRuntimeVariableReference(token.variable),
      operator: token.operator as CompareOperator,
      value: getRuntimeDynamicData(token.value),
    };
  }
  if (token.type === "trigger_group_end") {
    const refId = `${sectionId}.${token.start}-close`;
    const refTypeId = "CloseTrigger";
    return createTriggerData({
      reference: createTriggerReference({
        parentContainerId: sectionId,
        refId,
        refTypeId,
      }),
      line: token.line,
    });
  }

  return null;
};
