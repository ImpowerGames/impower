import { SettingsType } from "../../../impower-api";
import { SettingsDocument } from "../../../impower-data-store";

export const USER_LOAD_SETTINGS = "impower/user/USER_LOAD_SETTINGS";
export interface UserLoadSettingsAction {
  type: typeof USER_LOAD_SETTINGS;
  payload: {
    settings: {
      [settingsType in SettingsType]: SettingsDocument;
    };
  };
}
