import {
  createDynamicData,
  LogCommandData,
  Severity,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class LogCommandInspector extends CommandInspector<LogCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Log",
      icon: "bug",
      color: getProjectColor("gray", 5),
      description: "Displays a message in the debug console",
    };
  }

  getSummary(_data: LogCommandData): string {
    return `{severity}: {message}`;
  }

  createData(
    data?: Partial<LogCommandData> & Pick<LogCommandData, "reference">
  ): LogCommandData {
    return {
      ...super.createData(data),
      severity: Severity.Info,
      message: createDynamicData(""),
      ...data,
    };
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: LogCommandData,
    value: unknown
  ): string {
    if (propertyPath === "severity") {
      if (value) {
        return value as string;
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(propertyPath: string, data?: LogCommandData): unknown[] {
    if (propertyPath === "severity") {
      return Object.values(Severity);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  getPropertyDynamicTypeId(propertyPath: string, data: LogCommandData): string {
    if (propertyPath === "severity") {
      return "SeverityVariable";
    }
    return super.getPropertyDynamicTypeId(propertyPath, data);
  }

  isPropertyMultiline(propertyPath: string, _data: LogCommandData): boolean {
    if (propertyPath === "message") {
      return true;
    }
    return undefined;
  }
}
