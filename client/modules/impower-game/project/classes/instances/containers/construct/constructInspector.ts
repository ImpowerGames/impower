import {
  ConstructData,
  TypeInfo,
  createConstructData,
} from "../../../../../data";
import { ContainerInspector } from "../../container/containerInspector";
import { getProjectColor } from "../../../../../inspector/utils/getProjectColor";

export class ConstructInspector extends ContainerInspector<ConstructData> {
  private static _instance: ConstructInspector;

  public static get instance(): ConstructInspector {
    if (!this._instance) {
      this._instance = new ConstructInspector();
    }
    return this._instance;
  }

  getTypeInfo(): TypeInfo {
    return {
      category: "",
      name: "Construct",
      icon: "cube",
      color: getProjectColor("violet", 5),
      description: "Represents the current state of an entity",
    };
  }

  createData(
    data?: Partial<ConstructData> & Pick<ConstructData, "reference">
  ): ConstructData {
    return createConstructData(data);
  }

  isPropertyVisible(propertyPath: string, data: ConstructData): boolean {
    if (propertyPath === "elements") {
      return false;
    }
    if (propertyPath === "variables") {
      return false;
    }
    if (propertyPath === "disabled") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
