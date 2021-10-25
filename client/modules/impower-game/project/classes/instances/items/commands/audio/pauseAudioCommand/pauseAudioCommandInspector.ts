import {
  TypeInfo,
  FileTypeId,
  createTransitionConfig,
  createDynamicData,
  StorageType,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { PauseAudioCommandData } from "./pauseAudioCommandData";

export class PauseAudioCommandInspector extends CommandInspector<PauseAudioCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Audio",
      name: "Pause Audio",
      icon: "pause",
      color: getProjectColor("pink", 5),
      description: "Pause audio",
    };
  }

  getSummary(_data: PauseAudioCommandData): string {
    return `{audio}`;
  }

  createData(
    data?: Partial<PauseAudioCommandData> &
      Pick<PauseAudioCommandData, "reference">
  ): PauseAudioCommandData {
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

  isPropertyVisible(
    propertyPath: string,
    data: PauseAudioCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
