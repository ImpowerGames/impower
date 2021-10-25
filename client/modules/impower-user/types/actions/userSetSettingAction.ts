import { SettingsType } from "../../../impower-api";
import { RecursivePartial } from "../../../impower-core";
import { SettingsDocument } from "../../../impower-data-store";

export const USER_SET_SETTING = "@impower/user/SET_SETTING";
export interface UserSetSettingAction {
  type: typeof USER_SET_SETTING;
  payload: {
    settingsType: SettingsType;
    doc: RecursivePartial<SettingsDocument>;
  };
}
