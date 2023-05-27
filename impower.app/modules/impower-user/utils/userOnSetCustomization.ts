import { CustomizationType } from "../../impower-api";
import {
  UserSetCustomizationAction,
  USER_SET_CUSTOMIZATION,
} from "../types/actions/userSetCustomizationAction";

const userOnSetCustomization = (
  onFinished: () => void,
  phraseTags: { [phrase: string]: string[] },
  customizationType: CustomizationType
): UserSetCustomizationAction => {
  return {
    type: USER_SET_CUSTOMIZATION,
    payload: { onFinished, customizationType, phraseTags },
  };
};

export default userOnSetCustomization;
