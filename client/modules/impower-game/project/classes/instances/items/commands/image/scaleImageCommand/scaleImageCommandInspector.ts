import { TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { ScaleToImageCommandData } from "./scaleImageCommandData";

export class ScaleToImageCommandInspector extends CommandInspector<ScaleToImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Scale Image",
      icon: "expand-arrows-alt",
      color: getProjectColor("pink", 5),
      description: "Scale an image",
    };
  }

  getSummary(_data: ScaleToImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<ScaleToImageCommandData> &
      Pick<ScaleToImageCommandData, "reference">
  ): ScaleToImageCommandData {
    return {
      ...super.createData(data),
      image: "",
      x: 1,
      y: 1,
      duration: 0,
      additive: false,
      ...data,
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: ScaleToImageCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
