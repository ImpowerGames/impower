import { Color, hexToHsla } from "../../../../../../impower-core";
import { ConfigData, createConfigData } from "../../config/configData";
import {
  createDynamicData,
  DynamicData,
} from "../../../../../data/interfaces/generics/dynamicData";
import { ConfigTypeId } from "../../config/configTypeId";
import { createConfigReference } from "../../../../../data/interfaces/references/configReference";

export interface BackgroundConfigData
  extends ConfigData<ConfigTypeId.BackgroundConfig> {
  game: DynamicData<Color>;
  screen: DynamicData<Color>;
  ui: DynamicData<Color>;
}

export const createBackgroundConfigData = (
  obj?: Partial<BackgroundConfigData>
): BackgroundConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: ConfigTypeId.BackgroundConfig,
      refId: ConfigTypeId.BackgroundConfig,
    }),
  }),
  game: createDynamicData(hexToHsla("#000000FF")),
  screen: createDynamicData(hexToHsla("#021830FF")),
  ui: createDynamicData(hexToHsla("#00000000")),
  ...obj,
});
