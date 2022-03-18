import { TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { ShowImageCommandData } from "./showImageCommandData";

export class ShowImageCommandInspector extends CommandInspector<ShowImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Show Image",
      icon: "image",
      color: getProjectColor("pink", 5),
      description: "Show an image from file",
    };
  }

  getSummary(_data: ShowImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<ShowImageCommandData> &
      Pick<ShowImageCommandData, "reference">
  ): ShowImageCommandData {
    return {
      ...super.createData(data),
      image: "",
      duration: 0,
      x: 0,
      y: 0,
      ...data,
    };
  }

  getPropertyBounds(
    propertyPath: string,
    _data: ShowImageCommandData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "duration") {
      return {
        min: 0,
        force: true,
      };
    }
    return undefined;
  }

  isPropertyVisible(propertyPath: string, data: ShowImageCommandData): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
