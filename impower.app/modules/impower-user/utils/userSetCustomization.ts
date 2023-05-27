import { CustomizationType } from "../../impower-api";
import {
  UserSetCustomizationAction,
  USER_SET_CUSTOMIZATION,
} from "../types/actions/userSetCustomizationAction";

const userSetCustomization = (
  phraseTags: { [phrase: string]: string[] },
  customizationType: CustomizationType
): UserSetCustomizationAction => {
  return {
    type: USER_SET_CUSTOMIZATION,
    payload: { customizationType, phraseTags },
  };
};

export default userSetCustomization;
