import { createBlockReference } from "../../../../../data/utils/createBlockReference";
import { createContainerData } from "../../container/createContainerData";
import { BlockData } from "./blockData";

export const createBlockData = (obj?: Partial<BlockData>): BlockData => ({
  ...createContainerData({
    reference: createBlockReference(),
  }),
  operator: "",
  commands: {
    order: [],
    data: {},
  },
  parameters: [],
  triggers: [],
  ids: {},
  name: "NewBlock",
  nodePosition: { x: 640, y: 640 },
  disabled: false,
  ...obj,
});
