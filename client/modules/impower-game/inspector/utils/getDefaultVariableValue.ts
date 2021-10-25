import { Color, Vector2 } from "../../../impower-core";
import {
  ContainerType,
  VariableTypeId,
  FileTypeId,
  VariableReference,
  BlockReference,
  ConstructReference,
  ImageFileReference,
  AudioFileReference,
  VideoFileReference,
  TextFileReference,
  StorageType,
} from "../../data";

export const getDefaultVariableValue = (
  variableReference: VariableReference
): unknown | null => {
  switch (variableReference.refTypeId as VariableTypeId) {
    case VariableTypeId.BlockVariable:
      return {
        parentContainerType: ContainerType.Block,
        parentContainerId: "",
        refType: ContainerType.Block,
        refTypeId: ContainerType.Block,
        refId: "",
      } as BlockReference;
    case VariableTypeId.ConstructVariable:
      return {
        parentContainerType: ContainerType.Construct,
        parentContainerId: "",
        refType: ContainerType.Construct,
        refTypeId: ContainerType.Construct,
        refId: "",
      } as ConstructReference;
    case VariableTypeId.ImageVariable:
      return {
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      } as ImageFileReference;
    case VariableTypeId.AudioVariable:
      return {
        refType: StorageType.File,
        refTypeId: FileTypeId.AudioFile,
        refId: "",
      } as AudioFileReference;
    case VariableTypeId.VideoVariable:
      return {
        refType: StorageType.File,
        refTypeId: FileTypeId.VideoFile,
        refId: "",
      } as VideoFileReference;
    case VariableTypeId.TextVariable:
      return {
        refType: StorageType.File,
        refTypeId: FileTypeId.TextFile,
        refId: "",
      } as TextFileReference;
    case VariableTypeId.ColorVariable:
      return { h: 0, s: 0, l: 0, a: 1 } as Color;
    case VariableTypeId.Vector2Variable:
      return { x: 0, y: 0 } as Vector2;
    case VariableTypeId.BooleanVariable:
      return false;
    case VariableTypeId.NumberVariable:
      return 0;
    case VariableTypeId.StringVariable:
      return "";
    default:
      return null;
  }
};
