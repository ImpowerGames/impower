import { OrderedCollection } from "../../../../../../impower-core";
import { Disableable } from "../../../../../data/interfaces/disableable";
import {
  ConstructReference,
  createConstructReference,
  isConstructReference,
} from "../../../../../data/interfaces/references/constructReference";
import { createContainerData } from "../../container/containerData";
import { VariableContainerData } from "../../container/variableContainerData";
import { ElementData } from "../../items/element/elementData";

export interface ConstructData
  extends VariableContainerData<"Construct", ConstructReference>,
    Disableable {
  elements: OrderedCollection<ElementData>;
}

export const isConstructData = (obj: unknown): obj is ConstructData => {
  if (!obj) {
    return false;
  }
  const constructData = obj as ConstructData;
  return isConstructReference(constructData.reference);
};

export const createConstructData = (
  obj?: Partial<ConstructData>
): ConstructData => ({
  ...createContainerData({
    reference: createConstructReference(),
  }),
  elements: {
    order: [],
    data: {},
  },
  variables: {
    order: [],
    data: {},
  },
  name: "NewConstruct",
  disabled: false,
  ...obj,
});
