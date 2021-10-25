import { OrderedCollection } from "../../../../../impower-core";
import { ContainerReference, ContainerType } from "../../../../data";
import { VariableData } from "../items/variable/variableData";
import { ContainerData, isContainerData } from "./containerData";

export interface VariableContainerData<
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
> extends ContainerData<D, R> {
  variables: OrderedCollection<VariableData>;
}

export const isVariableContainerData = <
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
>(
  obj: unknown
): obj is VariableContainerData<D, R> => {
  if (!obj) {
    return false;
  }
  const variableContainerData = obj as VariableContainerData<D, R>;
  return (
    isContainerData(variableContainerData) &&
    variableContainerData.variables !== undefined
  );
};
