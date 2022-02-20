import {
  createDynamicData,
  createTransitionConfig,
  FileTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { PlayAudioCommandData } from "./playAudioCommandData";

export class PlayAudioCommandInspector extends CommandInspector<PlayAudioCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Audio",
      name: "Play Audio",
      icon: "music",
      color: getProjectColor("pink", 5),
      description: "Play audio from file",
    };
  }

  getSummary(_data: PlayAudioCommandData): string {
    return `{audio}`;
  }

  createData(
    data?: Partial<PlayAudioCommandData> &
      Pick<PlayAudioCommandData, "reference">
  ): PlayAudioCommandData {
    return {
      ...super.createData(data),
      audio: createDynamicData({
        refType: "File",
        refTypeId: FileTypeId.AudioFile,
        refId: "",
      }),
      volume: createDynamicData(1),
      transition: createTransitionConfig(),
      loop: createDynamicData(false),
      ...data,
    };
  }

  getPropertyBounds(
    propertyPath: string,
    _data: PlayAudioCommandData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "volume.constant") {
      return {
        min: 0,
        max: 1,
        step: 0.1,
        force: true,
      };
    }
    if (propertyPath === "transition.duration.constant") {
      return {
        min: 0,
      };
    }
    return undefined;
  }

  isPropertyVisible(propertyPath: string, data: PlayAudioCommandData): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
