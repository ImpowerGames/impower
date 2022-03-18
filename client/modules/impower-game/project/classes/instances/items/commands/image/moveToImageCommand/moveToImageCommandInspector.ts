import { TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { MoveToImageCommandData } from "./moveToImageCommandData";

export class MoveToImageCommandInspector extends CommandInspector<MoveToImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Move Image",
      icon: "arrows-alt",
      color: getProjectColor("pink", 5),
      description: "Move an image",
    };
  }

  getSummary(_data: MoveToImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<MoveToImageCommandData> &
      Pick<MoveToImageCommandData, "reference">
  ): MoveToImageCommandData {
    return {
      ...super.createData(data),
      image: "",
      x: 0,
      y: 0,
      duration: 0,
      additive: false,
      ...data,
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: MoveToImageCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
