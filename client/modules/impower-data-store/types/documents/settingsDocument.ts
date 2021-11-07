import { DataDocument } from "../../../impower-core";

export interface SettingsDocument extends DataDocument<"SettingsDocument"> {
  _documentType: "SettingsDocument";
  emailMarketing: boolean;
  emailNotifications: boolean;
  appNotifications: boolean;
  nsfwVisible: boolean;
  nsfwBlurred: boolean;
  contactMethod: string;
  contact: string;
}
