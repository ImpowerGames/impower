import {
  isVariableReference,
  VariableReference,
} from "../references/variableReference";

export interface DynamicData<T = unknown> {
  constant: T;
  dynamic?: VariableReference;
}

export const isDynamicData = (obj: unknown): obj is DynamicData => {
  if (!obj) {
    return false;
  }
  const dynamicData = obj as DynamicData;
  return (
    dynamicData.constant !== undefined &&
    (!dynamicData.dynamic || isVariableReference(dynamicData.dynamic))
  );
};

export const createDynamicData = <T>(
  constant: T,
  dynamic?: VariableReference
): DynamicData<T> => ({
  constant,
  dynamic: dynamic || null,
});
