import { SettingsType } from "../../impower-api";
import { SettingsDocument } from "../../impower-data-store";
import {
  UserLoadSettingsAction,
  USER_LOAD_SETTINGS,
} from "../types/actions/userLoadSettingsAction";

const userLoadSettings = (settings: {
  [settingsType in SettingsType]: SettingsDocument;
}): UserLoadSettingsAction => {
  return {
    type: USER_LOAD_SETTINGS,
    payload: {
      settings,
    },
  };
};

export default userLoadSettings;
