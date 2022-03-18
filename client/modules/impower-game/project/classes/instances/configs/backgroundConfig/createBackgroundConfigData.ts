import { hexToHsla } from "../../../../../../impower-core";
import { createConfigReference } from "../../../../../data/utils/createConfigReference";
import { createConfigData } from "../../config/createConfigData";
import { BackgroundConfigData } from "./backgroundConfigData";

export const createBackgroundConfigData = (
  obj?: Partial<BackgroundConfigData>
): BackgroundConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "BackgroundConfig",
      refId: "BackgroundConfig",
    }),
  }),
  game: hexToHsla("#000000FF"),
  screen: hexToHsla("#021830FF"),
  ui: hexToHsla("#00000000"),
  ...obj,
});
