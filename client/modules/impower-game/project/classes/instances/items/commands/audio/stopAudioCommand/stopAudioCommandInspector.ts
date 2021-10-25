import {
  TypeInfo,
  FileTypeId,
  createTransitionConfig,
  createDynamicData,
  StorageType,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { StopAudioCommandData } from "./stopAudioCommandData";

export class StopAudioCommandInspector extends CommandInspector<StopAudioCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Audio",
      name: "Stop Audio",
      icon: "stop-circle",
      color: getProjectColor("pink", 5),
      description: "Stop audio from playing",
    };
  }

  getSummary(_data: StopAudioCommandData): string {
    return `{audio}`;
  }

  createData(
    data?: Partial<StopAudioCommandData> &
      Pick<StopAudioCommandData, "reference">
  ): StopAudioCommandData {
    return {
      ...super.createData(data),
      audio: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.AudioFile,
        refId: "",
      }),
      transition: createTransitionConfig(),
      ...data,
    };
  }

  isPropertyVisible(propertyPath: string, data: StopAudioCommandData): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
