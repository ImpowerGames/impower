import {
  ConfigData,
  createDebugConfigData,
  DebugConfigData,
  TypeInfo,
} from "../../../../../data";
import { ConfigInspector } from "../../config/configInspector";

export class DebugConfigInspector extends ConfigInspector<DebugConfigData> {
  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      ...super.getTypeInfo(data),
      name: "Debug",
    };
  }

  createData(
    data?: Partial<DebugConfigData> & Pick<DebugConfigData, "reference">
  ): DebugConfigData {
    return createDebugConfigData(data);
  }
}
