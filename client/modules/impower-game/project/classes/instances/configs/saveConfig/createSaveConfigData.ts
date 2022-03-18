import { createConfigReference } from "../../../../../data/utils/createConfigReference";
import { createConfigData } from "../../config/createConfigData";
import { SaveConfigData } from "./saveConfigData";

export const createSaveConfigData = (
  obj?: Partial<SaveConfigData>
): SaveConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "SaveConfig",
      refId: "SaveConfig",
    }),
  }),
  autoSaveOnEnter: true,
  ...obj,
});
