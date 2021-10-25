import { SettingsDocument } from "../types/documents/settingsDocument";

const isSettingsDocument = (obj: unknown): obj is SettingsDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as SettingsDocument;
  return doc._documentType === "SettingsDocument";
};

export default isSettingsDocument;
