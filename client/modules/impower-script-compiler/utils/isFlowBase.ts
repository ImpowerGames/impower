import { IFlowBase } from "../types/IFlowBase";

export const isFlowBase = (obj: unknown): obj is IFlowBase => {
  const value = obj as IFlowBase;
  return (
    value.arguments !== undefined &&
    value.flowLevel !== undefined &&
    value.identifier !== undefined &&
    value.isFunction !== undefined
  );
};
