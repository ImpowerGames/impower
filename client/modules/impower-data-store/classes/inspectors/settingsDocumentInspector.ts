import { SettingsDocument } from "../..";
import { Inspector } from "../../../impower-core";
import createSettingsDocument from "../../utils/createSettingsDocument";

export class SettingsDocumentInspector implements Inspector<SettingsDocument> {
  private static _instance: SettingsDocumentInspector;

  public static get instance(): SettingsDocumentInspector {
    if (!this._instance) {
      this._instance = new SettingsDocumentInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<SettingsDocument>): SettingsDocument {
    return createSettingsDocument(data);
  }

  isPropertyDisabled(propertyPath: string, data: SettingsDocument): boolean {
    if (propertyPath === "nsfwBlurred") {
      return !data.nsfwVisible;
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, _data: SettingsDocument): string {
    if (propertyPath === "nsfwVisible") {
      return "Show NSFW content (I'm over 18)";
    }
    if (propertyPath === "nsfwBlurred") {
      return "Blur NSFW images";
    }
    return undefined;
  }
}
