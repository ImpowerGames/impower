import { getLabel } from "../../../../../../../../impower-config";
import {
  IterationMode,
  SelectCommandData,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class SelectCommandInspector extends CommandInspector<SelectCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "Select",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Selects one child command and executes it",
    };
  }

  getSummary(_data: SelectCommandData): string {
    return `{`;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: SelectCommandData,
    value: unknown
  ): string {
    if (propertyPath === "mode") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(
    propertyPath: string,
    data?: SelectCommandData
  ): unknown[] {
    if (propertyPath === "mode") {
      return Object.keys(IterationMode);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  createData(
    data?: Partial<SelectCommandData> & Pick<SelectCommandData, "reference">
  ): SelectCommandData {
    return {
      ...super.createData(data),
      mode: IterationMode.Stopping,
      randomized: false,
      ...data,
    };
  }
}
