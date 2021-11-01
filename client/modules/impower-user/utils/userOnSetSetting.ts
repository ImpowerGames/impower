import { SettingsType } from "../../impower-api";
import { RecursivePartial } from "../../impower-core";
import { SettingsDocument } from "../../impower-data-store";
import {
  UserSetSettingAction,
  USER_SET_SETTING,
} from "../types/actions/userSetSettingAction";

const userOnSetSetting = (
  onFinished: () => void,
  doc: RecursivePartial<SettingsDocument>,
  settingsType: SettingsType
): UserSetSettingAction => {
  return {
    type: USER_SET_SETTING,
    payload: { settingsType, doc },
  };
};

export default userOnSetSetting;
