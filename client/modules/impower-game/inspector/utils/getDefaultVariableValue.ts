import { Color, Vector2 } from "../../../impower-core";
import {
  AudioFileReference,
  BlockReference,
  ConstructReference,
  FileTypeId,
  ImageFileReference,
  TextFileReference,
  VariableReference,
  VariableTypeId,
  VideoFileReference,
} from "../../data";

export const getDefaultVariableValue = (
  variableReference: VariableReference
): unknown | null => {
  switch (variableReference.refTypeId as VariableTypeId) {
    case "BlockVariable":
      return {
        parentContainerType: "Block",
        parentContainerId: "",
        refType: "Block",
        refTypeId: "Block",
        refId: "",
      } as BlockReference;
    case "ConstructVariable":
      return {
        parentContainerType: "Construct",
        parentContainerId: "",
        refType: "Construct",
        refTypeId: "Construct",
        refId: "",
      } as ConstructReference;
    case "ImageVariable":
      return {
        refType: "File",
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      } as ImageFileReference;
    case "AudioVariable":
      return {
        refType: "File",
        refTypeId: FileTypeId.AudioFile,
        refId: "",
      } as AudioFileReference;
    case "VideoVariable":
      return {
        refType: "File",
        refTypeId: FileTypeId.VideoFile,
        refId: "",
      } as VideoFileReference;
    case "TextVariable":
      return {
        refType: "File",
        refTypeId: FileTypeId.TextFile,
        refId: "",
      } as TextFileReference;
    case "ColorVariable":
      return { h: 0, s: 0, l: 0, a: 1 } as Color;
    case "Vector2Variable":
      return { x: 0, y: 0 } as Vector2;
    case "BooleanVariable":
      return false;
    case "NumberVariable":
      return 0;
    case "StringVariable":
      return "";
    default:
      return null;
  }
};
