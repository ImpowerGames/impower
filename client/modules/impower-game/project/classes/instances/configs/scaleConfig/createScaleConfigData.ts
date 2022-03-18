import { CenterType } from "../../../../../data/enums/centerType";
import { ScaleModeType } from "../../../../../data/enums/scaleModeType";
import { createConfigReference } from "../../../../../data/utils/createConfigReference";
import { createConfigData } from "../../config/createConfigData";
import { ScaleConfigData } from "./scaleConfigData";

export const createScaleConfigData = (
  obj?: Partial<ScaleConfigData>
): ScaleConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "ScaleConfig",
      refId: "ScaleConfig",
    }),
  }),
  mode: ScaleModeType.HeightControlsWidth,
  autoCenter: CenterType.CenterBoth,
  width: 1920,
  height: 1080,
  ...obj,
});
