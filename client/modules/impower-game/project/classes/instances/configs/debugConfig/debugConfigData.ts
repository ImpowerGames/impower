import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigData, createConfigData } from "../../config/configData";

export interface DebugConfigData extends ConfigData<"DebugConfig"> {
  randomizationSeed: string;
  logBlockExecutions: boolean;
}

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
