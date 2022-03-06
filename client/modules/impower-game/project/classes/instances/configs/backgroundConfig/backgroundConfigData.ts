import { Color, hexToHsla } from "../../../../../../impower-core";
import {
  createDynamicData,
  DynamicData,
} from "../../../../../data/interfaces/generics/dynamicData";
import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigData, createConfigData } from "../../config/configData";

export interface BackgroundConfigData extends ConfigData<"BackgroundConfig"> {
  game: DynamicData<Color>;
  screen: DynamicData<Color>;
  ui: DynamicData<Color>;
}

export const createBackgroundConfigData = (
  obj?: Partial<BackgroundConfigData>
): BackgroundConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "BackgroundConfig",
      refId: "BackgroundConfig",
    }),
  }),
  game: createDynamicData(hexToHsla("#000000FF")),
  screen: createDynamicData(hexToHsla("#021830FF")),
  ui: createDynamicData(hexToHsla("#00000000")),
  ...obj,
});
