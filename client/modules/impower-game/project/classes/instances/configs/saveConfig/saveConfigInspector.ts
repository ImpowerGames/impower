import { ConfigData, SaveConfigData, TypeInfo } from "../../../../../data";
import { ConfigInspector } from "../../config/configInspector";
import { createSaveConfigData } from "./createSaveConfigData";

export class SaveConfigInspector extends ConfigInspector<SaveConfigData> {
  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      ...super.getTypeInfo(data),
      name: "Save System",
    };
  }

  createData(
    data?: Partial<SaveConfigData> & Pick<SaveConfigData, "reference">
  ): SaveConfigData {
    return createSaveConfigData(data);
  }
}
