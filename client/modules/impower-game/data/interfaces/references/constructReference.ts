import { ContainerReference, isContainerReference } from "./containerReference";

export interface ConstructReference extends ContainerReference<"Construct"> {
  parentContainerType: "Construct";
  refType: "Construct";
  refTypeId: "Construct";
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
    constructReference.parentContainerType === "Construct" &&
    constructReference.refType === "Construct" &&
    constructReference.refTypeId === "Construct"
  );
};

export const createConstructReference = (
  obj?: Partial<ConstructReference>
): ConstructReference => ({
  parentContainerType: "Construct",
  parentContainerId: "",
  refType: "Construct",
  refTypeId: "Construct",
  refId: "",
  ...obj,
});
