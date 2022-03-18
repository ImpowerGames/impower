import {
  BackgroundConfigData,
  ConfigData,
  TypeInfo,
} from "../../../../../data";
import { ConfigInspector } from "../../config/configInspector";
import { createBackgroundConfigData } from "./createBackgroundConfigData";

export class BackgroundConfigInspector extends ConfigInspector<BackgroundConfigData> {
  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      ...super.getTypeInfo(data),
      name: "Backgrounds",
    };
  }

  createData(
    data?: Partial<BackgroundConfigData> &
      Pick<BackgroundConfigData, "reference">
  ): BackgroundConfigData {
    return createBackgroundConfigData(data);
  }
}
