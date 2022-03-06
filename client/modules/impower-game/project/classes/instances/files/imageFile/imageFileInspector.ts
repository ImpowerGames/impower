import { FileInspector } from "../../file/fileInspector";
import { ImageFileData } from "./imageFileData";

export class ImageFileInspector extends FileInspector {
  private static _instance: ImageFileInspector;

  public static get instance(): ImageFileInspector {
    if (!this._instance) {
      this._instance = new ImageFileInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<ImageFileData>): ImageFileData {
    return {
      name: "",
      storageKey: "",
      fileId: "",
      fileType: "image/*",
      ...data,
    };
  }

  getPropertyLabel(propertyPath: string, _data: ImageFileData): string {
    if (propertyPath === "config.frames.active") {
      return "Split Into Frames";
    }
    if (propertyPath === "config.frames.value.frameHeight.useDefault") {
      return "Same As Frame Width";
    }
    return undefined;
  }

  isPropertyCollapsible(propertyPath: string, data: ImageFileData): boolean {
    if (propertyPath === "config.frames") {
      return false;
    }
    return super.isPropertyCollapsible(propertyPath, data);
  }

  getPropertyDefaultValue(propertyPath: string, _data: ImageFileData): unknown {
    if (propertyPath === "config.frames.value.frameHeight") {
      return -1;
    }
    if (propertyPath === "config.frames.value.endFrame") {
      return -1;
    }
    return undefined;
  }

  getPropertyBounds(
    propertyPath: string,
    _data: ImageFileData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "config.frames.value.frameHeight") {
      return { min: -1 };
    }
    if (propertyPath === "config.frames.value.endFrame") {
      return { min: -1 };
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: ImageFileData,
    value: unknown
  ): string {
    if (propertyPath === "config.frames.value.frameHeight" && value === -1) {
      return "Same As Frame Width";
    }
    if (propertyPath === "config.frames.value.endFrame" && value === -1) {
      return "Calculate Automatically";
    }
    return undefined;
  }
}
