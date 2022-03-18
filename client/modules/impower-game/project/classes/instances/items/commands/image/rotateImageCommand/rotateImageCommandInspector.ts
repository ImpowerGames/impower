import { TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { RotateToImageCommandData } from "./rotateImageCommandData";

export class RotateToImageCommandInspector extends CommandInspector<RotateToImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Rotate Image",
      icon: "sync-alt",
      color: getProjectColor("pink", 5),
      description: "Rotate an image",
    };
  }

  getSummary(_data: RotateToImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<RotateToImageCommandData> &
      Pick<RotateToImageCommandData, "reference">
  ): RotateToImageCommandData {
    return {
      ...super.createData(data),
      image: "",
      angle: 0,
      duration: 0,
      additive: false,
      ...data,
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: RotateToImageCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
