import {
  TypeInfo,
  FileTypeId,
  createTransitionConfig,
  createDynamicData,
  StorageType,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { ResumeAudioCommandData } from "./resumeAudioCommandData";

export class ResumeAudioCommandInspector extends CommandInspector<ResumeAudioCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Audio",
      name: "Resume Audio",
      icon: "step-forward",
      color: getProjectColor("pink", 5),
      description: "Resume audio",
    };
  }

  getSummary(_data: ResumeAudioCommandData): string {
    return `{audio}`;
  }

  createData(
    data?: Partial<ResumeAudioCommandData> &
      Pick<ResumeAudioCommandData, "reference">
  ): ResumeAudioCommandData {
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
    data: ResumeAudioCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
