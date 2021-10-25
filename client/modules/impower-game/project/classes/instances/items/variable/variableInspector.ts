import { getLabel } from "../../../../../../impower-config";
import {
  createVariableData,
  Permission,
  Scope,
  TypeInfo,
  VariableData,
  VariableLifetime,
  VariableReference,
} from "../../../../../data";
import { getVariableLifetimeSymbol } from "../../../../../data/utils/getVariableLifetimeSymbol";
import { getDefaultVariableValue } from "../../../../../inspector/utils/getDefaultVariableValue";
import { getProjectColor } from "../../../../../inspector/utils/getProjectColor";
import { ItemInspector } from "../../item/itemInspector";

export class VariableInspector<
  D extends VariableData = VariableData
> extends ItemInspector<D> {
  private static _instance: VariableInspector;

  public static get instance(): VariableInspector {
    if (!this._instance) {
      this._instance = new VariableInspector();
    }
    return this._instance;
  }

  getTypePrefix(data?: D): string {
    if (data) {
      if (data.lifetime !== VariableLifetime.Temporary) {
        return `${getVariableLifetimeSymbol(data?.lifetime)} `;
      }
    }
    return "";
  }

  getTypeInfo(): TypeInfo {
    return {
      category: "",
      name: `Variable`,
      icon: "{x}",
      color: getProjectColor("orange", 5),
      description: "",
    };
  }

  createValue(reference: VariableReference): unknown {
    if (reference) {
      return getDefaultVariableValue(reference);
    }
    return "";
  }

  createData(data?: Partial<D> & Pick<D, "reference">): D {
    return {
      ...super.createData(data),
      ...createVariableData({
        name: `New${this.getTypeInfo().name}Variable`,
        value: this.createValue(data?.reference),
        ...data,
      }),
    };
  }

  getSummary(data: D): string {
    const { name } = data;
    if (name) {
      return `${name} = {value}`;
    }
    return "";
  }

  isPropertyVisible(propertyPath: string, data: D): boolean {
    if (propertyPath === "permission") {
      return false;
    }
    if (propertyPath === "overrideParentContainerId") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  isPropertyDisabled(propertyPath: string, data: D, docIds: string[]): boolean {
    if (propertyPath === "name") {
      return data.overrideParentContainerId !== docIds[0];
    }
    if (propertyPath === "scope") {
      return data.overrideParentContainerId !== docIds[0];
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: D,
    value: unknown
  ): string {
    if (propertyPath === "scope") {
      return getLabel(value as string);
    }
    if (propertyPath === "lifetime") {
      return getLabel(value as string);
    }
    return undefined;
  }

  getPropertyOptions(propertyPath: string, _data?: D): unknown[] {
    if (propertyPath === "scope") {
      return Object.values(Scope);
    }
    if (propertyPath === "lifetime") {
      return Object.values(VariableLifetime);
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: D): string {
    if (propertyPath === "scope") {
      if (data.permission === Permission.Inherit) {
        return "Inherited By";
      }
      if (data.permission === Permission.Access) {
        return "Accessible To";
      }
    }
    return super.getPropertyLabel(propertyPath, data);
  }
}
