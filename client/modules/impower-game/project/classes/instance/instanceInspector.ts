import { getLabel } from "../../../../impower-config";
import {
  getParentPropertyPath,
  getValue,
  Inspector,
  isActivable,
  isColor,
  isNameable,
  isOptional,
} from "../../../../impower-core";
import {
  createInstanceData,
  InstanceData,
  isDynamicData,
  isInstanceData,
  isReference,
  Permission,
  TypeInfo,
} from "../../../data";

export abstract class InstanceInspector<T extends InstanceData = InstanceData>
  implements Inspector<T>
{
  abstract getTypeInfo(_data?: T): TypeInfo;

  validate(data?: T): T {
    return data;
  }

  createData(data?: Partial<T> & Pick<T, "reference">): T {
    return { ...createInstanceData(data), ...data } as T;
  }

  getName(_data?: T): string {
    return this.getTypeInfo(_data).name;
  }

  getSummary(data: T): string {
    if (isNameable(data)) {
      return data.name;
    }
    return "";
  }

  isPropertyVisible(propertyPath: string, data: T): boolean {
    if (propertyPath === "reference") {
      return false;
    }
    if (propertyPath.endsWith(".reference")) {
      const parentPath = getParentPropertyPath(propertyPath);
      const parentValue = getValue(data, parentPath);
      if (isInstanceData(parentValue)) {
        return false;
      }
    }
    if (propertyPath.endsWith(".dynamic") && !getValue(data, propertyPath)) {
      const parentPath = getParentPropertyPath(propertyPath);
      const parentValue = getValue(data, parentPath);
      if (isDynamicData(parentValue)) {
        return false;
      }
    }
    return undefined;
  }

  getPropertyOptions(_propertyPath: string, _data?: T): unknown[] {
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: T): string {
    const properties = propertyPath.split(".");
    const targetProperty = properties[properties.length - 1];
    if (targetProperty) {
      const label = getLabel(targetProperty);
      const value = getValue(data, propertyPath);
      if (isDynamicData(value) && value.dynamic) {
        if (value.dynamic.refType === "Variable") {
          return `${label} (Variable)`;
        }
      }
      return label;
    }
    return "";
  }

  getPropertyDisplayValue(
    _propertyPath: string,
    _data: T,
    _value: unknown
  ): string {
    return undefined;
  }

  getPropertyValueDescription(
    propertyPath: string,
    data: T,
    value: unknown
  ): string {
    if (isActivable(value)) {
      if (!value.active) {
        return "";
      }
      return `(${Object.entries(value.value)
        .filter(
          ([k, v]) =>
            v !== undefined &&
            v !== null &&
            this.isPropertyVisible(`${propertyPath}.value.${k}`, data)
        )
        .map(([k]) => `{${propertyPath}.value.${k}}`)
        .join(", ")})`;
    }
    if (isOptional(value)) {
      if (value.useDefault) {
        return "";
      }
      return `(${Object.entries(value.value)
        .filter(
          ([k, v]) =>
            v !== undefined &&
            v !== null &&
            this.isPropertyVisible(`${propertyPath}.value.${k}`, data)
        )
        .map(([k]) => `{${propertyPath}.value.${k}}`)
        .join(", ")})`;
    }
    if (isDynamicData(value)) {
      return `{${propertyPath}}`;
    }
    if (typeof value === "object") {
      return `(${Object.entries(value)
        .filter(
          ([k, v]) =>
            v !== undefined &&
            v !== null &&
            this.isPropertyVisible(`${propertyPath}.${k}`, data)
        )
        .map(([k]) => `{${propertyPath}.${k}}`)
        .join(", ")})`;
    }
    return undefined;
  }

  getPropertyPermission(_propertyPath: string, _data: T): Permission {
    return Permission.Access;
  }

  getPropertyDynamicTypeId(propertyPath: string, data: T): string {
    const value = getValue(data, propertyPath);
    if (isDynamicData(value)) {
      if (typeof value.constant === "boolean") {
        return "BooleanVariable";
      }
      if (typeof value.constant === "number") {
        return "NumberVariable";
      }
      if (typeof value.constant === "string") {
        return "StringVariable";
      }
      if (isColor(value.constant)) {
        return "ColorVariable";
      }
      if (isReference(value.constant)) {
        return `${value.constant.refTypeId}Variable`;
      }
    }
    return "";
  }

  getPropertyMoreIcon(propertyPath: string, data: T): string {
    const value = getValue(data, propertyPath);
    const isUsingDynamicValue = isDynamicData(value) && value.dynamic;
    if (isUsingDynamicValue) {
      return "atom";
    }
    return undefined;
  }

  getPropertyMenuItems(
    propertyPath: string,
    data: T
  ): { [type: string]: string } {
    const value = getValue(data, propertyPath);
    const menuItems: { [type: string]: string } = {
      Reset: "Reset",
    };
    if (isDynamicData(value)) {
      if (value.dynamic) {
        menuItems.UseConstantValue = "Use Constant Value";
      }
      if (!value.dynamic) {
        menuItems.UseVariableValue = "Use Variable Value";
      }
    }
    return menuItems;
  }

  isExternalFileAllowed(_propertyPath: string, _data: T): boolean {
    return true;
  }

  getPropertyError(
    _propertyPath: string,
    _data: T,
    _value: unknown,
    _docIds: string[]
  ): Promise<string | null> {
    return null;
  }
}
