import { CenterType } from "../../../../../data/enums/centerType";
import { ScaleModeType } from "../../../../../data/enums/scaleModeType";
import { ConfigData } from "../../config/configData";

export interface ScaleConfigData extends ConfigData {
  mode: ScaleModeType;
  autoCenter: CenterType;
  width: number;
  height: number;
}
