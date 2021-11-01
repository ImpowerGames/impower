import { CustomizationType } from "../../../impower-api";

export const USER_SET_CUSTOMIZATION = "@impower/user/SET_CUSTOMIZATION";
export interface UserSetCustomizationAction {
  type: typeof USER_SET_CUSTOMIZATION;
  payload: {
    onFinished?: () => void;
    customizationType: CustomizationType;
    phraseTags: { [phrase: string]: string[] };
  };
}
