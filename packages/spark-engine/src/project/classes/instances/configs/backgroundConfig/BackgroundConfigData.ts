import { Color } from "../../../../../data/interfaces/Color";
import { ConfigData } from "../../config/ConfigData";

export interface BackgroundConfigData extends ConfigData<"BackgroundConfig"> {
  game: Color;
  screen: Color;
  ui: Color;
}
