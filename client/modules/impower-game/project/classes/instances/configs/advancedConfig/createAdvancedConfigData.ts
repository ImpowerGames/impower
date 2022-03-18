import { createConfigReference } from "../../../../../data/utils/createConfigReference";
import { createConfigData } from "../../config/createConfigData";
import { AdvancedConfigData } from "./advancedConfigData";

export const createAdvancedConfigData = (
  obj?: Partial<AdvancedConfigData>
): AdvancedConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "AdvancedConfig",
      refId: "AdvancedConfig",
    }),
  }),
  autoCreateConstructs: true,
  ...obj,
});
