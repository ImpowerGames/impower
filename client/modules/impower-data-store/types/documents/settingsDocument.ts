import { DataDocument } from "../../../impower-core";

export interface SettingsDocument extends DataDocument<"SettingsDocument"> {
  _documentType: "SettingsDocument";
  emailMarketing: boolean;
  nsfwVisible: boolean;
}
