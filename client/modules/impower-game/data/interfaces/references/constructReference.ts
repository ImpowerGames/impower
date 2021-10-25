import { ContainerType } from "../../enums/data";
import { ContainerReference, isContainerReference } from "./containerReference";

export interface ConstructReference
  extends ContainerReference<ContainerType.Construct> {
  parentContainerType: ContainerType.Construct;
  refType: ContainerType.Construct;
  refTypeId: ContainerType.Construct;
}

export const isConstructReference = (
  obj: unknown
): obj is ConstructReference => {
  if (!obj) {
    return false;
  }
  const constructReference = obj as ConstructReference;
  return (
    isContainerReference(obj) &&
    constructReference.parentContainerType === ContainerType.Construct &&
    constructReference.refType === ContainerType.Construct &&
    constructReference.refTypeId === ContainerType.Construct
  );
};

export const createConstructReference = (
  obj?: Partial<ConstructReference>
): ConstructReference => ({
  parentContainerType: ContainerType.Construct,
  parentContainerId: "",
  refType: ContainerType.Construct,
  refTypeId: ContainerType.Construct,
  refId: "",
  ...obj,
});
