import { AdvancedConfigData, ConfigData, TypeInfo } from "../../../../../data";
import { ConfigInspector } from "../../config/configInspector";
import { createAdvancedConfigData } from "./createAdvancedConfigData";

export class AdvancedConfigInspector extends ConfigInspector<AdvancedConfigData> {
  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      ...super.getTypeInfo(data),
      name: "More Options...",
    };
  }

  createData(
    data?: Partial<AdvancedConfigData> & Pick<AdvancedConfigData, "reference">
  ): AdvancedConfigData {
    return createAdvancedConfigData(data);
  }
}
