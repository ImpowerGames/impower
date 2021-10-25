import { SettingsType } from "../../impower-api";
import { RecursivePartial } from "../../impower-core";
import { SettingsDocument } from "../../impower-data-store";
import {
  UserSetSettingAction,
  USER_SET_SETTING,
} from "../types/actions/userSetSettingAction";

const userSetSetting = (
  settingsType: SettingsType,
  doc: RecursivePartial<SettingsDocument>
): UserSetSettingAction => {
  return {
    type: USER_SET_SETTING,
    payload: { settingsType, doc },
  };
};

export default userSetSetting;
