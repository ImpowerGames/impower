import { ChoiceCommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { executeChoiceCommand } from "./executeChoiceCommand";

export class ChoiceCommandInspector extends CommandInspector<ChoiceCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Screen",
      name: "Choice",
      icon: "comment-dots",
      color: getProjectColor("blue", 5),
      description: "Choices dialog text",
    };
  }

  getSummary(): string {
    return `{content}`;
  }

  getPropertyCharacterCountLimit(
    propertyPath: string,
    _data: ChoiceCommandData
  ): number {
    if (propertyPath === "content") {
      return Number.MAX_SAFE_INTEGER;
    }
    return undefined;
  }

  isPropertyMultiline(propertyPath: string, _data: ChoiceCommandData): boolean {
    if (propertyPath === "content") {
      return true;
    }
    return undefined;
  }

  createData(
    data?: Partial<ChoiceCommandData> & Pick<ChoiceCommandData, "reference">
  ): ChoiceCommandData {
    return {
      ...super.createData(data),
      content: "",
      ...data,
    };
  }

  onPreview(
    data: ChoiceCommandData,
    context?: {
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
    }
  ): boolean {
    executeChoiceCommand(data, context);
    return true;
  }
}
