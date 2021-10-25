import { Inspector } from "../../../../../impower-core";
import { createFolderData, FolderData } from "./folderData";

export class FolderInspector implements Inspector<FolderData> {
  private static _instance: FolderInspector;

  public static get instance(): FolderInspector {
    if (!this._instance) {
      this._instance = new FolderInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<FolderData>): FolderData {
    return createFolderData(data);
  }

  getPropertyMenuItems(
    _propertyPath: string,
    _data: FolderData
  ): { [type: string]: string } {
    const menuItems: { [type: string]: string } = {
      Reset: "Reset",
    };
    return menuItems;
  }
}
