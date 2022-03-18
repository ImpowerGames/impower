import { Color } from "../../../../../../impower-core";
import { ConfigData } from "../../config/configData";

export interface BackgroundConfigData extends ConfigData<"BackgroundConfig"> {
  game: Color;
  screen: Color;
  ui: Color;
}
