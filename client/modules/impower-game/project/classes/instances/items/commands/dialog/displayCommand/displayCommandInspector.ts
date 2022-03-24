import {
  DisplayCommandData,
  DisplayPosition,
  DisplayType,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandInspector extends CommandInspector<DisplayCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Screen",
      name: "Display",
      icon: "comment-dots",
      color: getProjectColor("blue", 5),
      description: "Displays dialog text",
    };
  }

  getSummary(data: DisplayCommandData): string {
    if (data.type === DisplayType.Dialogue) {
      if (data.parenthetical) {
        return `{character} {parenthetical}: {content}`;
      }
      return `{character}: {content}`;
    }
    return `{content}`;
  }

  getPropertyCharacterCountLimit(
    propertyPath: string,
    _data: DisplayCommandData
  ): number {
    if (propertyPath === "content") {
      return Number.MAX_SAFE_INTEGER;
    }
    return undefined;
  }

  isPropertyMultiline(
    propertyPath: string,
    _data: DisplayCommandData
  ): boolean {
    if (propertyPath === "content") {
      return true;
    }
    return undefined;
  }

  isPropertyVisible(propertyPath: string, data: DisplayCommandData): boolean {
    if (propertyPath === "position") {
      if (data.type !== DisplayType.Dialogue) {
        return false;
      }
    }
    if (propertyPath === "character") {
      if (data.type !== DisplayType.Dialogue) {
        return false;
      }
    }
    if (propertyPath === "parenthetical") {
      if (data.type !== DisplayType.Dialogue) {
        return false;
      }
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  getPropertyOptions(
    propertyPath: string,
    data?: DisplayCommandData
  ): unknown[] {
    if (propertyPath === "type") {
      return Object.keys(DisplayType);
    }
    if (propertyPath === "position") {
      return Object.keys(DisplayPosition);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  createData(
    data?: Partial<DisplayCommandData> & Pick<DisplayCommandData, "reference">
  ): DisplayCommandData {
    return {
      ...super.createData(data),
      type: DisplayType.Dialogue,
      position: DisplayPosition.Default,
      character: "",
      parenthetical: "",
      content: "",
      assets: [],
      ...data,
    };
  }

  onPreview(
    data: DisplayCommandData,
    context: {
      valueMap: Record<string, unknown>;
    }
  ): void {
    executeDisplayCommand(data, context);
  }
}
