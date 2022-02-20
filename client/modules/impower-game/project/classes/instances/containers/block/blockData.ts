import { OrderedCollection } from "../../../../../../impower-core";
import { Disableable } from "../../../../../data/interfaces/disableable";
import { Positionable } from "../../../../../data/interfaces/positionable";
import {
  BlockReference,
  createBlockReference,
  isBlockReference,
} from "../../../../../data/interfaces/references/blockReference";
import { createContainerData } from "../../container/containerData";
import { VariableContainerData } from "../../container/variableContainerData";
import { CommandData } from "../../items/command/commandData";
import { TriggerData } from "../../items/trigger/triggerData";

export const defaultNodePosition = { x: 640, y: 640 };
export const defaultNodeSize = { x: 144, y: 40 };

export interface BlockData
  extends VariableContainerData<"Block", BlockReference>,
    Positionable,
    Disableable {
  triggers: OrderedCollection<TriggerData>;
  commands: OrderedCollection<CommandData>;
}

export const isBlockData = (obj: unknown): obj is BlockData => {
  if (!obj) {
    return false;
  }
  const blockData = obj as BlockData;
  return isBlockReference(blockData.reference);
};

export const createBlockData = (obj?: Partial<BlockData>): BlockData => ({
  ...createContainerData({
    reference: createBlockReference(),
  }),
  triggers: {
    order: [],
    data: {},
  },
  commands: {
    order: [],
    data: {},
  },
  variables: {
    order: [],
    data: {},
  },
  name: "NewBlock",
  nodePosition: defaultNodePosition,
  disabled: false,
  ...obj,
});
