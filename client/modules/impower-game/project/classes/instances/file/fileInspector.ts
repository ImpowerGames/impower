import { Inspector } from "../../../../../impower-core";
import { FileData } from "./fileData";

export abstract class FileInspector implements Inspector<FileData> {
  createData(data?: Partial<FileData>): FileData {
    return { name: "", storageKey: "", fileId: "", ...data };
  }

  isPropertyVisible(propertyPath: string, _data: FileData): boolean {
    if (propertyPath === "storageKey") {
      return false;
    }
    if (propertyPath === "thumbUrl") {
      return false;
    }
    if (propertyPath === "blurUrl") {
      return false;
    }
    if (propertyPath === "fileId") {
      return false;
    }
    if (propertyPath === "fileName") {
      return false;
    }
    if (propertyPath === "fileExtension") {
      return false;
    }
    if (propertyPath === "fileType") {
      return false;
    }
    if (propertyPath === "fileUrl") {
      return false;
    }
    if (propertyPath === "size") {
      return false;
    }
    if (propertyPath === "contentType") {
      return false;
    }
    return true;
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
