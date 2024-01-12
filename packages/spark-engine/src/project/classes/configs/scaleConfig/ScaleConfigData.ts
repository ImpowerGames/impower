import { CenterType } from "../../../../data/enums/CenterType";
import { ScaleModeType } from "../../../../data/enums/ScaleModeType";
import { ConfigData } from "../../config/ConfigData";

export interface ScaleConfigData extends ConfigData {
  mode: ScaleModeType;
  autoCenter: CenterType;
  width: number;
  height: number;
}
