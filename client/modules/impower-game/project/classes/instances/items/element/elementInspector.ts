import { ElementData, TypeInfo, createElementData } from "../../../../../data";
import { ItemInspector } from "../../item/itemInspector";
import { getProjectColor } from "../../../../../inspector/utils/getProjectColor";

export class ElementInspector<
  T extends ElementData = ElementData
> extends ItemInspector<T> {
  private static _instance: ElementInspector;

  public static get instance(): ElementInspector {
    if (!this._instance) {
      this._instance = new ElementInspector();
    }
    return this._instance;
  }

  isPropertyVisible(propertyPath: string, data: T): boolean {
    if (propertyPath === "disabled") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  getTypeInfo(): TypeInfo {
    return {
      category: "",
      name: "Element",
      icon: "shapes",
      color: getProjectColor("teal", 5),
      description: "",
    };
  }

  createData(data?: Partial<T> & Pick<T, "reference">): T {
    return {
      ...super.createData(data),
      ...createElementData(data),
      ...data,
    } as T;
  }
}
