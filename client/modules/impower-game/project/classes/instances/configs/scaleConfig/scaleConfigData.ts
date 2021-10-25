import { CenterType } from "../../../../../data/enums/centerType";
import { ScaleModeType } from "../../../../../data/enums/scaleModeType";
import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigData, createConfigData } from "../../config/configData";
import { ConfigTypeId } from "../../config/configTypeId";

export interface ScaleConfigData extends ConfigData {
  mode: ScaleModeType;
  autoCenter: CenterType;
  width: number;
  height: number;
}

export const createScaleConfigData = (
  obj?: Partial<ScaleConfigData>
): ScaleConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: ConfigTypeId.ScaleConfig,
      refId: ConfigTypeId.ScaleConfig,
    }),
  }),
  mode: ScaleModeType.HeightControlsWidth,
  autoCenter: CenterType.CenterBoth,
  width: 1920,
  height: 1080,
  ...obj,
});
