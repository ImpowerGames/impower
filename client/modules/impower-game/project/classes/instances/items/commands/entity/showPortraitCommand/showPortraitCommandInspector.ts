import {
  ContainerType,
  createDynamicData,
  ElementTypeId,
  FileTypeId,
  ItemType,
  StorageType,
  TypeInfo,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
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
        parentContainerType: ContainerType.Construct,
        parentContainerId: "",
        refType: ContainerType.Construct,
        refTypeId: ContainerType.Construct,
        refId: "",
      }),
      position: createDynamicData({
        parentContainerType: ContainerType.Construct,
        parentContainerId: "",
        refType: ItemType.Element,
        refTypeId: ElementTypeId.ShapeElement,
        refId: "",
      }),
      image: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      ...data,
    };
  }
}
