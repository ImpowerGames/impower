import { createConfigReference } from "../../../../../data/utils/createConfigReference";
import { createConfigData } from "../../config/createConfigData";
import { DebugConfigData } from "./debugConfigData";

export const createDebugConfigData = (
  obj?: Partial<DebugConfigData>
): DebugConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "DebugConfig",
      refId: "DebugConfig",
    }),
  }),
  randomizationSeed: "",
  logBlockExecutions: false,
  ...obj,
});
