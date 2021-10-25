import { getParentPropertyPath } from "../../../../../../impower-core";
import {
  createTriggerData,
  isDynamicData,
  isReference,
  TriggerData,
  TypeInfo,
} from "../../../../../data";
import { getProjectColor } from "../../../../../inspector/utils/getProjectColor";
import { ItemInspector } from "../../item/itemInspector";

export class TriggerInspector<
  T extends TriggerData = TriggerData
> extends ItemInspector<T> {
  private static _instance: TriggerInspector;

  public static get instance(): TriggerInspector {
    if (!this._instance) {
      this._instance = new TriggerInspector();
    }
    return this._instance;
  }

  getTypeInfo(): TypeInfo {
    return {
      category: "",
      name: "Trigger",
      icon: "bolt",
      color: getProjectColor("grape", 5),
      description: "",
    };
  }

  createData(data?: Partial<T> & Pick<T, "reference">): T {
    return {
      ...super.createData(data),
      ...createTriggerData(data),
      ...data,
    } as T;
  }

  allowVariableProperty(propertyPath: string, _data: T): boolean {
    if (propertyPath === "disabled") {
      return false;
    }
    return true;
  }

  isPropertyVisible(propertyPath: string, data: T): boolean {
    if (propertyPath === "disabled") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  async getPropertyError(
    propertyPath: string,
    data: T,
    value: unknown,
    _docIds: string[]
  ): Promise<string | null> {
    const checkValue = isDynamicData(value)
      ? value.dynamic || value.constant
      : value;
    if (isReference(checkValue)) {
      if (!checkValue.refId) {
        return `No ${this.getPropertyLabel(
          getParentPropertyPath(propertyPath),
          data
        )} selected`;
      }
    }
    return undefined;
  }
}
