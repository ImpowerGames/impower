import { getLabel } from "../../../../../../impower-config";
import { CommandData, TypeInfo } from "../../../../../data";
import { Ease } from "../../../../../data/enums/ease";
import { getProjectColor } from "../../../../../inspector/utils/getProjectColor";
import { ItemInspector } from "../../item/itemInspector";
import { createCommandData } from "./createCommandData";

export class CommandInspector<
  T extends CommandData = CommandData
> extends ItemInspector<T> {
  private static _instance: CommandInspector;

  public static get instance(): CommandInspector {
    if (!this._instance) {
      this._instance = new CommandInspector();
    }
    return this._instance;
  }

  getTypeInfo(): TypeInfo {
    return {
      category: "",
      name: "Command",
      icon: "magic",
      color: getProjectColor("gray", 5),
      description: "",
    };
  }

  createData(data?: Partial<T> & Pick<T, "reference">): T {
    return {
      ...super.createData(data),
      ...createCommandData(data),
      ...data,
    } as T;
  }

  getPropertyOrder(propertyPath: string): number {
    if (propertyPath === "waitUntilFinished") {
      return 1000;
    }
    return 0;
  }

  allowVariableProperty(propertyPath: string, _data: T): boolean {
    if (propertyPath === "reference") {
      return false;
    }
    if (propertyPath === "disabled") {
      return false;
    }
    return true;
  }

  isPropertyVisible(propertyPath: string, data: T): boolean {
    if (propertyPath === "disabled") {
      return false;
    }
    if (propertyPath === "waitUntilFinished") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: T,
    value: unknown
  ): string {
    if (propertyPath === "ease") {
      if (value !== undefined) {
        const [easeName] = Object.entries(Ease).find(([, v]) => v === value);
        return getLabel(easeName);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(propertyPath: string, _data?: T): unknown[] {
    if (propertyPath === "ease") {
      return Object.values(Ease);
    }
    return undefined;
  }

  async getPropertyError(
    _propertyPath: string,
    _data: T,
    _value: unknown,
    _docIds: string[]
  ): Promise<string | null> {
    return undefined;
  }
}
