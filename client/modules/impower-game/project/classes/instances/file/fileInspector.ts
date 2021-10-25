import { TypeInfo } from "../../../../data";
import { getProjectColor } from "../../../../inspector";
import { InstanceInspector } from "../../instance/instanceInspector";
import { createFileData, FileData } from "./fileData";

export abstract class FileInspector extends InstanceInspector<FileData> {
  createData(data?: Partial<FileData>): FileData {
    return createFileData(data);
  }

  getTypeInfo(data?: FileData): TypeInfo {
    return {
      category: "",
      name: data
        ? data.fileType.startsWith("audio/")
          ? "Audio"
          : data.fileType.startsWith("image/")
          ? "Image"
          : data.fileType.startsWith("video/")
          ? "Video"
          : data.fileType.startsWith("text/")
          ? "Text"
          : "File"
        : "File",
      icon: "config",
      color: getProjectColor("pink", 5),
      description: "An asset file",
    };
  }

  isPropertyVisible(propertyPath: string, data: FileData): boolean {
    if (propertyPath === "storageKey") {
      return false;
    }
    if (propertyPath === "thumbUrl") {
      return false;
    }
    if (propertyPath === "blurUrl") {
      return false;
    }
    if (propertyPath === "fileName") {
      return false;
    }
    if (propertyPath === "firebaseStorageDownloadTokens") {
      return false;
    }
    if (propertyPath === "size") {
      return false;
    }
    if (propertyPath === "fileExtension") {
      return false;
    }
    if (propertyPath === "fileType") {
      return false;
    }
    if (propertyPath === "contentType") {
      return false;
    }
    if (propertyPath === "fileUrl") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  getPropertyMenuItems(
    _propertyPath: string,
    _data: FileData
  ): { [type: string]: string } {
    const menuItems: { [type: string]: string } = {
      Reset: "Reset",
    };
    return menuItems;
  }

  isPropertyCollapsible(propertyPath: string, _data: FileData): boolean {
    if (propertyPath === "config") {
      return false;
    }
    return undefined;
  }
}
