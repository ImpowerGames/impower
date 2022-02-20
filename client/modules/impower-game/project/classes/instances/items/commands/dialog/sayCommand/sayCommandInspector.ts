import {
  createDynamicData,
  FileTypeId,
  SayCommandData,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class SayCommandInspector extends CommandInspector<SayCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Dialog",
      name: "Say",
      icon: "comment-dots",
      color: getProjectColor("blue", 5),
      description: "Displays dialog text",
    };
  }

  getSummary(_data: SayCommandData): string {
    return `{character}: {dialogText}`;
  }

  getPropertyCharacterCountLimit(
    propertyPath: string,
    _data: SayCommandData
  ): number {
    if (propertyPath === "dialogText.constant") {
      return Number.MAX_SAFE_INTEGER;
    }
    return undefined;
  }

  isPropertyMultiline(propertyPath: string, _data: SayCommandData): boolean {
    if (propertyPath === "dialogText.constant") {
      return true;
    }
    return undefined;
  }

  createData(
    data?: Partial<SayCommandData> & Pick<SayCommandData, "reference">
  ): SayCommandData {
    return {
      ...super.createData(data),
      dialogUI: createDynamicData({
        parentContainerType: "Construct",
        parentContainerId: "",
        refType: "Construct",
        refTypeId: "Construct",
        refId: "",
      }),
      character: createDynamicData({
        parentContainerType: "Construct",
        parentContainerId: "",
        refType: "Construct",
        refTypeId: "Construct",
        refId: "",
      }),
      dialogText: createDynamicData(""),
      voiceOver: createDynamicData({
        refType: "File",
        refTypeId: FileTypeId.AudioFile,
        refId: "",
      }),
      ...data,
    };
  }
}
