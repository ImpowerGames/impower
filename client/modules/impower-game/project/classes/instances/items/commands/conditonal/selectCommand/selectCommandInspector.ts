import {
  SelectCommandData,
  TypeInfo,
  IterationMode,
  createDynamicData,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { getLabel } from "../../../../../../../../impower-config";

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
      return Object.values(IterationMode);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  createData(
    data?: Partial<SelectCommandData> & Pick<SelectCommandData, "reference">
  ): SelectCommandData {
    return {
      ...super.createData(data),
      mode: IterationMode.Stopping,
      randomized: createDynamicData(false),
      ...data,
    };
  }
}
