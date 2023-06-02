import { Inspector } from "../../../impower-core";
import { SettingsDocument } from "../../types/documents/settingsDocument";
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
    if (propertyPath === "contact") {
      return data.contactMethod === "account";
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: SettingsDocument): string {
    if (propertyPath === "nsfwVisible") {
      return "Show NSFW content (I'm over 18)";
    }
    if (propertyPath === "contactMethod") {
      return "Preferred Contact Method";
    }
    if (propertyPath === "contact") {
      if (data.contactMethod === "account") {
        return "Account Email";
      }
      if (data.contactMethod === "discord") {
        return "Discord Username";
      }
      return "Contact Email";
    }
    if (propertyPath === "contactAccountEmail") {
      return "Use Account Email";
    }
    if (propertyPath === "nsfwBlurred") {
      return "Blur NSFW images";
    }
    return undefined;
  }

  getPropertyOptions(propertyPath: string, _data: SettingsDocument): string[] {
    if (propertyPath === "contactMethod") {
      return ["email", "account", "discord"];
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: SettingsDocument,
    value: unknown
  ): string {
    if (propertyPath === "contactMethod") {
      if (value !== undefined) {
        if (value === "email") {
          return "Contact Email";
        }
        if (value === "account") {
          return "Account Email";
        }
        if (value === "discord") {
          return "Discord";
        }
        return value as string;
      }
    }
    return undefined;
  }

  getPropertyHelperText(propertyPath: string, _data: SettingsDocument): string {
    if (propertyPath === "contact") {
      return "Only visible to your connections";
    }
    return undefined;
  }

  isPropertyRequired(propertyPath: string, _data: SettingsDocument): boolean {
    if (propertyPath === "contact") {
      return true;
    }
    return undefined;
  }

  async getPropertyError(
    propertyPath: string,
    data: SettingsDocument,
    value: string,
    _docIds: string[]
  ): Promise<string | null> {
    if (this?.isPropertyRequired?.(propertyPath, data)) {
      if (!value) {
        return `${this?.getPropertyLabel(propertyPath, data)} is required`;
      }
    }
    if (propertyPath === "contact") {
      if (data.contactMethod === "email") {
        if (!value?.includes("@")) {
          return "Please enter a valid email.";
        }
      }
      if (data.contactMethod === "discord") {
        if (!value?.match(/^.{3,32}#[0-9]{4}$/)) {
          return "Please enter a valid discord username including # and your 4 digit tag.";
        }
      }
    }
    return undefined;
  }
}
