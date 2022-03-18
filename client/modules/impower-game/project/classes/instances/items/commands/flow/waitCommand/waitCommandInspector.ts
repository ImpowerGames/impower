import { TypeInfo, WaitCommandData } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class WaitCommandInspector extends CommandInspector<WaitCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Wait",
      icon: "clock",
      color: getProjectColor("red", 5),
      description: "Waits a number of seconds",
    };
  }

  getSummary(_data: WaitCommandData): string {
    return `{seconds}`;
  }

  createData(
    data?: Partial<WaitCommandData> & Pick<WaitCommandData, "reference">
  ): WaitCommandData {
    return {
      ...super.createData(data),
      seconds: 1,
      ...data,
    };
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: WaitCommandData,
    value: unknown
  ): string {
    if (propertyPath === "seconds") {
      if (value < 0) {
        return "∞";
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyBounds(
    propertyPath: string,
    _data: WaitCommandData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "seconds") {
      return {
        min: -1,
      };
    }
    return undefined;
  }
}
