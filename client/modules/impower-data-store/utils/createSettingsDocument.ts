import { SettingsDocument } from "../types/documents/settingsDocument";

const createSettingsDocument = (
  doc?: Partial<SettingsDocument>
): SettingsDocument => ({
  _documentType: "SettingsDocument",
  emailMarketing: false,
  nsfwVisible: false,
  ...doc,
});

export default createSettingsDocument;
