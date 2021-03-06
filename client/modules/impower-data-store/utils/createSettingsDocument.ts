import { SettingsDocument } from "../types/documents/settingsDocument";

const createSettingsDocument = (
  doc?: Partial<SettingsDocument>
): SettingsDocument => ({
  _documentType: "SettingsDocument",
  nsfwVisible: false,
  nsfwBlurred: true,
  emailMarketing: false,
  emailNotifications: false,
  appNotifications: false,
  contactMethod: "email",
  contact: "",
  ...doc,
});

export default createSettingsDocument;
