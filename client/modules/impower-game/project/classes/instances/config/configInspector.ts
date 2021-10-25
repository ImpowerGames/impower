import { getLabel } from "../../../../../impower-config";
import { ConfigData, createConfigData, TypeInfo } from "../../../../data";
import { getProjectColor } from "../../../../inspector/utils/getProjectColor";
import { InstanceInspector } from "../../instance/instanceInspector";

export class ConfigInspector<
  T extends ConfigData = ConfigData
> extends InstanceInspector<T> {
  private static _instance: ConfigInspector;

  public static get instance(): ConfigInspector {
    if (!this._instance) {
      this._instance = new ConfigInspector();
    }
    return this._instance;
  }

  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      category: "",
      name: data ? getLabel(data.reference.refTypeId) : "Config",
      icon: "config",
      color: getProjectColor("gray", 5),
      description: "Defines the project's configuration",
    };
  }

  createData(data?: Partial<T> & Pick<T, "reference">): T {
    return {
      ...super.createData(data),
      ...createConfigData(data),
      ...data,
    };
  }

  isPropertyVisible(propertyPath: string, data: T): boolean {
    return super.isPropertyVisible(propertyPath, data);
  }
}
