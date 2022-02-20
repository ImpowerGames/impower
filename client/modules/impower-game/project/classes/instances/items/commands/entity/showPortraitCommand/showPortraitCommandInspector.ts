import {
  createDynamicData,
  FileTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { ShowPortraitCommandData } from "./showPortraitCommandData";

export class ShowPortraitCommandInspector extends CommandInspector<ShowPortraitCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Entity",
      name: "Show Portrait",
      icon: "portrait",
      color: getProjectColor("teal", 5),
      description: "Shows a character portrait",
    };
  }

  getSummary(data: ShowPortraitCommandData): string {
    const { name } = data;
    if (name) {
      return `${name}`;
    }
    return "";
  }

  createData(
    data?: Partial<ShowPortraitCommandData> &
      Pick<ShowPortraitCommandData, "reference">
  ): ShowPortraitCommandData {
    return {
      ...super.createData(data),
      name: `MyPortrait`,
      stage: createDynamicData({
        parentContainerType: "Construct",
        parentContainerId: "",
        refType: "Construct",
        refTypeId: "Construct",
        refId: "",
      }),
      position: createDynamicData({
        parentContainerType: "Construct",
        parentContainerId: "",
        refType: "Element",
        refTypeId: "ShapeElement",
        refId: "",
      }),
      image: createDynamicData({
        refType: "File",
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      ...data,
    };
  }
}
