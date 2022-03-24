import { getLabel } from "../../../../impower-config";
import {
  getValue,
  Inspector,
  isActivable,
  isNameable,
  isOptional,
} from "../../../../impower-core";
import { createInstanceData, InstanceData, TypeInfo } from "../../../data";

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

  isPropertyVisible(propertyPath: string, _data: T): boolean {
    if (propertyPath === "reference") {
      return false;
    }
    if (propertyPath === "line") {
      return false;
    }
    return undefined;
  }

  getPropertyOptions(_propertyPath: string, _data?: T): unknown[] {
    return undefined;
  }

  getPropertyLabel(propertyPath: string, _data: T): string {
    const properties = propertyPath.split(".");
    const targetProperty = properties[properties.length - 1];
    if (targetProperty) {
      const label = getLabel(targetProperty);
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

  getPropertyMoreIcon(propertyPath: string, data: T): string {
    return getValue(data, propertyPath);
  }

  getPropertyMenuItems(
    _propertyPath: string,
    _data: T
  ): { [type: string]: string } {
    const menuItems: { [type: string]: string } = {
      Reset: "Reset",
    };
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

  onPreview(
    _data: T,
    _context: {
      valueMap: Record<string, unknown>;
    }
  ): void {
    // NoOp
  }
}
